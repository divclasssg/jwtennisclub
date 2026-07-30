/// <reference lib="deno.ns" />

import {
    evaluateLoadGate,
    type LoadEvidenceEvent,
    type LoadPlan,
    parseEvidenceJsonl,
} from "./load_gate_lib.ts";

function assert(
    condition: unknown,
    message = "assertion failed",
): asserts condition {
    if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            `expected ${JSON.stringify(expected)}, got ${
                JSON.stringify(actual)
            }`,
        );
    }
}

async function loadPlan(): Promise<LoadPlan> {
    return JSON.parse(
        await Deno.readTextFile(
            new URL("./load-plan-v1.json", import.meta.url),
        ),
    );
}

function buildPassingEvents(): LoadEvidenceEvent[] {
    const events: LoadEvidenceEvent[] = [{
        schemaVersion: 1,
        kind: "telemetry_capability",
        source: "instrumented_lock_acquisition",
        resolutionMs: 10,
        coverageStartedAt: "2026-07-30T00:00:00.000Z",
        coverageEndedAt: "2026-07-30T00:30:00.000Z",
        approvalId: "telemetry-approval-1",
    }];

    for (let operator = 1; operator <= 5; operator += 1) {
        const sessionId = `operator-${String(operator).padStart(2, "0")}`;
        for (let iteration = 0; iteration < 900; iteration += 1) {
            events.push({
                schemaVersion: 1,
                kind: "request",
                phase: "after",
                sessionId,
                requestType: "operator_poll",
                iteration,
                durationMs: 80,
                status: 200,
                outcome: "ok",
            });
        }
    }

    let commandIndex = 0;
    for (let member = 1; member <= 25; member += 1) {
        const sessionId = `member-${String(member).padStart(2, "0")}`;
        for (let iteration = 0; iteration < 900; iteration += 1) {
            const isRead = iteration % 2 === 0;
            const operationId = isRead
                ? undefined
                : `20260730-${sessionId}-${String(iteration).padStart(4, "0")}`;
            events.push({
                schemaVersion: 1,
                kind: "request",
                phase: "after",
                sessionId,
                requestType: isRead ? "member_read" : "member_command",
                iteration,
                operationId,
                durationMs: 90,
                status: 200,
                outcome: "ok",
            });
            if (!isRead) {
                const lockWaitMs = commandIndex < 10_688 ? 100 : 1000;
                events.push({
                    schemaVersion: 1,
                    kind: "lock_wait",
                    operationId: operationId!,
                    lockWaitMs,
                });
                commandIndex += 1;
            }
        }
    }

    for (const phase of ["baseline", "after"] as const) {
        for (let iteration = 0; iteration < 900; iteration += 1) {
            events.push({
                schemaVersion: 1,
                kind: "request",
                phase,
                sessionId: "web-01",
                requestType: "web",
                iteration,
                durationMs: phase === "baseline" ? 100 : 120,
                status: 200,
                outcome: "ok",
            });
        }
    }

    for (
        const name of [
            "deadlocks",
            "timeouts",
            "server5xx",
            "webTransactionFailures",
        ] as const
    ) {
        events.push(
            {
                schemaVersion: 1,
                kind: "counter",
                phase: "before",
                name,
                value: 10,
            },
            {
                schemaVersion: 1,
                kind: "counter",
                phase: "after",
                name,
                value: 10,
            },
        );
    }

    for (const name of ["cpu", "connections"] as const) {
        events.push(
            {
                schemaVersion: 1,
                kind: "resource",
                phase: "before",
                name,
                warningUsageRatio: 0.2,
            },
            {
                schemaVersion: 1,
                kind: "resource",
                phase: "after",
                name,
                warningUsageRatio: 0.69,
            },
        );
    }

    events.push({
        schemaVersion: 1,
        kind: "recovery",
        restoreStartedAt: "2026-07-30T01:00:00.000Z",
        restoreHealthyAt: "2026-07-30T02:00:00.000Z",
        recoveryPointAt: "2026-07-30T00:45:00.000Z",
        latestRestoredOperationAt: "2026-07-30T00:30:00.000Z",
        beforeMemberChecksum: "a".repeat(64),
        afterMemberChecksum: "a".repeat(64),
        beforeMatchChecksum: "b".repeat(64),
        afterMatchChecksum: "b".repeat(64),
    });
    return events;
}

Deno.test("versioned JSONL parser rejects unknown event fields", () => {
    const valid = JSON.stringify({
        schemaVersion: 1,
        kind: "counter",
        phase: "before",
        name: "deadlocks",
        value: 0,
    });
    assertEquals(parseEvidenceJsonl(`${valid}\n`).length, 1);

    let message = "";
    try {
        parseEvidenceJsonl(
            `${
                JSON.stringify({
                    ...JSON.parse(valid),
                    bearerToken: "forbidden",
                })
            }\n`,
        );
    } catch (error) {
        message = error instanceof Error ? error.message : String(error);
    }
    assert(message.includes("unknown field bearerToken"), message);
});

Deno.test("versioned JSONL parser rejects missing and invalid typed fields", () => {
    for (
        const [event, expected] of [
            [{
                schemaVersion: 1,
                kind: "request",
                phase: "after",
                sessionId: "operator-01",
                requestType: "operator_poll",
                iteration: 0,
                status: 200,
                outcome: "ok",
            }, "durationMs"],
            [{
                schemaVersion: 1,
                kind: "counter",
                phase: "during",
                name: "deadlocks",
                value: 0,
            }, "invalid counter phase"],
            [{
                schemaVersion: 1,
                kind: "telemetry_capability",
                source: "pg_stat_activity",
                resolutionMs: 1000,
                coverageStartedAt: "not-a-time",
                coverageEndedAt: "also-not-a-time",
                approvalId: "approval",
            }, "invalid telemetry source"],
        ] as const
    ) {
        let message = "";
        try {
            parseEvidenceJsonl(JSON.stringify(event));
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }
        assert(message.includes(expected), `${expected}: ${message}`);
    }
});

Deno.test("boundary values pass with exact deterministic session counts", async () => {
    const result = evaluateLoadGate(await loadPlan(), buildPassingEvents());
    assertEquals(result.passed, true);
    assertEquals(result.failures, []);
    assertEquals(result.metrics.operatorPollCount, 4500);
    assertEquals(result.metrics.memberReadCount, 11_250);
    assertEquals(result.metrics.memberCommandCount, 11_250);
    assertEquals(result.metrics.webBaselineP95Ms, 100);
    assertEquals(result.metrics.webAfterP95Ms, 120);
    assertEquals(result.metrics.webP95RegressionRatio, 0.2);
    assertEquals(result.metrics.lockP95Ms, 100);
    assertEquals(result.metrics.lockMaxMs, 1000);
    assertEquals(result.metrics.rtoMinutes, 60);
    assertEquals(result.metrics.rpoMinutes, 15);
});

Deno.test("one missing operator poll fails the exact-count gate", async () => {
    const events = buildPassingEvents();
    const missingIndex = events.findIndex((event) =>
        event.kind === "request" &&
        event.sessionId === "operator-03" &&
        event.iteration === 899
    );
    events.splice(missingIndex, 1);
    const result = evaluateLoadGate(await loadPlan(), events);
    assertEquals(result.passed, false);
    assert(
        result.failures.some((failure) =>
            failure.includes("operator-03 expected 900 operator_poll requests")
        ),
    );
});

Deno.test("web p95 above the 20 percent boundary fails", async () => {
    const events = buildPassingEvents().map((event) =>
        event.kind === "request" &&
            event.phase === "after" &&
            event.requestType === "web"
            ? { ...event, durationMs: 121 }
            : event
    );
    const result = evaluateLoadGate(await loadPlan(), events);
    assertEquals(result.passed, false);
    assert(
        result.failures.some((failure) =>
            failure.includes("web p95 regression exceeds 20%")
        ),
    );
});

Deno.test("missing reliable lock capability and samples fail closed", async () => {
    const events = buildPassingEvents().filter((event) =>
        event.kind !== "telemetry_capability" && event.kind !== "lock_wait"
    );
    const result = evaluateLoadGate(await loadPlan(), events);
    assertEquals(result.passed, false);
    assert(
        result.failures.some((failure) =>
            failure.includes("lock telemetry capability")
        ),
    );
    assert(
        result.failures.some((failure) =>
            failure.includes("expected 11250 lock_wait samples")
        ),
    );
});

Deno.test("lock, error delta, resource, RTO, and RPO violations are rejected", async () => {
    const events = buildPassingEvents();
    const firstLock = events.find((event) => event.kind === "lock_wait");
    if (firstLock?.kind === "lock_wait") firstLock.lockWaitMs = 1000.1;
    const deadlockAfter = events.find((event) =>
        event.kind === "counter" &&
        event.name === "deadlocks" &&
        event.phase === "after"
    );
    if (deadlockAfter?.kind === "counter") deadlockAfter.value = 11;
    const cpuAfter = events.find((event) =>
        event.kind === "resource" &&
        event.name === "cpu" &&
        event.phase === "after"
    );
    if (cpuAfter?.kind === "resource") cpuAfter.warningUsageRatio = 0.7;
    const recovery = events.find((event) => event.kind === "recovery");
    if (recovery?.kind === "recovery") {
        recovery.restoreHealthyAt = "2026-07-30T02:00:00.001Z";
        recovery.latestRestoredOperationAt = "2026-07-30T00:29:59.999Z";
    }

    const result = evaluateLoadGate(await loadPlan(), events);
    assertEquals(result.passed, false);
    for (
        const expected of [
            "lock max exceeds 1000ms",
            "deadlocks delta must be zero",
            "cpu warning usage must be below 70%",
            "RTO exceeds 60 minutes",
            "RPO exceeds 15 minutes",
        ]
    ) {
        assert(
            result.failures.some((failure) => failure.includes(expected)),
            `missing failure: ${expected}\n${result.failures.join("\n")}`,
        );
    }
});
