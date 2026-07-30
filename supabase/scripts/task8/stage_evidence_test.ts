/// <reference lib="deno.ns" />

import {
    appendStageEvidence,
    commandStreamEvidence,
    type GateStage,
    verifyApplyApproval,
    verifyReleaseApproval,
} from "./stage_evidence_lib.ts";
import { BACKEND_PRODUCT_SHA, CLIENT_PRODUCT_SHA } from "./identity_lib.ts";

function assert(
    condition: unknown,
    message = "assertion failed",
): asserts condition {
    if (!condition) throw new Error(message);
}

async function assertRejects(
    action: () => Promise<unknown> | unknown,
    expected: string,
): Promise<void> {
    try {
        await action();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(
            message.includes(expected),
            `expected ${expected}, got ${message}`,
        );
        return;
    }
    throw new Error(`expected rejection containing ${expected}`);
}

const ref = "abcdefghijklmnopqrst";
const identityDigest = "1".repeat(64);

async function append(
    root: string,
    stage: GateStage,
    sequence: number,
    predecessorHash: string | null,
) {
    return await appendStageEvidence(root, {
        schemaVersion: 1,
        stage,
        sequence,
        startedAt: `2026-07-30T00:${String(sequence).padStart(2, "0")}:00.000Z`,
        endedAt: `2026-07-30T00:${String(sequence).padStart(2, "0")}:01.000Z`,
        projectRef: ref,
        identityDigest,
        backendHead: BACKEND_PRODUCT_SHA,
        clientHead: CLIENT_PRODUCT_SHA,
        predecessorHash,
        command: { program: "synthetic", args: ["--safe"] },
        stdout: commandStreamEvidence("Bearer must-not-survive\nresult=ok"),
        stderr: commandStreamEvidence(
            "postgresql://postgres:must-not-survive@db.example/postgres",
        ),
        result: { passed: true },
    });
}

Deno.test("stage evidence persists typed redacted output with a hashed chain", async () => {
    const root = await Deno.makeTempDir();
    try {
        await Deno.chmod(root, 0o700);
        const first = await append(root, "db-dry-run", 0, null);
        const second = await append(root, "db-apply", 1, first.entryHash);
        assert(second.ledgerHash !== first.ledgerHash);
        const body = await Deno.readTextFile(second.file);
        assert(!body.includes("must-not-survive"));
        assert(body.includes("[REDACTED]"));
        assert((await Deno.stat(second.file)).mode! % 0o1000 === 0o600);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test("DB apply approval binds the exact dry-run transcript hash", async () => {
    const root = await Deno.makeTempDir();
    try {
        const dryRun = await append(root, "db-dry-run", 0, null);
        const approval =
            `APPLY:${ref}:${dryRun.entryHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`;
        await verifyApplyApproval(root, approval, ref, dryRun.entryHash);
        await assertRejects(
            () => verifyApplyApproval(root, approval, ref, "2".repeat(64)),
            "dry-run transcript hash mismatch",
        );
        await assertRejects(
            () =>
                verifyApplyApproval(
                    root,
                    `APPLY:${ref}:${
                        "3".repeat(64)
                    }:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`,
                    ref,
                    dryRun.entryHash,
                ),
            "explicit apply approval",
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test("release approval rejects missing, stale, and reordered gate evidence", async () => {
    const required: GateStage[] = [
        "db-dry-run",
        "db-apply",
        "direct-rpc",
        "edge-delete-empty",
        "edge-deploy-active",
        "ios-test",
        "ios-build",
    ];
    const root = await Deno.makeTempDir();
    try {
        let predecessor: string | null = null;
        let ledgerHash = "";
        let manifestHash = "";
        for (const [sequence, stage] of required.entries()) {
            const written = await append(root, stage, sequence, predecessor);
            predecessor = written.entryHash;
            ledgerHash = written.ledgerHash;
            manifestHash = written.manifestHash;
        }
        const approval =
            `RELEASE:${ref}:${ledgerHash}:${manifestHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`;
        await verifyReleaseApproval(root, approval, ref, identityDigest);
        await Deno.writeTextFile(`${root}/rogue.json`, "{}\n", {
            mode: 0o600,
        });
        await assertRejects(
            () =>
                verifyReleaseApproval(
                    root,
                    approval,
                    ref,
                    identityDigest,
                ),
            "evidence manifest",
        );
        await Deno.remove(`${root}/rogue.json`);
        await assertRejects(
            () =>
                verifyReleaseApproval(
                    root,
                    `RELEASE:${ref}:${
                        "4".repeat(64)
                    }:${manifestHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`,
                    ref,
                    identityDigest,
                ),
            "release approval",
        );

        const missingRoot = await Deno.makeTempDir();
        try {
            await append(missingRoot, "db-apply", 0, null);
            await assertRejects(
                () =>
                    verifyReleaseApproval(
                        missingRoot,
                        approval,
                        ref,
                        identityDigest,
                    ),
                "missing release gate",
            );
        } finally {
            await Deno.remove(missingRoot, { recursive: true });
        }

        const reorderedRoot = await Deno.makeTempDir();
        try {
            const one = await append(reorderedRoot, "db-dry-run", 0, null);
            const two = await append(
                reorderedRoot,
                "direct-rpc",
                1,
                one.entryHash,
            );
            await append(reorderedRoot, "db-apply", 2, two.entryHash);
            await assertRejects(
                () =>
                    verifyReleaseApproval(
                        reorderedRoot,
                        approval,
                        ref,
                        identityDigest,
                    ),
                "reordered release gate",
            );
        } finally {
            await Deno.remove(reorderedRoot, { recursive: true });
        }
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
