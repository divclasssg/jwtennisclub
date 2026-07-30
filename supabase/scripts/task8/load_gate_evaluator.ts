import type {
    CounterEvent,
    LoadEvidenceEvent,
    LoadGateResult,
    LoadPlan,
    LockWaitEvent,
    RecoveryEvent,
    RequestEvent,
    ResourceEvent,
    TelemetryCapabilityEvent,
} from "./load_gate_lib.ts";

function assertFixedPlan(plan: LoadPlan): void {
    const invalid = plan.schemaVersion !== 1 ||
        plan.planId !== "shared-match-clone-load-v1" ||
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
        plan.web.iterationsPerPhase !== 900;
    if (invalid) {
        throw new Error("load plan does not match version 1 constants");
    }
}

function p95(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

function minutesBetween(later: string, earlier: string): number | null {
    const laterMs = Date.parse(later);
    const earlierMs = Date.parse(earlier);
    if (!Number.isFinite(laterMs) || !Number.isFinite(earlierMs)) return null;
    return (laterMs - earlierMs) / 60_000;
}

function expectedSessionId(prefix: string, index: number): string {
    return `${prefix}${String(index).padStart(2, "0")}`;
}

export function evaluateLoadGate(
    plan: LoadPlan,
    events: LoadEvidenceEvent[],
): LoadGateResult {
    assertFixedPlan(plan);
    const failures: string[] = [];
    const requests = events.filter(
        (event): event is RequestEvent => event.kind === "request",
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
        if (
            request.status >= 500 ||
            request.outcome === "timeout" ||
            request.outcome === "failure"
        ) {
            failures.push(`request failure ${key}`);
        }
    }

    for (let index = 1; index <= plan.operator.sessionCount; index += 1) {
        const sessionId = expectedSessionId(plan.operator.sessionPrefix, index);
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
    }

    const commandOperationIds = new Set<string>();
    for (let index = 1; index <= plan.member.sessionCount; index += 1) {
        const sessionId = expectedSessionId(plan.member.sessionPrefix, index);
        const memberRequests = requests.filter((request) =>
            request.phase === "after" && request.sessionId === sessionId &&
            (request.requestType === "member_read" ||
                request.requestType === "member_command")
        );
        if (memberRequests.length !== plan.member.iterationsPerSession) {
            failures.push(
                `${sessionId} expected ${plan.member.iterationsPerSession} member requests, got ${memberRequests.length}`,
            );
        }
        const reads = memberRequests.filter((request) =>
            request.requestType === "member_read"
        );
        const commands = memberRequests.filter((request) =>
            request.requestType === "member_command"
        );
        if (
            reads.length !== plan.member.readsPerSession ||
            commands.length !== plan.member.commandsPerSession
        ) {
            failures.push(`${sessionId} member read/command mix is incomplete`);
        }
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
                if (!request.operationId) {
                    failures.push(
                        `${sessionId} command is missing operation ID`,
                    );
                } else if (commandOperationIds.has(request.operationId)) {
                    failures.push(
                        `duplicate operation ID ${request.operationId}`,
                    );
                } else {
                    commandOperationIds.add(request.operationId);
                }
            }
        }
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
    }

    const webBaselineP95Ms = p95(webBaseline.map((event) => event.durationMs));
    const webAfterP95Ms = p95(webAfter.map((event) => event.durationMs));
    const webP95RegressionRatio = webBaselineP95Ms !== null &&
            webAfterP95Ms !== null && webBaselineP95Ms > 0
        ? (webAfterP95Ms - webBaselineP95Ms) / webBaselineP95Ms
        : null;
    if (
        webAfterP95Ms === null ||
        webAfterP95Ms > plan.thresholds.webAbsoluteP95Ms
    ) {
        failures.push("absolute web p95 exceeds 500ms or is missing");
    }
    if (
        webP95RegressionRatio === null ||
        webP95RegressionRatio > plan.thresholds.webP95RegressionRatio + 1e-12
    ) {
        failures.push("web p95 regression exceeds 20% or is missing");
    }

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
        const coverageMinutes = minutesBetween(
            capability.coverageEndedAt,
            capability.coverageStartedAt,
        );
        if (
            capability.source !== plan.lockTelemetry.requiredSource ||
            capability.resolutionMs > plan.lockTelemetry.maximumResolutionMs ||
            coverageMinutes === null ||
            coverageMinutes * 60 < plan.lockTelemetry.minimumCoverageSeconds
        ) {
            failures.push("lock telemetry capability is insufficient");
        }
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
    const lockOperationIds = new Set(
        lockEvents.map((event) => event.operationId),
    );
    if (
        lockOperationIds.size !== lockEvents.length ||
        [...lockOperationIds].some((operationId) =>
            !commandOperationIds.has(operationId)
        )
    ) {
        failures.push("lock_wait samples do not map one-to-one to commands");
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
        ) {
            failures.push(`${counterName} delta must be zero`);
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
        ) {
            failures.push(`${resourceName} warning usage must be below 70%`);
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
        rtoMinutes = minutesBetween(
            recovery.restoreHealthyAt,
            recovery.restoreStartedAt,
        );
        rpoMinutes = minutesBetween(
            recovery.recoveryPointAt,
            recovery.latestRestoredOperationAt,
        );
        if (
            rtoMinutes === null || rtoMinutes < 0 ||
            rtoMinutes > plan.thresholds.rtoMinutes
        ) {
            failures.push("RTO exceeds 60 minutes or is invalid");
        }
        if (
            rpoMinutes === null || rpoMinutes < 0 ||
            rpoMinutes > plan.thresholds.rpoMinutes
        ) {
            failures.push("RPO exceeds 15 minutes or is invalid");
        }
        if (
            recovery.beforeMemberChecksum !== recovery.afterMemberChecksum ||
            recovery.beforeMatchChecksum !== recovery.afterMatchChecksum
        ) {
            failures.push("restore before/after checksums do not match");
        }
    }

    return {
        passed: failures.length === 0,
        failures,
        metrics: {
            operatorPollCount:
                requests.filter((request) =>
                    request.requestType === "operator_poll" &&
                    request.phase === "after"
                ).length,
            memberReadCount:
                requests.filter((request) =>
                    request.requestType === "member_read" &&
                    request.phase === "after"
                ).length,
            memberCommandCount:
                requests.filter((request) =>
                    request.requestType === "member_command" &&
                    request.phase === "after"
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
