#!/usr/bin/env -S deno run --allow-read
/// <reference lib="deno.ns" />

import {
    evaluateLoadGate,
    type LoadPlan,
    parseEvidenceJsonl,
} from "./load_gate_lib.ts";

if (import.meta.main) {
    if (Deno.args.length !== 3) {
        throw new Error(
            "usage: load_gate.ts <load-plan.json> <evidence.jsonl> <recovery-validated-stage.json>",
        );
    }
    const plan = JSON.parse(await Deno.readTextFile(Deno.args[0])) as LoadPlan;
    const events = parseEvidenceJsonl(await Deno.readTextFile(Deno.args[1]));
    const recoveryStage = JSON.parse(
        await Deno.readTextFile(Deno.args[2]),
    ) as {
        stage?: unknown;
        result?: { passed?: unknown; profileEvidenceDigest?: unknown };
    };
    const expectedDigest = recoveryStage.result?.profileEvidenceDigest;
    if (
        recoveryStage.stage !== "recovery-validated" ||
        recoveryStage.result?.passed !== true ||
        typeof expectedDigest !== "string" ||
        !/^[a-f0-9]{64}$/.test(expectedDigest)
    ) {
        throw new Error("recovery-validated stage evidence is invalid");
    }
    const result = await evaluateLoadGate(plan, events, expectedDigest);
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) Deno.exit(1);
}
