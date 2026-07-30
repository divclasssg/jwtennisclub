/// <reference lib="deno.ns" />

export interface LoadPlan {
    schemaVersion: 1;
    planId: "shared-match-clone-load-v1";
    fixedSeed: "20260730";
    durationSeconds: 1800;
    operator: {
        sessionPrefix: "operator-";
        sessionCount: 5;
        cadenceMs: 2000;
        iterationsPerSession: 900;
        requestType: "operator_poll";
    };
    member: {
        sessionPrefix: "member-";
        sessionCount: 25;
        cadenceMs: 2000;
        iterationsPerSession: 900;
        requestSequence: ["member_read", "member_command"];
        readsPerSession: 450;
        commandsPerSession: 450;
    };
    web: {
        sessionId: "web-01";
        cadenceMs: 2000;
        iterationsPerPhase: 900;
        phases: ["baseline", "after"];
    };
    lockTelemetry: {
        requiredSource: "instrumented_lock_acquisition";
        maximumResolutionMs: 10;
        samplesPerMemberCommand: 1;
        minimumCoverageSeconds: 1800;
    };
    thresholds: {
        webP95RegressionRatio: 0.2;
        webAbsoluteP95Ms: 500;
        lockP95Ms: 100;
        lockMaxMs: 1000;
        resourceWarningUsageRatioExclusive: 0.7;
        rtoMinutes: 60;
        rpoMinutes: 15;
    };
}

type RequestType =
    | "operator_poll"
    | "member_read"
    | "member_command"
    | "web";
type CounterName =
    | "deadlocks"
    | "timeouts"
    | "server5xx"
    | "webTransactionFailures";
type ResourceName = "cpu" | "connections";

export interface RequestEvent {
    schemaVersion: 1;
    kind: "request";
    phase: "baseline" | "after";
    sessionId: string;
    requestType: RequestType;
    iteration: number;
    operationId?: string;
    durationMs: number;
    status: number;
    outcome: "ok" | "timeout" | "failure";
}

export interface LockWaitEvent {
    schemaVersion: 1;
    kind: "lock_wait";
    operationId: string;
    lockWaitMs: number;
}

export interface TelemetryCapabilityEvent {
    schemaVersion: 1;
    kind: "telemetry_capability";
    source: "instrumented_lock_acquisition";
    resolutionMs: number;
    coverageStartedAt: string;
    coverageEndedAt: string;
    approvalId: string;
}

export interface CounterEvent {
    schemaVersion: 1;
    kind: "counter";
    phase: "before" | "after";
    name: CounterName;
    value: number;
}

export interface ResourceEvent {
    schemaVersion: 1;
    kind: "resource";
    phase: "before" | "after";
    name: ResourceName;
    warningUsageRatio: number;
}

export interface RecoveryEvent {
    schemaVersion: 1;
    kind: "recovery";
    restoreStartedAt: string;
    restoreHealthyAt: string;
    recoveryPointAt: string;
    latestRestoredOperationAt: string;
    beforeMemberChecksum: string;
    afterMemberChecksum: string;
    beforeMatchChecksum: string;
    afterMatchChecksum: string;
}

export type LoadEvidenceEvent =
    | RequestEvent
    | LockWaitEvent
    | TelemetryCapabilityEvent
    | CounterEvent
    | ResourceEvent
    | RecoveryEvent;

export interface LoadGateMetrics {
    operatorPollCount: number;
    memberReadCount: number;
    memberCommandCount: number;
    webBaselineP95Ms: number | null;
    webAfterP95Ms: number | null;
    webP95RegressionRatio: number | null;
    lockP95Ms: number | null;
    lockMaxMs: number | null;
    rtoMinutes: number | null;
    rpoMinutes: number | null;
}

export interface LoadGateResult {
    passed: boolean;
    failures: string[];
    metrics: LoadGateMetrics;
}

const allowedFields: Record<LoadEvidenceEvent["kind"], Set<string>> = {
    request: new Set([
        "schemaVersion",
        "kind",
        "phase",
        "sessionId",
        "requestType",
        "iteration",
        "operationId",
        "durationMs",
        "status",
        "outcome",
    ]),
    lock_wait: new Set([
        "schemaVersion",
        "kind",
        "operationId",
        "lockWaitMs",
    ]),
    telemetry_capability: new Set([
        "schemaVersion",
        "kind",
        "source",
        "resolutionMs",
        "coverageStartedAt",
        "coverageEndedAt",
        "approvalId",
    ]),
    counter: new Set([
        "schemaVersion",
        "kind",
        "phase",
        "name",
        "value",
    ]),
    resource: new Set([
        "schemaVersion",
        "kind",
        "phase",
        "name",
        "warningUsageRatio",
    ]),
    recovery: new Set([
        "schemaVersion",
        "kind",
        "restoreStartedAt",
        "restoreHealthyAt",
        "recoveryPointAt",
        "latestRestoredOperationAt",
        "beforeMemberChecksum",
        "afterMemberChecksum",
        "beforeMatchChecksum",
        "afterMatchChecksum",
    ]),
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireFiniteNumber(
    value: unknown,
    field: string,
    line: number,
): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`line ${line}: ${field} must be a finite number`);
    }
    return value;
}

function requireString(value: unknown, field: string, line: number): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`line ${line}: ${field} must be a non-empty string`);
    }
    return value;
}

function validateParsedEvent(
    value: unknown,
    line: number,
): LoadEvidenceEvent {
    if (!isRecord(value)) {
        throw new Error(`line ${line}: event must be an object`);
    }
    if (value.schemaVersion !== 1) {
        throw new Error(`line ${line}: schemaVersion must equal 1`);
    }
    const kind = value.kind;
    if (typeof kind !== "string" || !(kind in allowedFields)) {
        throw new Error(`line ${line}: unsupported event kind`);
    }
    for (const field of Object.keys(value)) {
        if (!allowedFields[kind as LoadEvidenceEvent["kind"]].has(field)) {
            throw new Error(`line ${line}: unknown field ${field}`);
        }
    }

    if (kind === "request") {
        const phase = requireString(value.phase, "phase", line);
        const requestType = requireString(
            value.requestType,
            "requestType",
            line,
        );
        const outcome = requireString(value.outcome, "outcome", line);
        if (!["baseline", "after"].includes(phase)) {
            throw new Error(`line ${line}: invalid request phase`);
        }
        if (
            !["operator_poll", "member_read", "member_command", "web"].includes(
                requestType,
            )
        ) {
            throw new Error(`line ${line}: invalid requestType`);
        }
        if (!["ok", "timeout", "failure"].includes(outcome)) {
            throw new Error(`line ${line}: invalid request outcome`);
        }
        const iteration = requireFiniteNumber(
            value.iteration,
            "iteration",
            line,
        );
        if (!Number.isInteger(iteration) || iteration < 0) {
            throw new Error(
                `line ${line}: iteration must be a non-negative integer`,
            );
        }
        requireString(value.sessionId, "sessionId", line);
        const durationMs = requireFiniteNumber(
            value.durationMs,
            "durationMs",
            line,
        );
        if (durationMs < 0) {
            throw new Error(`line ${line}: durationMs cannot be negative`);
        }
        const status = requireFiniteNumber(value.status, "status", line);
        if (!Number.isInteger(status) || status < 100 || status > 599) {
            throw new Error(`line ${line}: status must be an HTTP status`);
        }
        if (value.operationId !== undefined) {
            requireString(value.operationId, "operationId", line);
        }
        return value as unknown as RequestEvent;
    }

    if (kind === "lock_wait") {
        requireString(value.operationId, "operationId", line);
        if (requireFiniteNumber(value.lockWaitMs, "lockWaitMs", line) < 0) {
            throw new Error(`line ${line}: lockWaitMs cannot be negative`);
        }
        return value as unknown as LockWaitEvent;
    }

    if (kind === "telemetry_capability") {
        if (value.source !== "instrumented_lock_acquisition") {
            throw new Error(`line ${line}: invalid telemetry source`);
        }
        if (
            requireFiniteNumber(value.resolutionMs, "resolutionMs", line) <= 0
        ) {
            throw new Error(`line ${line}: resolutionMs must be positive`);
        }
        for (const field of ["coverageStartedAt", "coverageEndedAt"]) {
            const timestamp = requireString(value[field], field, line);
            if (!Number.isFinite(Date.parse(timestamp))) {
                throw new Error(
                    `line ${line}: ${field} must be an ISO timestamp`,
                );
            }
        }
        requireString(value.approvalId, "approvalId", line);
        return value as unknown as TelemetryCapabilityEvent;
    }

    if (kind === "counter") {
        if (!["before", "after"].includes(String(value.phase))) {
            throw new Error(`line ${line}: invalid counter phase`);
        }
        if (
            ![
                "deadlocks",
                "timeouts",
                "server5xx",
                "webTransactionFailures",
            ].includes(String(value.name))
        ) {
            throw new Error(`line ${line}: invalid counter name`);
        }
        if (requireFiniteNumber(value.value, "value", line) < 0) {
            throw new Error(`line ${line}: counter value cannot be negative`);
        }
        return value as unknown as CounterEvent;
    }

    if (kind === "resource") {
        if (!["before", "after"].includes(String(value.phase))) {
            throw new Error(`line ${line}: invalid resource phase`);
        }
        if (!["cpu", "connections"].includes(String(value.name))) {
            throw new Error(`line ${line}: invalid resource name`);
        }
        if (
            requireFiniteNumber(
                value.warningUsageRatio,
                "warningUsageRatio",
                line,
            ) < 0
        ) {
            throw new Error(
                `line ${line}: warningUsageRatio cannot be negative`,
            );
        }
        return value as unknown as ResourceEvent;
    }

    for (
        const field of [
            "restoreStartedAt",
            "restoreHealthyAt",
            "recoveryPointAt",
            "latestRestoredOperationAt",
            "beforeMemberChecksum",
            "afterMemberChecksum",
            "beforeMatchChecksum",
            "afterMatchChecksum",
        ]
    ) {
        const item = requireString(value[field], field, line);
        if (
            field.endsWith("At") &&
            !Number.isFinite(Date.parse(item))
        ) {
            throw new Error(`line ${line}: ${field} must be an ISO timestamp`);
        }
        if (field.endsWith("Checksum") && !/^[a-f0-9]{64}$/.test(item)) {
            throw new Error(
                `line ${line}: ${field} must be a SHA-256 checksum`,
            );
        }
    }
    return value as unknown as RecoveryEvent;
}

export function parseEvidenceJsonl(text: string): LoadEvidenceEvent[] {
    const events: LoadEvidenceEvent[] = [];
    for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
        if (rawLine.trim() === "") continue;
        let parsed: unknown;
        try {
            parsed = JSON.parse(rawLine);
        } catch {
            throw new Error(`line ${index + 1}: invalid JSON`);
        }
        events.push(validateParsedEvent(parsed, index + 1));
    }
    return events;
}

export { evaluateLoadGate } from "./load_gate_evaluator.ts";
