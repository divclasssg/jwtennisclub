#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-sys
/// <reference lib="deno.ns" />

import {
    bootstrapCloneProvenance,
    captureValidatedDatabaseIdentity,
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
import {
    type InventoryValidationContext,
    validateInventoryBundle,
} from "./inventory_lib.ts";
import {
    type BoundServerIdentity,
    captureBoundServerIdentity,
    derivedProjectDbTarget,
    fetchManagementProjectIdentity,
} from "./connection_binding_lib.ts";
import { runDirectRpcGate, runEdgeReplacementGate } from "./remote_gate_lib.ts";
import { runIosGates } from "./ios_gate_lib.ts";

function env(name: string): string {
    const value = Deno.env.get(name)?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

function strictEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`${name} is required`);
    if (value !== value.trim()) {
        throw new Error(`${name} must not contain surrounding whitespace`);
    }
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

async function sha256Text(value: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value),
    );
    return [...new Uint8Array(digest)].map((byte) =>
        byte.toString(16).padStart(2, "0")
    ).join("");
}

async function captureProduction(): Promise<void> {
    const backendRoot = env("BACKEND_ROOT");
    const clientRoot = env("CLIENT_ROOT");
    const projectRef = strictEnv("TASK8_PRODUCTION_REF");
    if (projectRef !== PRODUCTION_REF) {
        throw new Error(
            "TASK8_PRODUCTION_REF must equal the approved production ref",
        );
    }
    const evidenceRoot = await ensureEvidenceRoot(
        env("TASK8_EVIDENCE_ROOT"),
        backendRoot,
        clientRoot,
        env("TOOL_ROOT"),
    );
    const runner = new DenoCommandRunner();
    const managementProject = await fetchManagementProjectIdentity({
        projectRef,
        purpose: "production",
        runner,
        cwd: backendRoot,
    });
    const identity = await captureBoundServerIdentity({
        purpose: "production",
        target: derivedProjectDbTarget(projectRef),
        managementProject,
        runner,
        cwd: backendRoot,
    });
    await writeEvidence(evidenceRoot, "production-identity.json", {
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
        env("TOOL_ROOT"),
    );
    const production = await readPrivateJson<BoundServerIdentity>(
        env("TASK8_PRODUCTION_IDENTITY_FILE"),
    );
    if (
        production.projectRef !== PRODUCTION_REF ||
        production.managementProjectId !== PRODUCTION_REF ||
        production.host !== `db.${PRODUCTION_REF}.supabase.co` ||
        production.user !== "postgres" ||
        production.database !== "postgres" ||
        production.sslMode !== "verify-full" ||
        production.databaseName !== "postgres" ||
        production.serverFingerprintSha256 !==
            await sha256Text(production.systemIdentifier)
    ) {
        throw new Error("production identity file ref mismatch");
    }
    const validationRef = strictEnv("TASK8_VALIDATION_REF");
    const runner = new DenoCommandRunner();
    const managementProject = await fetchManagementProjectIdentity({
        projectRef: validationRef,
        purpose: "validation",
        runner,
        cwd: backendRoot,
    });
    const identity = await bootstrapCloneProvenance({
        backendRoot,
        clientRoot,
        validationTarget: derivedProjectDbTarget(validationRef),
        managementProject,
        validationRef,
        productionSystemIdentifier: production.systemIdentifier,
        sourceSnapshotAt: env("TASK8_SOURCE_SNAPSHOT_AT"),
        provenanceId: env("TASK8_PROVENANCE_ID"),
        approvalId: env("TASK8_APPROVAL_ID"),
        approval: env("TASK8_BOOTSTRAP_APPROVAL"),
        runner,
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
    const backendRoot = env("BACKEND_ROOT");
    const clientRoot = env("CLIENT_ROOT");
    const evidenceRoot = await ensureEvidenceRoot(
        env("TASK8_EVIDENCE_ROOT"),
        backendRoot,
        clientRoot,
        env("TOOL_ROOT"),
    );
    const identity = await readPrivateJson<ExpectedDatabaseIdentity>(
        env("TASK8_IDENTITY_FILE"),
    );
    await executeRolloutStep({
        step,
        backendRoot,
        clientRoot,
        validationTarget: derivedProjectDbTarget(identity.validationRef),
        expectedIdentity: identity,
        evidenceRoot,
        dryRunHash: step === "db-apply"
            ? strictEnv("TASK8_DRY_RUN_HASH")
            : undefined,
        approval: step === "release-enable"
            ? Deno.env.get("TASK8_RELEASE_APPROVAL")
            : Deno.env.get("TASK8_APPLY_APPROVAL"),
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
        env("TOOL_ROOT"),
    );
    const storedIdentity = await readPrivateJson<ExpectedDatabaseIdentity>(
        env("TASK8_IDENTITY_FILE"),
    );
    const runner = new DenoCommandRunner();
    const liveIdentity = await captureValidatedDatabaseIdentity({
        step: "inventory",
        backendRoot,
        clientRoot,
        validationTarget: derivedProjectDbTarget(storedIdentity.validationRef),
        expectedIdentity: storedIdentity,
        evidenceRoot,
        runner,
    });
    const inventory = validateInventoryBundle(
        await readPrivateJson<unknown>(env("TASK8_INVENTORY_FILE")),
        {
            storedIdentity,
            liveIdentity,
            productionInventory: await readPrivateJson<
                InventoryValidationContext["productionInventory"]
            >(env("TASK8_PRODUCTION_INVENTORY_FILE")),
        },
    );
    await writeEvidence(evidenceRoot, "inventory-v1.json", inventory);
    await writeEvidenceManifest(evidenceRoot);
}

async function remoteGate(
    action: "direct-rpc" | "edge-replace",
): Promise<void> {
    const backendRoot = env("BACKEND_ROOT");
    const clientRoot = env("CLIENT_ROOT");
    const evidenceRoot = await ensureEvidenceRoot(
        env("TASK8_EVIDENCE_ROOT"),
        backendRoot,
        clientRoot,
        env("TOOL_ROOT"),
    );
    const identity = await readPrivateJson<ExpectedDatabaseIdentity>(
        env("TASK8_IDENTITY_FILE"),
    );
    const options = {
        evidenceRoot,
        backendRoot,
        clientRoot,
        target: derivedProjectDbTarget(identity.validationRef),
        expectedIdentity: identity,
        authConfigRoot: env("TASK8_AUTH_CONFIG_ROOT"),
        payloadRoot: new URL("./rpc-fixtures", import.meta.url).pathname,
        runner: new DenoCommandRunner(),
    };
    if (action === "direct-rpc") await runDirectRpcGate(options);
    else {
        await runEdgeReplacementGate({
            ...options,
            approval: strictEnv("TASK8_EDGE_APPROVAL"),
        });
    }
}

async function iosGates(): Promise<void> {
    const backendRoot = env("BACKEND_ROOT");
    const clientRoot = env("CLIENT_ROOT");
    const evidenceRoot = await ensureEvidenceRoot(
        env("TASK8_EVIDENCE_ROOT"),
        backendRoot,
        clientRoot,
        env("TOOL_ROOT"),
    );
    await runIosGates({
        evidenceRoot,
        clientRoot,
        expectedIdentity: await readPrivateJson<ExpectedDatabaseIdentity>(
            env("TASK8_IDENTITY_FILE"),
        ),
        runner: new DenoCommandRunner(),
    });
}

if (import.meta.main) {
    const action = Deno.args[0];
    if (action === "capture-production") await captureProduction();
    else if (action === "bootstrap-provenance") await bootstrap();
    else if (action === "validate-inventory") await validateInventory();
    else if (action === "direct-rpc" || action === "edge-replace") {
        await remoteGate(action);
    } else if (action === "ios-gates") await iosGates();
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
            "usage: rollout.ts capture-production|bootstrap-provenance|validate-inventory|db-dry-run|inventory|lock-capability|db-apply|direct-rpc|edge-replace|ios-gates|release-enable|release-disable|removal-proof",
        );
    }
}
