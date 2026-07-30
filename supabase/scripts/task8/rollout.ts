#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-sys
/// <reference lib="deno.ns" />

import {
    bootstrapCloneProvenance,
    DenoCommandRunner,
    executeRolloutStep,
    type ExpectedDatabaseIdentity,
    PRODUCTION_REF,
    type RolloutStep,
} from "./rollout_lib.ts";
import {
    ensureEvidenceRoot,
    writeEvidence,
    writeEvidenceManifest,
} from "./evidence_lib.ts";
import { validateInventoryBundle } from "./inventory_lib.ts";

function env(name: string): string {
    const value = Deno.env.get(name)?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

async function readPrivateJson<T>(path: string): Promise<T> {
    const canonical = await Deno.realPath(path);
    const mode = (await Deno.stat(canonical)).mode;
    if (mode === null || (mode & 0o077) !== 0) {
        throw new Error(`${path} must not be group/world accessible`);
    }
    return JSON.parse(await Deno.readTextFile(canonical)) as T;
}

function jsonLine<T>(stdout: string): T {
    const line = stdout.split(/\r?\n/).find((candidate) =>
        candidate.trim().startsWith("{")
    );
    if (!line) throw new Error("identity capture returned no JSON");
    return JSON.parse(line) as T;
}

async function captureProduction(): Promise<void> {
    const backendRoot = env("BACKEND_ROOT");
    const clientRoot = env("CLIENT_ROOT");
    if (env("TASK8_PRODUCTION_REF").trim() !== PRODUCTION_REF) {
        throw new Error(
            "TASK8_PRODUCTION_REF must equal the approved production ref",
        );
    }
    const evidenceRoot = await ensureEvidenceRoot(
        env("TASK8_EVIDENCE_ROOT"),
        backendRoot,
        clientRoot,
    );
    const result = await new DenoCommandRunner().run({
        command: "psql",
        args: [
            `service=${env("TASK8_PRODUCTION_PGSERVICE")}`,
            "-X",
            "-A",
            "-t",
            "-v",
            "ON_ERROR_STOP=1",
            "-f",
            new URL("./sql/task8_capture_server_identity.sql", import.meta.url)
                .pathname,
        ],
        cwd: backendRoot,
    });
    if (result.code !== 0) throw new Error(result.stderr || "capture failed");
    const identity = jsonLine<{
        systemIdentifier: string;
        databaseOid: string;
        databaseName: string;
    }>(result.stdout);
    await writeEvidence(evidenceRoot, "production-identity.json", {
        projectRef: PRODUCTION_REF,
        ...identity,
        capturedAt: new Date().toISOString(),
        readOnly: true,
    });
    await writeEvidenceManifest(evidenceRoot);
}

async function bootstrap(): Promise<void> {
    const backendRoot = env("BACKEND_ROOT");
    const clientRoot = env("CLIENT_ROOT");
    const evidenceRoot = await ensureEvidenceRoot(
        env("TASK8_EVIDENCE_ROOT"),
        backendRoot,
        clientRoot,
    );
    const production = await readPrivateJson<{
        projectRef: string;
        systemIdentifier: string;
    }>(env("TASK8_PRODUCTION_IDENTITY_FILE"));
    if (production.projectRef?.trim() !== PRODUCTION_REF) {
        throw new Error("production identity file ref mismatch");
    }
    const identity = await bootstrapCloneProvenance({
        backendRoot,
        clientRoot,
        psqlService: env("TASK8_PGSERVICE"),
        validationRef: env("TASK8_VALIDATION_REF"),
        productionSystemIdentifier: production.systemIdentifier,
        sourceSnapshotAt: env("TASK8_SOURCE_SNAPSHOT_AT"),
        provenanceId: env("TASK8_PROVENANCE_ID"),
        approvalId: env("TASK8_APPROVAL_ID"),
        approval: env("TASK8_BOOTSTRAP_APPROVAL"),
        runner: new DenoCommandRunner(),
    });
    await writeEvidence(
        evidenceRoot,
        "validation-identity.json",
        {
            validationRef: identity.projectRef,
            productionSystemIdentifier: identity.sourceSystemIdentifier,
            validationSystemIdentifier: identity.systemIdentifier,
            databaseOid: identity.databaseOid,
            markerDigest: identity.markerDigest,
            provenanceId: identity.provenanceId,
        } satisfies ExpectedDatabaseIdentity,
    );
    await writeEvidenceManifest(evidenceRoot);
}

async function runStep(step: RolloutStep): Promise<void> {
    const identity = await readPrivateJson<ExpectedDatabaseIdentity>(
        env("TASK8_IDENTITY_FILE"),
    );
    await executeRolloutStep({
        step,
        backendRoot: env("BACKEND_ROOT"),
        clientRoot: env("CLIENT_ROOT"),
        psqlService: env("TASK8_PGSERVICE"),
        expectedIdentity: identity,
        approval: Deno.env.get("TASK8_APPLY_APPROVAL"),
        runner: new DenoCommandRunner(),
    });
}

async function validateInventory(): Promise<void> {
    const backendRoot = env("BACKEND_ROOT");
    const clientRoot = env("CLIENT_ROOT");
    const evidenceRoot = await ensureEvidenceRoot(
        env("TASK8_EVIDENCE_ROOT"),
        backendRoot,
        clientRoot,
    );
    const inventory = validateInventoryBundle(
        await readPrivateJson<unknown>(env("TASK8_INVENTORY_FILE")),
    );
    await writeEvidence(evidenceRoot, "inventory-v1.json", inventory);
    await writeEvidenceManifest(evidenceRoot);
}

if (import.meta.main) {
    const action = Deno.args[0];
    if (action === "capture-production") await captureProduction();
    else if (action === "bootstrap-provenance") await bootstrap();
    else if (action === "validate-inventory") await validateInventory();
    else if (
        [
            "db-dry-run",
            "db-apply",
            "release-enable",
            "release-disable",
            "removal-proof",
            "inventory",
            "lock-capability",
        ].includes(action)
    ) {
        await runStep(action as RolloutStep);
    } else {
        throw new Error(
            "usage: rollout.ts capture-production|bootstrap-provenance|validate-inventory|db-dry-run|inventory|lock-capability|db-apply|release-enable|release-disable|removal-proof",
        );
    }
}
