/// <reference lib="deno.ns" />

import {
    type CommandInvocation,
    type CommandResult,
    type RolloutCommandRunner,
} from "./rollout_lib.ts";
import { runDirectRpcGate, runEdgeReplacementGate } from "./remote_gate_lib.ts";
import { BACKEND_PRODUCT_SHA, CLIENT_PRODUCT_SHA } from "./identity_lib.ts";

function assert(
    condition: unknown,
    message = "assertion failed",
): asserts condition {
    if (!condition) throw new Error(message);
}

async function assertRejects(
    action: () => Promise<unknown>,
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
const expectedIdentity = {
    validationRef: ref,
    productionSystemIdentifier: "1111111111111111111",
    validationSystemIdentifier: "2222222222222222222",
    databaseOid: "5",
    markerDigest: "9".repeat(64),
    provenanceId: "clone-ticket-42",
};
const target = {
    projectRef: ref,
    host: `db.${ref}.supabase.co`,
    user: "postgres",
    database: "postgres",
    sslMode: "verify-full",
} as const;

class FakeRunner implements RolloutCommandRunner {
    readonly invocations: CommandInvocation[] = [];
    deployed = false;
    forceUnauthorized = false;

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
        if (invocation.command === "psql") {
            return Promise.resolve({
                code: 0,
                stdout: `${
                    JSON.stringify({
                        projectRef: ref,
                        systemIdentifier:
                            expectedIdentity.validationSystemIdentifier,
                        databaseOid: expectedIdentity.databaseOid,
                        databaseName: "postgres",
                        sourceSystemIdentifier:
                            expectedIdentity.productionSystemIdentifier,
                        markerDigest: expectedIdentity.markerDigest,
                        provenanceId: expectedIdentity.provenanceId,
                    })
                }\n`,
                stderr: "",
            });
        }
        if (invocation.command === "curl") {
            if (joined.includes("/functions/v1/")) {
                return Promise.resolve({
                    code: 0,
                    stdout:
                        `{"error":{"code":"feature_unavailable"}}\n{"httpCode":503}\n`,
                    stderr: "",
                });
            }
            if (this.forceUnauthorized) {
                return Promise.resolve({
                    code: 0,
                    stdout: `{"message":"unauthorized"}\n{"httpCode":401}\n`,
                    stderr: "",
                });
            }
            if (joined.includes("unauthenticated.curl")) {
                return Promise.resolve({
                    code: 0,
                    stdout: `{"code":"PGRST301"}\n{"httpCode":401}\n`,
                    stderr: "",
                });
            }
            if (joined.includes("insufficient.curl")) {
                return Promise.resolve({
                    code: 0,
                    stdout: `{"code":"42501"}\n{"httpCode":403}\n`,
                    stderr: "",
                });
            }
            if (joined.includes("get_match_release_state")) {
                return Promise.resolve({
                    code: 0,
                    stdout: `{"trafficEnabled":false}\n{"httpCode":200}\n`,
                    stderr: "",
                });
            }
            return Promise.resolve({
                code: 0,
                stdout: `{"code":"55000"}\n{"httpCode":500}\n`,
                stderr: "",
            });
        }
        if (joined.includes("functions list")) {
            const body = this.deployed
                ? [
                    "admin-command",
                    "game-day-command",
                    "game-day-snapshot",
                    "match-recommendation",
                    "member-link",
                    "member-read",
                    "operator-read",
                ].map((name, index) => ({
                    name,
                    version: index + 1,
                    status: "ACTIVE",
                }))
                : [];
            return Promise.resolve({
                code: 0,
                stdout: `${JSON.stringify(body)}\n`,
                stderr: "",
            });
        }
        if (joined.includes("functions deploy")) this.deployed = true;
        return Promise.resolve({ code: 0, stdout: "ok\n", stderr: "" });
    }
}

async function options(runner: FakeRunner) {
    const evidenceRoot = await Deno.makeTempDir();
    return {
        evidenceRoot,
        backendRoot: "/reviewed/backend",
        clientRoot: "/reviewed/client",
        target,
        expectedIdentity,
        authConfigRoot: "/external/auth",
        payloadRoot: "/reviewed/rpc-fixtures",
        runner,
    };
}

Deno.test("direct RPC gate uses exact PostgREST curl invocations without secrets", async () => {
    const runner = new FakeRunner();
    const setup = await options(runner);
    try {
        await runDirectRpcGate(setup);
        const commands = runner.invocations.filter((invocation) =>
            invocation.command === "curl"
        ).map((invocation) =>
            [invocation.command, ...invocation.args].join(" ")
        );
        assert(commands.length === 4);
        assert(commands.every((command) =>
            command.startsWith("curl ") &&
            command.includes(`https://${ref}.supabase.co/rest/v1/rpc/`) &&
            command.includes("--config /external/auth/") &&
            command.includes("--data-binary @/reviewed/rpc-fixtures/")
        ));
        assert(!commands.join("\n").match(/Bearer|eyJ|service_role/));
    } finally {
        await Deno.remove(setup.evidenceRoot, { recursive: true });
    }
});

Deno.test("direct RPC gate rejects a 401 reported as command success", async () => {
    const runner = new FakeRunner();
    runner.forceUnauthorized = true;
    const setup = await options(runner);
    try {
        await assertRejects(() => runDirectRpcGate(setup), "RPC postcondition");
    } finally {
        await Deno.remove(setup.evidenceRoot, { recursive: true });
    }
});

Deno.test("edge replacement deletes to empty then deploys exact ACTIVE seven", async () => {
    const runner = new FakeRunner();
    const setup = await options(runner);
    try {
        await runDirectRpcGate(setup);
        const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(
                [
                    ref,
                    expectedIdentity.productionSystemIdentifier,
                    expectedIdentity.validationSystemIdentifier,
                    expectedIdentity.databaseOid,
                    expectedIdentity.markerDigest,
                    expectedIdentity.provenanceId,
                ].join("\n"),
            ),
        );
        const hex = [...new Uint8Array(digest)].map((byte) =>
            byte.toString(16).padStart(2, "0")
        ).join("");
        await runEdgeReplacementGate({
            ...setup,
            approval:
                `EDGE:${ref}:${hex}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`,
        });
        const commands = runner.invocations.map((invocation) =>
            [invocation.command, ...invocation.args].join(" ")
        );
        assert(
            commands.filter((command) => command.includes("functions delete"))
                .length === 7,
        );
        assert(
            commands.filter((command) => command.includes("functions deploy"))
                .length === 7,
        );
        assert(
            commands.filter((command) => command.includes("functions list"))
                .length === 2,
        );
        const ledger = JSON.parse(
            await Deno.readTextFile(`${setup.evidenceRoot}/gate-ledger.json`),
        );
        assert(ledger.entries[0].stage === "direct-rpc");
        assert(ledger.entries[1].stage === "edge-delete-empty");
        assert(ledger.entries[2].stage === "edge-deploy-active");
    } finally {
        await Deno.remove(setup.evidenceRoot, { recursive: true });
    }
});
