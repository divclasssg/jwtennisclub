/// <reference lib="deno.ns" />

import { resolve } from "node:path";
import {
    BACKEND_PRODUCT_SHA,
    CLIENT_PRODUCT_SHA,
    type ExpectedDatabaseIdentity,
} from "./identity_lib.ts";
import { writeEvidence, writeEvidenceManifest } from "./evidence_lib.ts";

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
}> {
    const ledgerPath = resolve(root, "gate-ledger.json");
    const ledger = await readLedger(root);
    if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.entries)) {
        throw new Error("gate ledger is invalid");
    }
    let predecessor: string | null = null;
    let previousEndedAt = Number.NEGATIVE_INFINITY;
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
    }
    return { ledger, ledgerHash: await sha256File(ledgerPath) };
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
): Promise<void> {
    const { ledger, ledgerHash } = await verifiedLedger(root);
    const manifestHash = await verifiedManifest(root);
    let previousIndex = -1;
    for (const stage of RELEASE_STAGES) {
        const candidates = ledger.entries.filter((entry) =>
            entry.stage === stage
        );
        if (candidates.length === 0) {
            throw new Error(`missing release gate: ${stage}`);
        }
        if (
            candidates.some((entry) =>
                !entry.passed ||
                entry.projectRef !== projectRef ||
                entry.identityDigest !== identityDigest ||
                entry.backendHead !== BACKEND_PRODUCT_SHA ||
                entry.clientHead !== CLIENT_PRODUCT_SHA
            )
        ) throw new Error(`wrong-identity release gate: ${stage}`);
        if (candidates.length !== 1) {
            throw new Error(`duplicate release gate: ${stage}`);
        }
        const index = ledger.entries.indexOf(candidates[0]);
        if (index <= previousIndex) {
            throw new Error(`reordered release gate: ${stage}`);
        }
        previousIndex = index;
    }
    const expected =
        `RELEASE:${projectRef}:${ledgerHash}:${manifestHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`;
    if (approval !== expected) {
        throw new Error("explicit release approval is required");
    }
}
