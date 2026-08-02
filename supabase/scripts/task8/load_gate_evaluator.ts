import type {
    CounterEvent,
    LoadEvidenceEvent,
    LoadGateResult,
    LoadPlan,
    LockWaitEvent,
    RecoveryEvent,
    RequestEvent,
    ResourceEvent,
    RunWindowEvent,
    TelemetryCapabilityEvent,
} from "./load_gate_lib.ts";
import { validateRecoveryProfile } from "./recovery_profile_lib.ts";
import {
    profileEvidenceDigest,
    recoveryProfileMetrics,
} from "./stage_evidence_lib.ts";

function assertFixedPlan(plan: LoadPlan): void {
    const invalid = plan.schemaVersion !== 2 ||
        plan.planId !== "shared-match-clone-load-v2" ||
        plan.fixedSeed !== "20260730" ||
        plan.durationSeconds !== 1800 ||
        plan.operator.sessionCount !== 5 ||
        plan.operator.cadenceMs !== 2000 ||
        plan.operator.iterationsPerSession !== 900 ||
        plan.member.sessionCount !== 25 ||
        plan.member.cadenceMs !== 2000 ||
        plan.member.iterationsPerSession !== 900 ||
        plan.member.readsPerSession !== 450 ||
        plan.member.commandsPerSession !== 450 ||
        plan.web.iterationsPerPhase !== 900 ||
        plan.cadenceToleranceMs !== 250 ||
        plan.lockTelemetry.requiredInstrumentationPoint !==
            "member_command_lock_acquisition" ||
        Object.values(plan.successStatusByRequestType).some((value) =>
            value.length !== 1 || value[0] !== 200
        ) || plan.thresholds.managedPitrRpoMinutes !== 15 ||
        plan.thresholds.logicalOffsiteRpoMinutes !== 1440 ||
        plan.thresholds.rtoMinutes !== 60;
    if (invalid) {
        throw new Error("load plan does not match version 2 constants");
    }
}

function p95(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

function expectedSessionId(prefix: string, index: number): string {
    return `${prefix}${String(index).padStart(2, "0")}`;
}

function hasExactIterations(
    requests: RequestEvent[],
    count: number,
): boolean {
    const actual = [...new Set(requests.map((request) => request.iteration))]
        .sort((left, right) => left - right);
    return actual.length === count &&
        actual.every((iteration, index) => iteration === index);
}

function validateCadence(
    requests: RequestEvent[],
    startMs: number,
    cadenceMs: number,
    toleranceMs: number,
    label: string,
    failures: string[],
): void {
    for (const request of requests) {
        const expected = startMs + request.iteration * cadenceMs;
        if (Math.abs(Date.parse(request.timestamp) - expected) > toleranceMs) {
            failures.push(
                `${label} violates the 30-minute ${cadenceMs}ms cadence`,
            );
            return;
        }
    }
}

export async function evaluateLoadGate(
    plan: LoadPlan,
    events: LoadEvidenceEvent[],
    expectedProfileEvidenceDigest: string,
    now = new Date(),
): Promise<LoadGateResult> {
    assertFixedPlan(plan);
    const failures: string[] = [];
    const windows = events.filter(
        (event): event is RunWindowEvent => event.kind === "run_window",
    );
    let baselineStartMs = Number.NaN;
    let baselineEndMs = Number.NaN;
    let runStartMs = Number.NaN;
    let runEndMs = Number.NaN;
    for (const phase of ["baseline", "after"] as const) {
        const matches = windows.filter((window) => window.phase === phase);
        if (matches.length !== 1) {
            failures.push(
                `exactly one ${phase} 30-minute run_window record is required`,
            );
            continue;
        }
        const startMs = Date.parse(matches[0].startedAt);
        const endMs = Date.parse(matches[0].endedAt);
        if (
            endMs - startMs !== plan.durationSeconds * 1000 ||
            Date.parse(matches[0].timestamp) !== endMs
        ) {
            failures.push(
                `${phase} run_window must be timestamped at its exact 30-minute end`,
            );
        }
        if (phase === "baseline") {
            baselineStartMs = startMs;
            baselineEndMs = endMs;
        } else {
            runStartMs = startMs;
            runEndMs = endMs;
        }
    }
    if (
        Number.isFinite(baselineEndMs) && Number.isFinite(runStartMs) &&
        baselineEndMs !== runStartMs
    ) {
        failures.push("baseline and after run_windows must be contiguous");
    }

    const requests = events.filter(
        (event): event is RequestEvent => event.kind === "request",
    );
    const expectedOperators = new Set(
        Array.from(
            { length: plan.operator.sessionCount },
            (_, index) =>
                expectedSessionId(plan.operator.sessionPrefix, index + 1),
        ),
    );
    const expectedMembers = new Set(
        Array.from(
            { length: plan.member.sessionCount },
            (_, index) =>
                expectedSessionId(plan.member.sessionPrefix, index + 1),
        ),
    );
    const requestKeys = new Set<string>();
    for (const request of requests) {
        const key = [
            request.phase,
            request.sessionId,
            request.requestType,
            request.iteration,
        ].join(":");
        if (requestKeys.has(key)) {
            failures.push(`duplicate request event ${key}`);
        }
        requestKeys.add(key);
        const correctPair = (request.phase === "after" &&
            request.requestType === "operator_poll" &&
            expectedOperators.has(request.sessionId)) ||
            (request.phase === "after" &&
                ["member_read", "member_command"].includes(
                    request.requestType,
                ) &&
                expectedMembers.has(request.sessionId)) ||
            (request.requestType === "web" &&
                request.sessionId === plan.web.sessionId);
        if (!correctPair) {
            failures.push(`unexpected session or operation ${key}`);
        }
        const allowed = plan.successStatusByRequestType[request.requestType];
        if (
            !(allowed as readonly number[]).includes(request.status) ||
            request.outcome !== "ok"
        ) {
            failures.push(`status/outcome mismatch ${key}`);
        }
    }

    for (const sessionId of expectedOperators) {
        const sessionRequests = requests.filter((request) =>
            request.phase === "after" &&
            request.sessionId === sessionId &&
            request.requestType === "operator_poll"
        );
        if (sessionRequests.length !== plan.operator.iterationsPerSession) {
            failures.push(
                `${sessionId} expected ${plan.operator.iterationsPerSession} operator_poll requests, got ${sessionRequests.length}`,
            );
        }
        if (
            !hasExactIterations(
                sessionRequests,
                plan.operator.iterationsPerSession,
            )
        ) failures.push(`${sessionId} operator iteration set is not exact`);
        validateCadence(
            sessionRequests,
            runStartMs,
            plan.operator.cadenceMs,
            plan.cadenceToleranceMs,
            sessionId,
            failures,
        );
    }

    const commandOperationIds = new Set<string>();
    const commandByOperationId = new Map<string, RequestEvent>();
    for (const sessionId of expectedMembers) {
        const memberRequests = requests.filter((request) =>
            request.phase === "after" && request.sessionId === sessionId &&
            ["member_read", "member_command"].includes(request.requestType)
        );
        if (memberRequests.length !== plan.member.iterationsPerSession) {
            failures.push(
                `${sessionId} expected ${plan.member.iterationsPerSession} member requests, got ${memberRequests.length}`,
            );
        }
        if (
            !hasExactIterations(
                memberRequests,
                plan.member.iterationsPerSession,
            )
        ) failures.push(`${sessionId} member iteration set is not exact`);
        const reads = memberRequests.filter((event) =>
            event.requestType === "member_read"
        );
        const commands = memberRequests.filter((event) =>
            event.requestType === "member_command"
        );
        if (
            reads.length !== plan.member.readsPerSession ||
            commands.length !== plan.member.commandsPerSession
        ) failures.push(`${sessionId} member read/command mix is incomplete`);
        for (const request of memberRequests) {
            const expectedType = plan.member.requestSequence[
                request.iteration % plan.member.requestSequence.length
            ];
            if (request.requestType !== expectedType) {
                failures.push(
                    `${sessionId} iteration ${request.iteration} violates request sequence`,
                );
            }
            if (request.requestType === "member_command") {
                const expectedOperationId = `${plan.fixedSeed}-${sessionId}-${
                    String(request.iteration).padStart(4, "0")
                }`;
                if (request.operationId !== expectedOperationId) {
                    failures.push(
                        `${sessionId} command operation ID is not deterministic`,
                    );
                } else if (commandOperationIds.has(expectedOperationId)) {
                    failures.push(
                        `duplicate operation ID ${expectedOperationId}`,
                    );
                } else {
                    commandOperationIds.add(expectedOperationId);
                    commandByOperationId.set(expectedOperationId, request);
                }
            }
        }
        validateCadence(
            memberRequests,
            runStartMs,
            plan.member.cadenceMs,
            plan.cadenceToleranceMs,
            sessionId,
            failures,
        );
    }

    const webBaseline = requests.filter((request) =>
        request.phase === "baseline" &&
        request.sessionId === plan.web.sessionId &&
        request.requestType === "web"
    );
    const webAfter = requests.filter((request) =>
        request.phase === "after" &&
        request.sessionId === plan.web.sessionId &&
        request.requestType === "web"
    );
    for (
        const [phase, phaseRequests] of [
            ["baseline", webBaseline],
            ["after", webAfter],
        ] as const
    ) {
        if (phaseRequests.length !== plan.web.iterationsPerPhase) {
            failures.push(
                `web ${phase} expected ${plan.web.iterationsPerPhase} requests, got ${phaseRequests.length}`,
            );
        }
        if (!hasExactIterations(phaseRequests, plan.web.iterationsPerPhase)) {
            failures.push(`web ${phase} iteration set is not exact`);
        }
    }
    validateCadence(
        webBaseline,
        baselineStartMs,
        plan.web.cadenceMs,
        plan.cadenceToleranceMs,
        "web baseline",
        failures,
    );
    validateCadence(
        webAfter,
        runStartMs,
        plan.web.cadenceMs,
        plan.cadenceToleranceMs,
        "web after",
        failures,
    );

    const webBaselineP95Ms = p95(webBaseline.map((event) => event.durationMs));
    const webAfterP95Ms = p95(webAfter.map((event) => event.durationMs));
    const webP95RegressionRatio = webBaselineP95Ms !== null &&
            webAfterP95Ms !== null && webBaselineP95Ms > 0
        ? (webAfterP95Ms - webBaselineP95Ms) / webBaselineP95Ms
        : null;
    if (
        webAfterP95Ms === null ||
        webAfterP95Ms > plan.thresholds.webAbsoluteP95Ms
    ) failures.push("absolute web p95 exceeds 500ms or is missing");
    if (
        webP95RegressionRatio === null ||
        webP95RegressionRatio > plan.thresholds.webP95RegressionRatio + 1e-12
    ) failures.push("web p95 regression exceeds 20% or is missing");

    const capabilities = events.filter(
        (event): event is TelemetryCapabilityEvent =>
            event.kind === "telemetry_capability",
    );
    if (capabilities.length !== 1) {
        failures.push(
            "exactly one lock telemetry capability record is required",
        );
    } else {
        const capability = capabilities[0];
        const coverageStartMs = Date.parse(capability.coverageStartedAt);
        const coverageEndMs = Date.parse(capability.coverageEndedAt);
        const requestTimes = requests.filter((request) =>
            request.phase === "after"
        ).map((request) => Date.parse(request.timestamp));
        if (
            capability.source !== plan.lockTelemetry.requiredSource ||
            capability.instrumentationPoint !==
                plan.lockTelemetry.requiredInstrumentationPoint ||
            capability.resolutionMs >
                plan.lockTelemetry.maximumResolutionMs ||
            coverageEndMs - coverageStartMs <
                plan.lockTelemetry.minimumCoverageSeconds * 1000
        ) failures.push("lock telemetry capability is insufficient");
        if (
            Date.parse(capability.timestamp) !== runStartMs ||
            coverageStartMs !== runStartMs ||
            coverageEndMs !== runEndMs
        ) failures.push("telemetry timestamp is stale or does not bracket run");
        if (
            requestTimes.length === 0 ||
            coverageStartMs > Math.min(...requestTimes) ||
            coverageEndMs < Math.max(...requestTimes)
        ) failures.push("telemetry coverage gap in request interval");
    }

    const lockEvents = events.filter(
        (event): event is LockWaitEvent => event.kind === "lock_wait",
    );
    const expectedLockSamples = plan.member.sessionCount *
        plan.member.commandsPerSession *
        plan.lockTelemetry.samplesPerMemberCommand;
    if (lockEvents.length !== expectedLockSamples) {
        failures.push(
            `expected ${expectedLockSamples} lock_wait samples, got ${lockEvents.length}`,
        );
    }
    const lockOperationIds = new Set<string>();
    for (const lock of lockEvents) {
        const command = commandByOperationId.get(lock.operationId);
        if (
            lockOperationIds.has(lock.operationId) || !command ||
            lock.source !== plan.lockTelemetry.requiredSource ||
            lock.instrumentationPoint !==
                plan.lockTelemetry.requiredInstrumentationPoint ||
            lock.resolutionMs > plan.lockTelemetry.maximumResolutionMs ||
            Date.parse(lock.timestamp) !== Date.parse(command.timestamp)
        ) failures.push("lock_wait samples do not map one-to-one to commands");
        lockOperationIds.add(lock.operationId);
    }
    const lockP95Ms = p95(lockEvents.map((event) => event.lockWaitMs));
    const lockMaxMs = lockEvents.length === 0
        ? null
        : Math.max(...lockEvents.map((event) => event.lockWaitMs));
    if (lockP95Ms === null || lockP95Ms > plan.thresholds.lockP95Ms) {
        failures.push("lock p95 exceeds 100ms or is missing");
    }
    if (lockMaxMs === null || lockMaxMs > plan.thresholds.lockMaxMs) {
        failures.push("lock max exceeds 1000ms or is missing");
    }

    for (
        const counterName of [
            "deadlocks",
            "timeouts",
            "server5xx",
            "webTransactionFailures",
        ] as const
    ) {
        const before = events.filter((event): event is CounterEvent =>
            event.kind === "counter" && event.name === counterName &&
            event.phase === "before"
        );
        const after = events.filter((event): event is CounterEvent =>
            event.kind === "counter" && event.name === counterName &&
            event.phase === "after"
        );
        if (
            before.length !== 1 || after.length !== 1 ||
            after[0]?.value - before[0]?.value !== 0
        ) failures.push(`${counterName} delta must be zero`);
        if (
            before.length === 1 && after.length === 1 &&
            (Date.parse(before[0].timestamp) !== runStartMs ||
                Date.parse(after[0].timestamp) !== runEndMs)
        ) {
            failures.push(
                `${counterName} counter timestamps do not bracket after run_window`,
            );
        }
    }

    for (const resourceName of ["cpu", "connections"] as const) {
        const before = events.filter((event): event is ResourceEvent =>
            event.kind === "resource" && event.name === resourceName &&
            event.phase === "before"
        );
        const after = events.filter((event): event is ResourceEvent =>
            event.kind === "resource" && event.name === resourceName &&
            event.phase === "after"
        );
        if (before.length !== 1 || after.length !== 1) {
            failures.push(
                `${resourceName} before/after resource records are required`,
            );
        } else if (
            after[0].warningUsageRatio >=
                plan.thresholds.resourceWarningUsageRatioExclusive
        ) failures.push(`${resourceName} warning usage must be below 70%`);
        if (
            before.length === 1 && after.length === 1 &&
            (Date.parse(before[0].timestamp) !== runStartMs ||
                Date.parse(after[0].timestamp) !== runEndMs)
        ) {
            failures.push(
                `${resourceName} resource timestamps do not bracket after run_window`,
            );
        }
    }

    const recoveryEvents = events.filter(
        (event): event is RecoveryEvent => event.kind === "recovery",
    );
    let rtoMinutes: number | null = null;
    let rpoMinutes: number | null = null;
    if (recoveryEvents.length !== 1) {
        failures.push("exactly one recovery record is required");
    } else {
        const recovery = recoveryEvents[0];
        const backupBeforeMs = Date.parse(recovery.backupCapturedBeforeAt);
        const backupAfterMs = Date.parse(recovery.backupCapturedAfterAt);
        const recoveryEvidenceMs = Date.parse(recovery.timestamp);
        if (
            backupBeforeMs !== runStartMs ||
            backupAfterMs !== runEndMs
        ) failures.push("backup timestamps do not bracket after run_window");
        try {
            const profile = validateRecoveryProfile(
                recovery.recoveryProfile,
                now,
            );
            const actualDigest = await profileEvidenceDigest(profile);
            if (
                !/^[a-f0-9]{64}$/.test(expectedProfileEvidenceDigest) ||
                recovery.profileEvidenceDigest !== actualDigest ||
                recovery.profileEvidenceDigest !== expectedProfileEvidenceDigest
            ) {
                failures.push("profile evidence digest mismatch");
            }
            const metrics = recoveryProfileMetrics(profile);
            rtoMinutes = typeof metrics.rtoMinutes === "number"
                ? metrics.rtoMinutes
                : null;
            rpoMinutes = typeof metrics.rpoMinutes === "number"
                ? metrics.rpoMinutes
                : null;
            if (
                rtoMinutes === null || rtoMinutes < 0 ||
                rtoMinutes > plan.thresholds.rtoMinutes
            ) failures.push("RTO exceeds 60 minutes or is invalid");
            const rpoLimit = profile.profile === "managed-pitr-v1"
                ? plan.thresholds.managedPitrRpoMinutes
                : plan.thresholds.logicalOffsiteRpoMinutes;
            if (
                rpoMinutes === null || rpoMinutes < 0 || rpoMinutes > rpoLimit
            ) {
                failures.push(
                    profile.profile === "managed-pitr-v1"
                        ? "managed PITR RPO exceeds 15 minutes or is invalid"
                        : "logical offsite RPO exceeds 1440 minutes or is invalid",
                );
            }
            if (metrics.checksumMatch !== true) {
                failures.push("restore before/after checksums do not match");
            }
            if (profile.profile === "managed-pitr-v1") {
                const latestRestoredMs = Date.parse(
                    profile.latestRestoredOperationAt,
                );
                const recoveryPointMs = Date.parse(profile.recoveryPointAt);
                const restoreStartMs = Date.parse(profile.restoreStartedAt);
                const restoreHealthyMs = Date.parse(profile.restoreHealthyAt);
                if (
                    latestRestoredMs < runEndMs ||
                    latestRestoredMs > recoveryPointMs ||
                    recoveryPointMs > restoreStartMs ||
                    restoreStartMs > restoreHealthyMs ||
                    restoreHealthyMs > recoveryEvidenceMs
                ) failures.push("recovery timestamps are not monotonic");
            } else {
                if (
                    Date.parse(profile.backupStartedAt) !== backupBeforeMs ||
                    Date.parse(profile.backupCompletedAt) !== backupAfterMs ||
                    Date.parse(profile.hostedRestoreHealthyAt) >
                        recoveryEvidenceMs
                ) failures.push("recovery timestamps are not monotonic");
            }
        } catch (error) {
            failures.push(
                error instanceof Error
                    ? `recovery profile is invalid: ${error.message}`
                    : "recovery profile is invalid",
            );
        }
    }

    return {
        passed: failures.length === 0,
        failures,
        metrics: {
            operatorPollCount:
                requests.filter((event) =>
                    event.requestType === "operator_poll" &&
                    event.phase === "after"
                ).length,
            memberReadCount:
                requests.filter((event) =>
                    event.requestType === "member_read" &&
                    event.phase === "after"
                ).length,
            memberCommandCount:
                requests.filter((event) =>
                    event.requestType === "member_command" &&
                    event.phase === "after"
                ).length,
            webBaselineP95Ms,
            webAfterP95Ms,
            webP95RegressionRatio,
            lockP95Ms,
            lockMaxMs,
            rtoMinutes,
            rpoMinutes,
        },
    };
}
