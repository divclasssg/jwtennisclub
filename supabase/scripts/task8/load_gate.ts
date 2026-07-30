#!/usr/bin/env -S deno run --allow-read
/// <reference lib="deno.ns" />

import {
    evaluateLoadGate,
    type LoadPlan,
    parseEvidenceJsonl,
} from "./load_gate_lib.ts";

if (import.meta.main) {
    if (Deno.args.length !== 2) {
        throw new Error(
            "usage: load_gate.ts <load-plan.json> <evidence.jsonl>",
        );
    }
    const plan = JSON.parse(await Deno.readTextFile(Deno.args[0])) as LoadPlan;
    const events = parseEvidenceJsonl(await Deno.readTextFile(Deno.args[1]));
    const result = evaluateLoadGate(plan, events);
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) Deno.exit(1);
}
