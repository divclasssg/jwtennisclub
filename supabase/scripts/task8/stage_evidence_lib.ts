/// <reference lib="deno.ns" />

import { resolve } from "node:path";
import {
    BACKEND_PRODUCT_SHA,
    CLIENT_PRODUCT_SHA,
    type ExpectedDatabaseIdentity,
} from "./identity_lib.ts";
import { writeEvidence, writeEvidenceManifest } from "./evidence_lib.ts";
import {
    type RecoveryProfile,
    validateRecoveryProfile,
} from "./recovery_profile_lib.ts";

export type GateStage =
    | "db-dry-run"
    | "db-apply"
    | "inventory"
    | "inventory-validated"
    | "recovery-validated"
    | "lock-capability"
    | "direct-rpc"
    | "edge-delete-empty"
    | "edge-deploy-active"
    | "ios-test"
    | "ios-build";

export interface CommandStreamEvidence {
    encoding: "utf-8";
    text: string;
}

export interface StageEvidence {
    schemaVersion: 1;
    stage: GateStage;
    sequence: number;
    startedAt: string;
    endedAt: string;
    projectRef: string;
    identityDigest: string;
    backendHead: string;
    clientHead: string;
    predecessorHash: string | null;
    command: { program: string; args: string[] };
    stdout: CommandStreamEvidence;
    stderr: CommandStreamEvidence;
    result: { passed: boolean; [key: string]: unknown };
}

interface LedgerEntry {
    sequence: number;
    stage: GateStage;
    file: string;
    entryHash: string;
    predecessorHash: string | null;
    projectRef: string;
    identityDigest: string;
    backendHead: string;
    clientHead: string;
    passed: boolean;
}

interface GateLedger {
    schemaVersion: 1;
    entries: LedgerEntry[];
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const REF_PATTERN = /^[a-z]{20}$/;
const TRANSCRIPT_SECRET_PATTERN =
    /(?:postgres(?:ql)?:\/\/|Bearer\s+|(?:password|token|secret|api[_-]?key)\s*[=:]\s*)\S+/gi;

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new Uint8Array(bytes).buffer,
    );
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function sha256File(path: string): Promise<string> {
    return await sha256Bytes(await Deno.readFile(path));
}

function canonicalValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) =>
                    left < right ? -1 : left > right ? 1 : 0
                )
                .map(([key, entry]) => [key, canonicalValue(entry)]),
        );
    }
    return value;
}

export function canonicalProfileJson(profile: RecoveryProfile): string {
    return JSON.stringify(canonicalValue(profile));
}

export async function profileEvidenceDigest(
    profile: RecoveryProfile,
): Promise<string> {
    return await sha256Bytes(
        new TextEncoder().encode(canonicalProfileJson(profile)),
    );
}

export function recoveryProfileMetrics(
    profile: RecoveryProfile,
): Record<string, unknown> {
    const checksumMatch = profile.beforeMemberChecksum ===
            profile.afterMemberChecksum &&
        profile.beforeMatchChecksum === profile.afterMatchChecksum;
    if (profile.profile === "managed-pitr-v1") {
        return {
            profile: profile.profile,
            physicalBackupsEnabled: profile.physicalBackupsEnabled,
            pitrEnabled: profile.pitrEnabled,
            rpoMinutes: (Date.parse(profile.recoveryPointAt) -
                Date.parse(profile.latestRestoredOperationAt)) / 60_000,
            rtoMinutes: (Date.parse(profile.restoreHealthyAt) -
                Date.parse(profile.restoreStartedAt)) / 60_000,
            checksumMatch,
        };
    }
    return {
        profile: profile.profile,
        repository: profile.repository,
        backupId: profile.backupId,
        workflowRunId: profile.workflowRunId,
        encryptedArchiveSha256: profile.encryptedArchiveSha256,
        sourceFingerprintSha256: profile.sourceFingerprintSha256,
        archiveBytes: profile.archiveBytes,
        maxStateCheckGapMinutes: profile.maxStateCheckGapMinutes,
        rpoMinutes: profile.maxStateCheckGapMinutes,
        rtoMinutes: (Date.parse(profile.hostedRestoreHealthyAt) -
            Date.parse(profile.hostedRestoreStartedAt)) / 60_000,
        decryptTestedAt: profile.decryptTestedAt,
        localRestoreTestedAt: profile.localRestoreTestedAt,
        hostedRestoreStartedAt: profile.hostedRestoreStartedAt,
        hostedRestoreHealthyAt: profile.hostedRestoreHealthyAt,
        quarterlyDrillAt: profile.quarterlyDrillAt,
        storageObjectCount: profile.storageObjectCount,
        storageObjectsProtected: profile.storageObjectsProtected,
        checksumMatch,
    };
}

export async function recoveryProfileStageResult(profile: RecoveryProfile) {
    return {
        passed: true as const,
        recoveryProfile: profile,
        profileEvidenceDigest: await profileEvidenceDigest(profile),
        profileMetrics: recoveryProfileMetrics(profile),
    };
}

function assertIso(value: string, label: string): void {
    if (!Number.isFinite(Date.parse(value))) {
        throw new Error(`${label} is invalid`);
    }
}

function validateRecord(record: StageEvidence): void {
    if (
        record.schemaVersion !== 1 ||
        !Number.isInteger(record.sequence) ||
        record.sequence < 0 ||
        !REF_PATTERN.test(record.projectRef) ||
        !HASH_PATTERN.test(record.identityDigest) ||
        record.backendHead !== BACKEND_PRODUCT_SHA ||
        record.clientHead !== CLIENT_PRODUCT_SHA ||
        (record.predecessorHash !== null &&
            !HASH_PATTERN.test(record.predecessorHash)) ||
        record.stdout.encoding !== "utf-8" ||
        record.stderr.encoding !== "utf-8"
    ) {
        throw new Error("stage evidence metadata is invalid");
    }
    assertIso(record.startedAt, "stage start");
    assertIso(record.endedAt, "stage end");
    if (Date.parse(record.endedAt) < Date.parse(record.startedAt)) {
        throw new Error("stage end precedes start");
    }
}

export function commandStreamEvidence(text: string): CommandStreamEvidence {
    return {
        encoding: "utf-8",
        text: text.replace(TRANSCRIPT_SECRET_PATTERN, "[REDACTED]"),
    };
}

async function readLedger(root: string): Promise<GateLedger> {
    try {
        return JSON.parse(
            await Deno.readTextFile(resolve(root, "gate-ledger.json")),
        ) as GateLedger;
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return { schemaVersion: 1, entries: [] };
        }
        throw error;
    }
}

async function verifiedLedger(root: string): Promise<{
    ledger: GateLedger;
    ledgerHash: string;
    records: StageEvidence[];
}> {
    const ledgerPath = resolve(root, "gate-ledger.json");
    const ledger = await readLedger(root);
    if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.entries)) {
        throw new Error("gate ledger is invalid");
    }
    let predecessor: string | null = null;
    let previousEndedAt = Number.NEGATIVE_INFINITY;
    const records: StageEvidence[] = [];
    for (const [index, entry] of ledger.entries.entries()) {
        const expectedFile = `stage-${
            String(index).padStart(2, "0")
        }-${entry.stage}.json`;
        const stagePath = resolve(root, entry.file);
        if (
            entry.sequence !== index ||
            entry.file !== expectedFile ||
            entry.predecessorHash !== predecessor ||
            !HASH_PATTERN.test(entry.entryHash) ||
            entry.entryHash !== await sha256File(stagePath)
        ) {
            throw new Error("gate ledger hash chain is invalid");
        }
        const record = JSON.parse(
            await Deno.readTextFile(stagePath),
        ) as StageEvidence;
        validateRecord(record);
        if (
            record.sequence !== entry.sequence ||
            record.stage !== entry.stage ||
            record.predecessorHash !== entry.predecessorHash ||
            record.projectRef !== entry.projectRef ||
            record.identityDigest !== entry.identityDigest ||
            record.backendHead !== entry.backendHead ||
            record.clientHead !== entry.clientHead ||
            record.result.passed !== entry.passed
        ) {
            throw new Error("gate ledger entry binding is invalid");
        }
        if (Date.parse(record.startedAt) < previousEndedAt) {
            throw new Error("gate ledger stage timestamp is stale");
        }
        previousEndedAt = Date.parse(record.endedAt);
        predecessor = entry.entryHash;
        records.push(record);
    }
    return { ledger, ledgerHash: await sha256File(ledgerPath), records };
}

async function verifyRecoveryProfileStageBinding(
    records: StageEvidence[],
    now: Date,
): Promise<void> {
    const inventory = records[0]?.result;
    const recovery = records[1]?.result;
    if (
        records[0]?.stage !== "inventory-validated" ||
        records[1]?.stage !== "recovery-validated" ||
        inventory.schemaVersion !== 3
    ) {
        throw new Error("recovery profile stages are missing or invalid");
    }
    const inventoryProfile = validateRecoveryProfile(
        inventory.recoveryProfile,
        now,
    );
    const recoveryProfile = validateRecoveryProfile(
        recovery.recoveryProfile,
        now,
    );
    const inventoryDigest = inventory.profileEvidenceDigest;
    const recoveryDigest = recovery.profileEvidenceDigest;
    const expectedDigest = await profileEvidenceDigest(inventoryProfile);
    if (
        typeof inventoryDigest !== "string" ||
        typeof recoveryDigest !== "string" ||
        inventoryDigest !== expectedDigest || recoveryDigest !== expectedDigest
    ) {
        throw new Error("recovery profile evidence digest mismatch");
    }
    if (
        canonicalProfileJson(inventoryProfile) !==
            canonicalProfileJson(recoveryProfile)
    ) {
        throw new Error("recovery profile stage binding mismatch");
    }
    const expectedMetrics = JSON.stringify(
        recoveryProfileMetrics(inventoryProfile),
    );
    if (
        JSON.stringify(inventory.profileMetrics) !== expectedMetrics ||
        JSON.stringify(recovery.profileMetrics) !== expectedMetrics
    ) {
        throw new Error("recovery profile metrics mismatch");
    }
}

async function verifiedManifest(root: string): Promise<string> {
    const manifestPath = resolve(root, "manifest.json");
    const manifest = JSON.parse(await Deno.readTextFile(manifestPath)) as {
        schemaVersion?: unknown;
        files?: Array<{ path?: unknown; sha256?: unknown; bytes?: unknown }>;
    };
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) {
        throw new Error("evidence manifest is invalid");
    }
    const actualNames: string[] = [];
    for await (const entry of Deno.readDir(root)) {
        if (entry.isFile && entry.name !== "manifest.json") {
            actualNames.push(entry.name);
        }
    }
    actualNames.sort();
    const listedNames = manifest.files.map((entry) => entry.path);
    if (
        listedNames.length !== actualNames.length ||
        listedNames.some((name, index) => name !== actualNames[index])
    ) throw new Error("evidence manifest file set is invalid");
    for (const entry of manifest.files) {
        if (
            typeof entry.path !== "string" ||
            typeof entry.sha256 !== "string" ||
            typeof entry.bytes !== "number"
        ) throw new Error("evidence manifest entry is invalid");
        const path = resolve(root, entry.path);
        const stat = await Deno.stat(path);
        if (
            stat.size !== entry.bytes ||
            entry.sha256 !== await sha256File(path) ||
            stat.mode === null ||
            (stat.mode & 0o777) !== 0o600
        ) throw new Error("evidence manifest hash is invalid");
    }
    return await sha256File(manifestPath);
}

export async function appendStageEvidence(
    root: string,
    record: StageEvidence,
): Promise<{
    file: string;
    entryHash: string;
    ledgerHash: string;
    manifestHash: string;
}> {
    validateRecord(record);
    const ledger = await readLedger(root);
    const previous = ledger.entries.at(-1);
    if (
        record.sequence !== ledger.entries.length ||
        record.predecessorHash !== (previous?.entryHash ?? null)
    ) {
        throw new Error("stage evidence sequence or predecessor is stale");
    }
    const filename = `stage-${
        String(record.sequence).padStart(2, "0")
    }-${record.stage}.json`;
    const file = await writeEvidence(root, filename, record);
    const entryHash = await sha256File(file);
    ledger.entries.push({
        sequence: record.sequence,
        stage: record.stage,
        file: filename,
        entryHash,
        predecessorHash: record.predecessorHash,
        projectRef: record.projectRef,
        identityDigest: record.identityDigest,
        backendHead: record.backendHead,
        clientHead: record.clientHead,
        passed: record.result.passed,
    });
    const ledgerFile = await writeEvidence(root, "gate-ledger.json", ledger);
    const ledgerHash = await sha256File(ledgerFile);
    const manifest = await writeEvidenceManifest(root);
    const manifestHash = await sha256File(manifest);
    return { file, entryHash, ledgerHash, manifestHash };
}

export async function readStageCursor(
    root: string,
): Promise<{ sequence: number; predecessorHash: string | null }> {
    const ledger = await readLedger(root);
    if (ledger.entries.length > 0) await verifiedLedger(root);
    return {
        sequence: ledger.entries.length,
        predecessorHash: ledger.entries.at(-1)?.entryHash ?? null,
    };
}

export async function expectedIdentityDigest(
    identity: ExpectedDatabaseIdentity,
): Promise<string> {
    return await sha256Bytes(
        new TextEncoder().encode(
            [
                identity.validationRef,
                identity.productionSystemIdentifier,
                identity.validationSystemIdentifier,
                identity.databaseOid,
                identity.markerDigest,
                identity.provenanceId,
            ].join("\n"),
        ),
    );
}

export async function verifyApplyApproval(
    root: string,
    approval: string,
    projectRef: string,
    identityDigest: string,
    backendHead: string,
    clientHead: string,
    expectedDryRunHash: string,
): Promise<void> {
    const { ledger } = await verifiedLedger(root);
    const dryRuns = ledger.entries.filter((entry) =>
        entry.stage === "db-dry-run" && entry.passed
    );
    const dryRun = dryRuns.at(-1);
    if (!dryRun || dryRun.entryHash !== expectedDryRunHash) {
        throw new Error("dry-run transcript hash mismatch");
    }
    if (
        dryRun.projectRef !== projectRef ||
        dryRun.identityDigest !== identityDigest ||
        dryRun.backendHead !== backendHead ||
        dryRun.clientHead !== clientHead
    ) throw new Error("dry-run evidence binding mismatch");
    const expected =
        `APPLY:${projectRef}:${expectedDryRunHash}:${backendHead}:${clientHead}`;
    if (approval !== expected) {
        throw new Error("explicit apply approval is required");
    }
}

const RELEASE_STAGES: GateStage[] = [
    "inventory-validated",
    "recovery-validated",
    "lock-capability",
    "db-dry-run",
    "db-apply",
    "direct-rpc",
    "edge-delete-empty",
    "edge-deploy-active",
    "ios-test",
    "ios-build",
];

export async function verifyReleaseApproval(
    root: string,
    approval: string,
    projectRef: string,
    identityDigest: string,
    now = new Date(),
): Promise<void> {
    const { ledger, ledgerHash, records } = await verifiedLedger(root);
    for (const entry of ledger.entries) {
        if (
            entry.projectRef !== projectRef ||
            entry.identityDigest !== identityDigest ||
            entry.backendHead !== BACKEND_PRODUCT_SHA ||
            entry.clientHead !== CLIENT_PRODUCT_SHA
        ) {
            throw new Error("release ledger entry identity mismatch");
        }
        if (!entry.passed) {
            throw new Error("release ledger contains a failed stage");
        }
    }
    if (
        ledger.entries.length !== RELEASE_STAGES.length ||
        ledger.entries.some((entry, index) =>
            entry.stage !== RELEASE_STAGES[index]
        )
    ) {
        throw new Error("release ledger stage sequence mismatch");
    }
    await verifyRecoveryProfileStageBinding(records, now);
    const manifestHash = await verifiedManifest(root);
    const expected =
        `RELEASE:${projectRef}:${ledgerHash}:${manifestHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`;
    if (approval !== expected) {
        throw new Error("explicit release approval is required");
    }
}
