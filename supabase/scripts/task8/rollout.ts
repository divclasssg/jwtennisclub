#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-sys
/// <reference lib="deno.ns" />

import {
    BACKEND_PRODUCT_SHA,
    bootstrapCloneProvenance,
    captureValidatedDatabaseIdentity,
    CLIENT_PRODUCT_SHA,
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
    configuredProjectDbTarget,
    fetchManagementProjectIdentity,
    type ProjectDbTarget,
    validateBoundServerIdentityRecord,
} from "./connection_binding_lib.ts";
import { runDirectRpcGate, runEdgeReplacementGate } from "./remote_gate_lib.ts";
import { runIosGates } from "./ios_gate_lib.ts";
import {
    appendStageEvidence,
    commandStreamEvidence,
    expectedIdentityDigest,
    type GateStage,
    readStageCursor,
} from "./stage_evidence_lib.ts";

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

function rolloutDbTarget(projectRef: string): ProjectDbTarget {
    return configuredProjectDbTarget(projectRef, {
        poolerUrl: Deno.env.get("TASK8_DB_SESSION_POOLER_URL") ?? undefined,
        sslRootCert: Deno.env.get("TASK8_DB_SSL_ROOT_CERT") ?? undefined,
    });
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

async function appendInternalStage(options: {
    evidenceRoot: string;
    identity: ExpectedDatabaseIdentity;
    stage: GateStage;
    result: Record<string, unknown> & { passed: true };
}): Promise<void> {
    const cursor = await readStageCursor(options.evidenceRoot);
    const timestamp = new Date().toISOString();
    await appendStageEvidence(options.evidenceRoot, {
        schemaVersion: 1,
        stage: options.stage,
        sequence: cursor.sequence,
        startedAt: timestamp,
        endedAt: timestamp,
        projectRef: options.identity.validationRef,
        identityDigest: await expectedIdentityDigest(options.identity),
        backendHead: BACKEND_PRODUCT_SHA,
        clientHead: CLIENT_PRODUCT_SHA,
        predecessorHash: cursor.predecessorHash,
        command: {
            program: "task8-inventory-validator",
            args: [options.stage],
        },
        stdout: commandStreamEvidence("validated\n"),
        stderr: commandStreamEvidence(""),
        result: options.result,
    });
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
        target: rolloutDbTarget(projectRef),
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
    validateBoundServerIdentityRecord(production, "production");
    if (
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
        validationTarget: rolloutDbTarget(validationRef),
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
        validationTarget: rolloutDbTarget(identity.validationRef),
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
        validationTarget: rolloutDbTarget(storedIdentity.validationRef),
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
    await appendInternalStage({
        evidenceRoot,
        identity: storedIdentity,
        stage: "inventory-validated",
        result: {
            passed: true,
            schemaVersion: inventory.schemaVersion,
            derivedIsolation: inventory.derivedIsolation,
        },
    });
    await appendInternalStage({
        evidenceRoot,
        identity: storedIdentity,
        stage: "recovery-validated",
        result: {
            passed: true,
            physicalBackupsEnabled: inventory.backup.physicalBackupsEnabled,
            pitrEnabled: inventory.backup.pitrEnabled,
            checksumMatch: inventory.recovery.beforeMemberChecksum ===
                    inventory.recovery.afterMemberChecksum &&
                inventory.recovery.beforeMatchChecksum ===
                    inventory.recovery.afterMatchChecksum,
        },
    });
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
        target: rolloutDbTarget(identity.validationRef),
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
        configPath: env("TASK8_IOS_CONFIG_FILE"),
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
