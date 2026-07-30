/// <reference lib="deno.ns" />

import {
    BACKEND_PRODUCT_SHA,
    bootstrapCloneProvenance,
    CLIENT_PRODUCT_SHA,
    type CommandInvocation,
    type CommandResult,
    ensureEvidenceRoot,
    executeRolloutStep,
    normalizeProjectRef,
    type RolloutCommandRunner,
    validateDatabaseIdentity,
    writeEvidence,
    writeEvidenceManifest,
} from "./rollout_lib.ts";
import {
    appendStageEvidence,
    commandStreamEvidence,
    expectedIdentityDigest,
} from "./stage_evidence_lib.ts";

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

async function assertRejects(
    action: () => Promise<unknown> | unknown,
    expectedMessage: string,
): Promise<void> {
    try {
        await action();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(
            message.includes(expectedMessage),
            `expected error containing ${expectedMessage}, got ${message}`,
        );
        return;
    }
    throw new Error(`expected rejection containing ${expectedMessage}`);
}

const productionRef = "ydiusirreirhbvlftegp";
const validationRef = "abcdefghijklmnopqrst";
const productionSystemIdentifier = "1111111111111111111";
const validationSystemIdentifier = "2222222222222222222";
const markerDigest = "a".repeat(64);

function validIdentity() {
    return {
        projectRef: validationRef,
        systemIdentifier: validationSystemIdentifier,
        databaseOid: "16384",
        databaseName: "postgres",
        sourceSystemIdentifier: productionSystemIdentifier,
        markerDigest,
        provenanceId: "clone-ticket-42",
    };
}

Deno.test("whitespace cannot disguise the production project ref", () => {
    let message = "";
    try {
        normalizeProjectRef(`  ${productionRef}\n`);
    } catch (error) {
        message = error instanceof Error ? error.message : String(error);
    }
    assert(message.includes("production project is forbidden"), message);
});

Deno.test("project refs are normalized and strictly formatted", () => {
    assertEquals(normalizeProjectRef(`  ${validationRef}\n`), validationRef);
    for (
        const invalid of ["abc", "ABCDEFGHIJKLMNOPQRST", `${validationRef}1`]
    ) {
        let rejected = false;
        try {
            normalizeProjectRef(invalid);
        } catch {
            rejected = true;
        }
        assert(rejected, `expected invalid ref rejection: ${invalid}`);
    }
});

Deno.test("database identity requires a different server fingerprint and exact marker", async () => {
    assertEquals(
        validateDatabaseIdentity(validIdentity(), {
            validationRef,
            productionSystemIdentifier,
            validationSystemIdentifier,
            databaseOid: "16384",
            markerDigest,
            provenanceId: "clone-ticket-42",
        }),
        validIdentity(),
    );

    await assertRejects(
        () =>
            validateDatabaseIdentity(
                {
                    ...validIdentity(),
                    systemIdentifier: productionSystemIdentifier,
                },
                {
                    validationRef,
                    productionSystemIdentifier,
                    validationSystemIdentifier: productionSystemIdentifier,
                    databaseOid: "16384",
                    markerDigest,
                    provenanceId: "clone-ticket-42",
                },
            ),
        "validation database fingerprint matches production",
    );
});

Deno.test("evidence root must be canonical and outside both Git roots", async () => {
    const sandbox = await Deno.makeTempDir();
    try {
        const backendRoot = `${sandbox}/backend`;
        const clientRoot = `${sandbox}/client`;
        const toolRoot = `${sandbox}/tool`;
        const outsideRoot = `${sandbox}/evidence`;
        await Deno.mkdir(`${backendRoot}/nested`, { recursive: true });
        await Deno.mkdir(clientRoot);
        await Deno.mkdir(toolRoot);
        await Deno.mkdir(outsideRoot);

        await assertRejects(
            () =>
                ensureEvidenceRoot(
                    `${backendRoot}/nested`,
                    backendRoot,
                    clientRoot,
                    toolRoot,
                ),
            "outside backend, client, and tool Git roots",
        );

        const root = await ensureEvidenceRoot(
            outsideRoot,
            backendRoot,
            clientRoot,
            toolRoot,
        );
        assertEquals(root, await Deno.realPath(outsideRoot));
        assertEquals((await Deno.stat(root)).mode! & 0o777, 0o700);
    } finally {
        await Deno.remove(sandbox, { recursive: true });
    }
});

Deno.test("evidence root must also be outside the tool Git root", async () => {
    const sandbox = await Deno.makeTempDir();
    try {
        const backendRoot = `${sandbox}/backend`;
        const clientRoot = `${sandbox}/client`;
        const toolRoot = `${sandbox}/tool`;
        const evidenceRoot = `${toolRoot}/evidence`;
        await Deno.mkdir(backendRoot);
        await Deno.mkdir(clientRoot);
        await Deno.mkdir(evidenceRoot, { recursive: true });
        await assertRejects(
            () =>
                ensureEvidenceRoot(
                    evidenceRoot,
                    backendRoot,
                    clientRoot,
                    toolRoot,
                ),
            "outside backend, client, and tool Git roots",
        );
    } finally {
        await Deno.remove(sandbox, { recursive: true });
    }
});

Deno.test("evidence writer redacts secrets, uses 0600, and hashes redacted files", async () => {
    const sandbox = await Deno.makeTempDir();
    try {
        const backendRoot = `${sandbox}/backend`;
        const clientRoot = `${sandbox}/client`;
        const toolRoot = `${sandbox}/tool`;
        const evidenceRoot = `${sandbox}/evidence`;
        await Deno.mkdir(backendRoot);
        await Deno.mkdir(clientRoot);
        await Deno.mkdir(toolRoot);
        await Deno.mkdir(evidenceRoot);
        const root = await ensureEvidenceRoot(
            evidenceRoot,
            backendRoot,
            clientRoot,
            toolRoot,
        );

        const file = await writeEvidence(root, "inventory.json", {
            projectRef: validationRef,
            bearerToken: "must-not-survive",
            nested: { databaseUrl: "must-not-survive-either" },
        });
        const body = await Deno.readTextFile(file);
        assert(!body.includes("must-not-survive"));
        assert(body.includes("[REDACTED]"));
        assertEquals((await Deno.stat(file)).mode! & 0o777, 0o600);

        const manifest = await writeEvidenceManifest(root);
        const manifestBody = JSON.parse(await Deno.readTextFile(manifest));
        assertEquals(manifestBody.files.length, 1);
        assertEquals(manifestBody.files[0].path, "inventory.json");
        assert(/^[a-f0-9]{64}$/.test(manifestBody.files[0].sha256));
        assertEquals((await Deno.stat(manifest)).mode! & 0o777, 0o600);
    } finally {
        await Deno.remove(sandbox, { recursive: true });
    }
});

class FakeRunner implements RolloutCommandRunner {
    readonly invocations: CommandInvocation[] = [];
    failDbPush = false;
    identity = validIdentity();

    run(invocation: CommandInvocation): Promise<CommandResult> {
        this.invocations.push(invocation);
        const joined = [invocation.command, ...invocation.args].join(" ");

        if (joined.includes("rev-parse HEAD")) {
            return Promise.resolve({
                code: 0,
                stdout: invocation.cwd.endsWith("backend")
                    ? `${BACKEND_PRODUCT_SHA}\n`
                    : `${CLIENT_PRODUCT_SHA}\n`,
                stderr: "",
            });
        }
        if (joined.includes("status --porcelain")) {
            return Promise.resolve({ code: 0, stdout: "", stderr: "" });
        }
        if (joined.includes("task8_identity.sql")) {
            return Promise.resolve({
                code: 0,
                stdout: `${JSON.stringify(this.identity)}\n`,
                stderr: "",
            });
        }
        if (joined.includes("task8_capture_server_identity.sql")) {
            return Promise.resolve({
                code: 0,
                stdout: `${
                    JSON.stringify({
                        systemIdentifier: this.identity.systemIdentifier,
                        databaseOid: this.identity.databaseOid,
                        databaseName: this.identity.databaseName,
                    })
                }\n`,
                stderr: "",
            });
        }
        if (joined.includes("task8_bootstrap_provenance.sql")) {
            return Promise.resolve({
                code: 0,
                stdout: `${JSON.stringify(this.identity)}\n`,
                stderr: "",
            });
        }
        if (
            joined.includes("db push --linked") && !joined.includes("--dry-run")
        ) {
            if (this.failDbPush) {
                return Promise.resolve({
                    code: 1,
                    stdout: "",
                    stderr: "synthetic push failure",
                });
            }
        }
        return Promise.resolve({ code: 0, stdout: "ok\n", stderr: "" });
    }
}

Deno.test("bootstrap rejects a validation endpoint with the production fingerprint", async () => {
    const runner = new FakeRunner();
    runner.identity = {
        ...validIdentity(),
        systemIdentifier: productionSystemIdentifier,
    };
    const sandbox = await Deno.makeTempDir();
    const backendRoot = `${sandbox}/backend`;
    const clientRoot = `${sandbox}/client`;
    await Deno.mkdir(`${backendRoot}/supabase/.temp`, { recursive: true });
    await Deno.mkdir(clientRoot);
    await Deno.writeTextFile(
        `${backendRoot}/supabase/.temp/project-ref`,
        validationRef,
    );
    try {
        await assertRejects(
            () =>
                bootstrapCloneProvenance({
                    backendRoot,
                    clientRoot,
                    validationTarget: {
                        projectRef: validationRef,
                        host: `db.${validationRef}.supabase.co`,
                        user: "postgres",
                        database: "postgres",
                        sslMode: "verify-full",
                    },
                    managementProject: {
                        id: validationRef,
                        ref: validationRef,
                        name: "approved-clone",
                    },
                    validationRef,
                    productionSystemIdentifier,
                    sourceSnapshotAt: "2026-07-30T00:00:00.000Z",
                    provenanceId: "clone-ticket-42",
                    approvalId: "change-42",
                    approval:
                        `BOOTSTRAP:${validationRef}:${productionSystemIdentifier}:clone-ticket-42:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`,
                    runner,
                }),
            "validation database fingerprint matches production",
        );
        assert(
            !runner.invocations.some((invocation) =>
                invocation.args.some((argument) =>
                    argument.includes("task8_bootstrap_provenance.sql")
                )
            ),
            "provenance mutation must not run after fingerprint mismatch",
        );
    } finally {
        await Deno.remove(sandbox, { recursive: true });
    }
});

async function rolloutFixture(
    runner: FakeRunner,
    step: "db-dry-run" | "db-apply" | "release-enable" | "removal-proof",
    approval?: string,
) {
    const sandbox = await Deno.makeTempDir();
    const backendRoot = `${sandbox}/backend`;
    const clientRoot = `${sandbox}/client`;
    const evidenceRoot = `${sandbox}/evidence`;
    await Deno.mkdir(`${backendRoot}/supabase/.temp`, { recursive: true });
    await Deno.mkdir(clientRoot);
    await Deno.mkdir(evidenceRoot);
    await Deno.writeTextFile(
        `${backendRoot}/supabase/.temp/project-ref`,
        `${validationRef}\n`,
    );
    try {
        const expectedIdentity = {
            validationRef,
            productionSystemIdentifier,
            validationSystemIdentifier,
            databaseOid: "16384",
            markerDigest,
            provenanceId: "clone-ticket-42",
        };
        let dryRunHash: string | undefined;
        if (step === "db-apply" && approval !== undefined) {
            const dryRun = await appendStageEvidence(evidenceRoot, {
                schemaVersion: 1,
                stage: "db-dry-run",
                sequence: 0,
                startedAt: "2026-07-30T00:00:00.000Z",
                endedAt: "2026-07-30T00:00:01.000Z",
                projectRef: validationRef,
                identityDigest: await expectedIdentityDigest(expectedIdentity),
                backendHead: BACKEND_PRODUCT_SHA,
                clientHead: CLIENT_PRODUCT_SHA,
                predecessorHash: null,
                command: {
                    program: "supabase",
                    args: ["db", "push", "--linked", "--dry-run"],
                },
                stdout: commandStreamEvidence("dry run ok"),
                stderr: commandStreamEvidence(""),
                result: { passed: true, exitCode: 0 },
            });
            dryRunHash = dryRun.entryHash;
            if (approval === "VALID_APPLY") {
                approval =
                    `APPLY:${validationRef}:${dryRunHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`;
            }
        }
        await executeRolloutStep({
            step,
            backendRoot,
            clientRoot,
            validationTarget: {
                projectRef: validationRef,
                host: `db.${validationRef}.supabase.co`,
                user: "postgres",
                database: "postgres",
                sslMode: "verify-full",
            },
            expectedIdentity,
            evidenceRoot,
            dryRunHash,
            approval,
            runner,
        });
        return JSON.parse(
            await Deno.readTextFile(`${evidenceRoot}/gate-ledger.json`),
        );
    } finally {
        await Deno.remove(sandbox, { recursive: true });
    }
}

Deno.test("mismatched direct-endpoint identity stops before any remote mutation", async () => {
    const runner = new FakeRunner();
    runner.identity = {
        ...validIdentity(),
        systemIdentifier: "3333333333333333333",
    };

    await assertRejects(
        () =>
            rolloutFixture(
                runner,
                "db-apply",
                `APPLY:${validationRef}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`,
            ),
        "validation database fingerprint mismatch",
    );
    assert(
        !runner.invocations.some((invocation) =>
            [invocation.command, ...invocation.args].join(" ").includes(
                "db push --linked",
            )
        ),
        "db push must not run after identity mismatch",
    );
});

Deno.test("mismatched provenance marker stops before any remote mutation", async () => {
    const runner = new FakeRunner();
    runner.identity = { ...validIdentity(), markerDigest: "b".repeat(64) };

    await assertRejects(
        () =>
            rolloutFixture(
                runner,
                "release-enable",
                `APPLY:${validationRef}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`,
            ),
        "provenance marker mismatch",
    );
    assert(
        !runner.invocations.some((invocation) =>
            invocation.args.some((argument) =>
                argument.includes("task8_release_state.sql")
            )
        ),
        "release SQL must not run after marker mismatch",
    );
});

Deno.test("dry-run is separate and apply requires an exact approval string", async () => {
    const dryRunner = new FakeRunner();
    const ledger = await rolloutFixture(dryRunner, "db-dry-run");
    assert(
        dryRunner.invocations.some((invocation) =>
            invocation.args.join(" ").includes("db push --linked --dry-run")
        ),
    );
    assertEquals(ledger.entries[0].stage, "db-dry-run");
    assertEquals(ledger.entries[0].passed, true);

    const applyRunner = new FakeRunner();
    await assertRejects(
        () => rolloutFixture(applyRunner, "db-apply"),
        "explicit apply approval is required",
    );
    assert(
        !applyRunner.invocations.some((invocation) =>
            invocation.args.join(" ").includes("db push --linked")
        ),
    );
});

Deno.test("failed DB apply still runs identity-guarded baseline reset", async () => {
    const runner = new FakeRunner();
    runner.failDbPush = true;

    await assertRejects(
        () =>
            rolloutFixture(
                runner,
                "db-apply",
                "VALID_APPLY",
            ),
        "synthetic push failure",
    );

    const commands = runner.invocations.map((invocation) =>
        [invocation.command, ...invocation.args].join(" ")
    );
    const pushIndex = commands.findIndex((command) =>
        command.includes("db push --linked")
    );
    const resetIndex = commands.findIndex((command) =>
        command.includes("task8_reset_baseline.sql")
    );
    assert(pushIndex >= 0, "DB push was not attempted");
    assert(resetIndex > pushIndex, "baseline reset did not run after failure");
});
