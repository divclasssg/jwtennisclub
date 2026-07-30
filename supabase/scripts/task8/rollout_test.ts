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
        const outsideRoot = `${sandbox}/evidence`;
        await Deno.mkdir(`${backendRoot}/nested`, { recursive: true });
        await Deno.mkdir(clientRoot);
        await Deno.mkdir(outsideRoot);

        await assertRejects(
            () =>
                ensureEvidenceRoot(
                    `${backendRoot}/nested`,
                    backendRoot,
                    clientRoot,
                ),
            "outside both Git roots",
        );

        const root = await ensureEvidenceRoot(
            outsideRoot,
            backendRoot,
            clientRoot,
        );
        assertEquals(root, await Deno.realPath(outsideRoot));
        assertEquals((await Deno.stat(root)).mode! & 0o777, 0o700);
    } finally {
        await Deno.remove(sandbox, { recursive: true });
    }
});

Deno.test("evidence writer redacts secrets, uses 0600, and hashes redacted files", async () => {
    const sandbox = await Deno.makeTempDir();
    try {
        const backendRoot = `${sandbox}/backend`;
        const clientRoot = `${sandbox}/client`;
        const evidenceRoot = `${sandbox}/evidence`;
        await Deno.mkdir(backendRoot);
        await Deno.mkdir(clientRoot);
        await Deno.mkdir(evidenceRoot);
        const root = await ensureEvidenceRoot(
            evidenceRoot,
            backendRoot,
            clientRoot,
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

Deno.test("bootstrap rejects a PGSERVICE pointing at production before marker mutation", async () => {
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
                    psqlService: "wrong-service",
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
    await Deno.mkdir(`${backendRoot}/supabase/.temp`, { recursive: true });
    await Deno.mkdir(clientRoot);
    await Deno.writeTextFile(
        `${backendRoot}/supabase/.temp/project-ref`,
        `${validationRef}\n`,
    );
    try {
        await executeRolloutStep({
            step,
            backendRoot,
            clientRoot,
            psqlService: "task8-validation",
            expectedIdentity: {
                validationRef,
                productionSystemIdentifier,
                validationSystemIdentifier,
                databaseOid: "16384",
                markerDigest,
                provenanceId: "clone-ticket-42",
            },
            approval,
            runner,
        });
    } finally {
        await Deno.remove(sandbox, { recursive: true });
    }
}

Deno.test("mismatched PGSERVICE identity stops before any remote mutation", async () => {
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
    await rolloutFixture(dryRunner, "db-dry-run");
    assert(
        dryRunner.invocations.some((invocation) =>
            invocation.args.join(" ").includes("db push --linked --dry-run")
        ),
    );

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
                `APPLY:${validationRef}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`,
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
