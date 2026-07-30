/// <reference lib="deno.ns" />

import { resolve } from "node:path";
import {
    BACKEND_PRODUCT_SHA,
    CLIENT_PRODUCT_SHA,
    type DatabaseIdentity,
    type ExpectedDatabaseIdentity,
    normalizeProjectRef,
    requireDatabaseOid as requireOid,
    requireSystemIdentifier,
    validateDatabaseIdentity,
} from "./identity_lib.ts";
import {
    boundPsqlInvocation,
    captureBoundServerIdentity,
    type ManagementProjectIdentity,
    type ProjectDbTarget,
    validateProjectDbTarget,
} from "./connection_binding_lib.ts";
import {
    appendStageEvidence,
    commandStreamEvidence,
    expectedIdentityDigest,
    type GateStage,
    readStageCursor,
    verifyApplyApproval,
    verifyReleaseApproval,
} from "./stage_evidence_lib.ts";

export {
    BACKEND_PRODUCT_SHA,
    CLIENT_PRODUCT_SHA,
    type DatabaseIdentity,
    type ExpectedDatabaseIdentity,
    normalizeProjectRef,
    PRODUCTION_REF,
    validateDatabaseIdentity,
} from "./identity_lib.ts";

export interface CommandInvocation {
    command: string;
    args: string[];
    cwd: string;
    env?: Record<string, string>;
}

export interface CommandResult {
    code: number;
    stdout: string;
    stderr: string;
}

export interface RolloutCommandRunner {
    run(invocation: CommandInvocation): Promise<CommandResult>;
}

export type RolloutStep =
    | "db-dry-run"
    | "db-apply"
    | "release-enable"
    | "release-disable"
    | "removal-proof"
    | "inventory"
    | "lock-capability";

export interface RolloutStepOptions {
    step: RolloutStep;
    backendRoot: string;
    clientRoot: string;
    validationTarget: ProjectDbTarget;
    expectedIdentity: ExpectedDatabaseIdentity;
    evidenceRoot: string;
    dryRunHash?: string;
    approval?: string;
    runner: RolloutCommandRunner;
}

export interface BootstrapProvenanceOptions {
    backendRoot: string;
    clientRoot: string;
    validationTarget: ProjectDbTarget;
    managementProject: ManagementProjectIdentity;
    validationRef: string;
    productionSystemIdentifier: string;
    sourceSnapshotAt: string;
    provenanceId: string;
    approvalId: string;
    approval: string;
    runner: RolloutCommandRunner;
}

export class DenoCommandRunner implements RolloutCommandRunner {
    async run(invocation: CommandInvocation): Promise<CommandResult> {
        const output = await new Deno.Command(invocation.command, {
            args: invocation.args,
            cwd: invocation.cwd,
            env: invocation.env,
            stdout: "piped",
            stderr: "piped",
        }).output();
        return {
            code: output.code,
            stdout: new TextDecoder().decode(output.stdout),
            stderr: new TextDecoder().decode(output.stderr),
        };
    }
}

export {
    ensureEvidenceRoot,
    writeEvidence,
    writeEvidenceManifest,
} from "./evidence_lib.ts";

async function runChecked(
    runner: RolloutCommandRunner,
    invocation: CommandInvocation,
): Promise<CommandResult> {
    const result = await runner.run(invocation);
    if (result.code !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim() ||
            `exit ${result.code}`;
        throw new Error(detail);
    }
    return result;
}

async function assertCheckout(
    runner: RolloutCommandRunner,
    root: string,
    expectedSha: string,
    label: string,
): Promise<void> {
    const head = await runChecked(runner, {
        command: "git",
        args: ["rev-parse", "HEAD"],
        cwd: root,
    });
    if (head.stdout.trim() !== expectedSha) {
        throw new Error(`${label} HEAD must equal ${expectedSha}`);
    }
    const status = await runChecked(runner, {
        command: "git",
        args: ["status", "--porcelain", "--untracked-files=all"],
        cwd: root,
    });
    if (status.stdout.trim() !== "") {
        throw new Error(`${label} checkout must be clean`);
    }
}

function task8Script(name: string): string {
    return new URL(`./sql/${name}`, import.meta.url).pathname;
}

function parseJsonLine<T>(stdout: string, label: string): T {
    const line = stdout.split(/\r?\n/).map((value) => value.trim()).find(
        (value) => value.startsWith("{"),
    );
    if (!line) throw new Error(`${label} returned no JSON`);
    try {
        return JSON.parse(line) as T;
    } catch {
        throw new Error(`${label} returned invalid JSON`);
    }
}

export async function bootstrapCloneProvenance(
    options: BootstrapProvenanceOptions,
): Promise<DatabaseIdentity> {
    const backendRoot = await Deno.realPath(resolve(options.backendRoot));
    const clientRoot = await Deno.realPath(resolve(options.clientRoot));
    const validationRef = normalizeProjectRef(options.validationRef);
    const validationTarget = validateProjectDbTarget(
        options.validationTarget,
        "validation",
    );
    if (validationTarget.projectRef !== validationRef) {
        throw new Error("validation target ref mismatch");
    }
    const productionSystemIdentifier = requireSystemIdentifier(
        options.productionSystemIdentifier,
        "production database fingerprint",
    );
    await assertCheckout(
        options.runner,
        backendRoot,
        BACKEND_PRODUCT_SHA,
        "backend product",
    );
    await assertCheckout(
        options.runner,
        clientRoot,
        CLIENT_PRODUCT_SHA,
        "client product",
    );
    const linkedRef = normalizeProjectRef(
        await Deno.readTextFile(`${backendRoot}/supabase/.temp/project-ref`),
    );
    if (linkedRef !== validationRef) {
        throw new Error("linked project ref mismatch");
    }
    const expectedApproval = [
        "BOOTSTRAP",
        validationRef,
        productionSystemIdentifier,
        options.provenanceId,
        BACKEND_PRODUCT_SHA,
        CLIENT_PRODUCT_SHA,
    ].join(":");
    if (options.approval !== expectedApproval) {
        throw new Error("explicit bootstrap approval is required");
    }

    const raw = await captureBoundServerIdentity({
        purpose: "validation",
        target: validationTarget,
        managementProject: options.managementProject,
        runner: options.runner,
        cwd: backendRoot,
    });
    const validationSystemIdentifier = requireSystemIdentifier(
        raw.systemIdentifier,
        "validation database fingerprint",
    );
    if (validationSystemIdentifier === productionSystemIdentifier) {
        throw new Error("validation database fingerprint matches production");
    }
    const databaseOid = requireOid(raw.databaseOid);
    if (raw.databaseName !== "postgres") {
        throw new Error("database name mismatch");
    }

    const connection = boundPsqlInvocation(validationTarget, "validation");
    const bootstrap = await runChecked(options.runner, {
        command: "psql",
        args: [
            ...connection.args,
            "-X",
            "-A",
            "-t",
            "-v",
            "ON_ERROR_STOP=1",
            "-v",
            `task8_validation_ref=${validationRef}`,
            "-v",
            `task8_production_system_identifier=${productionSystemIdentifier}`,
            "-v",
            `task8_source_snapshot_at=${options.sourceSnapshotAt}`,
            "-v",
            `task8_provenance_id=${options.provenanceId}`,
            "-v",
            `task8_approval_id=${options.approvalId}`,
            "-f",
            task8Script("task8_bootstrap_provenance.sql"),
        ],
        cwd: backendRoot,
        env: connection.env,
    });
    const identity = parseJsonLine<DatabaseIdentity>(
        bootstrap.stdout,
        "provenance bootstrap",
    );
    return validateDatabaseIdentity(identity, {
        validationRef,
        productionSystemIdentifier,
        validationSystemIdentifier,
        databaseOid,
        markerDigest: identity.markerDigest,
        provenanceId: options.provenanceId,
    });
}

function identityVariables(expected: ExpectedDatabaseIdentity): string[] {
    return [
        "-v",
        `task8_validation_ref=${normalizeProjectRef(expected.validationRef)}`,
        "-v",
        `task8_production_system_identifier=${
            requireSystemIdentifier(
                expected.productionSystemIdentifier,
                "production database fingerprint",
            )
        }`,
        "-v",
        `task8_validation_system_identifier=${
            requireSystemIdentifier(
                expected.validationSystemIdentifier,
                "validation database fingerprint",
            )
        }`,
        "-v",
        `task8_database_oid=${requireOid(expected.databaseOid)}`,
        "-v",
        `task8_marker_digest=${expected.markerDigest}`,
        "-v",
        `task8_provenance_id=${expected.provenanceId}`,
    ];
}

async function readAndAssertIdentity(
    options: RolloutStepOptions,
): Promise<DatabaseIdentity> {
    const connection = boundPsqlInvocation(
        options.validationTarget,
        "validation",
    );
    const result = await runChecked(options.runner, {
        command: "psql",
        args: [
            ...connection.args,
            "-X",
            "-A",
            "-t",
            "-v",
            "ON_ERROR_STOP=1",
            ...identityVariables(options.expectedIdentity),
            "-f",
            task8Script("task8_identity.sql"),
        ],
        cwd: options.backendRoot,
        env: connection.env,
    });
    const parsed = parseJsonLine<DatabaseIdentity>(
        result.stdout,
        "database identity query",
    );
    return validateDatabaseIdentity(parsed, options.expectedIdentity);
}

export async function captureValidatedDatabaseIdentity(
    options: RolloutStepOptions,
): Promise<DatabaseIdentity> {
    validateProjectDbTarget(options.validationTarget, "validation");
    return await readAndAssertIdentity(options);
}

async function runIdentityGuardedSql(
    options: RolloutStepOptions,
    script: string,
    extraVariables: string[] = [],
): Promise<CommandResult> {
    await readAndAssertIdentity(options);
    const connection = boundPsqlInvocation(
        options.validationTarget,
        "validation",
    );
    const result = await runChecked(options.runner, {
        command: "psql",
        args: [
            ...connection.args,
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            ...identityVariables(options.expectedIdentity),
            ...extraVariables,
            "-f",
            task8Script(script),
        ],
        cwd: options.backendRoot,
        env: connection.env,
    });
    await readAndAssertIdentity(options);
    return result;
}

async function appendCommandStage(
    options: RolloutStepOptions,
    stage: GateStage,
    invocation: CommandInvocation,
    result: CommandResult,
    startedAt: string,
    passed = true,
): Promise<string> {
    const cursor = await readStageCursor(options.evidenceRoot);
    const written = await appendStageEvidence(options.evidenceRoot, {
        schemaVersion: 1,
        stage,
        sequence: cursor.sequence,
        startedAt,
        endedAt: new Date().toISOString(),
        projectRef: normalizeProjectRef(
            options.expectedIdentity.validationRef,
        ),
        identityDigest: await expectedIdentityDigest(options.expectedIdentity),
        backendHead: BACKEND_PRODUCT_SHA,
        clientHead: CLIENT_PRODUCT_SHA,
        predecessorHash: cursor.predecessorHash,
        command: {
            program: invocation.command,
            args: invocation.args,
        },
        stdout: commandStreamEvidence(result.stdout),
        stderr: commandStreamEvidence(result.stderr),
        result: { passed, exitCode: result.code },
    });
    return written.entryHash;
}

export async function executeRolloutStep(
    options: RolloutStepOptions,
): Promise<void> {
    const backendRoot = await Deno.realPath(resolve(options.backendRoot));
    const clientRoot = await Deno.realPath(resolve(options.clientRoot));
    options = { ...options, backendRoot, clientRoot };

    await assertCheckout(
        options.runner,
        backendRoot,
        BACKEND_PRODUCT_SHA,
        "backend product",
    );
    await assertCheckout(
        options.runner,
        clientRoot,
        CLIENT_PRODUCT_SHA,
        "client product",
    );

    const linkedRef = normalizeProjectRef(
        await Deno.readTextFile(`${backendRoot}/supabase/.temp/project-ref`),
    );
    if (
        linkedRef !==
            normalizeProjectRef(options.expectedIdentity.validationRef)
    ) {
        throw new Error("linked project ref mismatch");
    }
    validateProjectDbTarget(options.validationTarget, "validation");

    await readAndAssertIdentity(options);

    if (options.step === "db-dry-run") {
        const invocation = {
            command: "supabase",
            args: ["db", "push", "--linked", "--dry-run"],
            cwd: backendRoot,
        };
        const startedAt = new Date().toISOString();
        const result = await runChecked(options.runner, invocation);
        await readAndAssertIdentity(options);
        await appendCommandStage(
            options,
            "db-dry-run",
            invocation,
            result,
            startedAt,
        );
        return;
    }

    if (options.step === "inventory") {
        const startedAt = new Date().toISOString();
        const result = await runIdentityGuardedSql(
            options,
            "task8_inventory.sql",
        );
        await appendCommandStage(
            options,
            "inventory",
            {
                command: "psql",
                args: [task8Script("task8_inventory.sql")],
                cwd: backendRoot,
            },
            result,
            startedAt,
        );
        return;
    }
    if (options.step === "lock-capability") {
        const startedAt = new Date().toISOString();
        const result = await runIdentityGuardedSql(
            options,
            "task8_lock_capability.sql",
        );
        await appendCommandStage(
            options,
            "lock-capability",
            {
                command: "psql",
                args: [task8Script("task8_lock_capability.sql")],
                cwd: backendRoot,
            },
            result,
            startedAt,
        );
        return;
    }

    if (options.step === "db-apply") {
        if (!options.approval) {
            throw new Error("explicit apply approval is required");
        }
        if (!options.dryRunHash) {
            throw new Error("dry-run transcript hash is required");
        }
        await verifyApplyApproval(
            options.evidenceRoot,
            options.approval,
            normalizeProjectRef(options.expectedIdentity.validationRef),
            options.dryRunHash,
        );
        let baselinePrepared = false;
        let primaryError: unknown;
        let resetError: unknown;
        let pushResult: CommandResult | undefined;
        const pushInvocation = {
            command: "supabase",
            args: ["db", "push", "--linked"],
            cwd: backendRoot,
        };
        const startedAt = new Date().toISOString();
        try {
            await runIdentityGuardedSql(options, "task8_prepare_baseline.sql");
            baselinePrepared = true;
            await assertCheckout(
                options.runner,
                backendRoot,
                BACKEND_PRODUCT_SHA,
                "backend product",
            );
            await assertCheckout(
                options.runner,
                clientRoot,
                CLIENT_PRODUCT_SHA,
                "client product",
            );
            await readAndAssertIdentity(options);
            pushResult = await options.runner.run(pushInvocation);
            if (pushResult.code !== 0) {
                throw new Error(
                    pushResult.stderr.trim() || pushResult.stdout.trim() ||
                        `exit ${pushResult.code}`,
                );
            }
            await assertCheckout(
                options.runner,
                backendRoot,
                BACKEND_PRODUCT_SHA,
                "backend product",
            );
            await assertCheckout(
                options.runner,
                clientRoot,
                CLIENT_PRODUCT_SHA,
                "client product",
            );
            await readAndAssertIdentity(options);
            await runIdentityGuardedSql(options, "task8_reset_baseline.sql");
            baselinePrepared = false;
        } catch (error) {
            primaryError = error;
        } finally {
            if (baselinePrepared) {
                try {
                    await runIdentityGuardedSql(
                        options,
                        "task8_reset_baseline.sql",
                    );
                } catch (error) {
                    resetError = error;
                }
            }
        }
        const finalError = primaryError ?? resetError;
        if (pushResult) {
            await appendCommandStage(
                options,
                "db-apply",
                pushInvocation,
                pushResult,
                startedAt,
                finalError === undefined,
            );
        }
        if (finalError !== undefined) throw finalError;
        return;
    }

    if (options.step === "release-enable") {
        await verifyReleaseApproval(
            options.evidenceRoot,
            options.approval ?? "",
            normalizeProjectRef(options.expectedIdentity.validationRef),
            await expectedIdentityDigest(options.expectedIdentity),
        );
        await runIdentityGuardedSql(options, "task8_release_state.sql", [
            "-v",
            "task8_release_enabled=true",
        ]);
        return;
    }
    if (options.step === "release-disable") {
        await runIdentityGuardedSql(options, "task8_release_state.sql", [
            "-v",
            "task8_release_enabled=false",
        ]);
        return;
    }
    if (options.step === "removal-proof") {
        await runIdentityGuardedSql(options, "task8_guarded_removal.sql");
        return;
    }
    const unreachable: never = options.step;
    throw new Error(`unsupported rollout step: ${unreachable}`);
}
