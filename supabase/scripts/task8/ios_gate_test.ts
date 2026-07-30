/// <reference lib="deno.ns" />

import {
    type CommandInvocation,
    type CommandResult,
    type RolloutCommandRunner,
} from "./rollout_lib.ts";
import { runIosGates } from "./ios_gate_lib.ts";
import { CLIENT_PRODUCT_SHA } from "./identity_lib.ts";

function assert(
    condition: unknown,
    message = "assertion failed",
): asserts condition {
    if (!condition) throw new Error(message);
}

class FakeRunner implements RolloutCommandRunner {
    readonly invocations: CommandInvocation[] = [];

    run(invocation: CommandInvocation): Promise<CommandResult> {
        this.invocations.push(invocation);
        const joined = [invocation.command, ...invocation.args].join(" ");
        if (joined.includes("rev-parse HEAD")) {
            return Promise.resolve({
                code: 0,
                stdout: `${CLIENT_PRODUCT_SHA}\n`,
                stderr: "",
            });
        }
        if (joined.includes("status --porcelain")) {
            return Promise.resolve({ code: 0, stdout: "", stderr: "" });
        }
        return Promise.resolve({
            code: 0,
            stdout: "** TEST/BUILD SUCCEEDED **\n",
            stderr: "",
        });
    }
}

Deno.test("iOS gate runs exact test then build and appends ordered evidence", async () => {
    const runner = new FakeRunner();
    const evidenceRoot = await Deno.makeTempDir();
    try {
        await runIosGates({
            evidenceRoot,
            clientRoot: "/reviewed/client",
            expectedIdentity: {
                validationRef: "abcdefghijklmnopqrst",
                productionSystemIdentifier: "1111111111111111111",
                validationSystemIdentifier: "2222222222222222222",
                databaseOid: "5",
                markerDigest: "9".repeat(64),
                provenanceId: "clone-ticket-42",
            },
            runner,
        });
        const xcode = runner.invocations.filter((invocation) =>
            invocation.command === "xcodebuild"
        );
        assert(xcode.length === 2);
        assert(xcode[0].args[0] === "test");
        assert(xcode[1].args[0] === "build");
        assert(
            xcode.every((invocation) =>
                invocation.cwd === "/reviewed/client/ios/JWTennisMatch" &&
                invocation.args.includes("JWTennisMatch.xcodeproj") &&
                invocation.args.includes("JWTennisMatch") &&
                invocation.args.includes(
                    "platform=iOS Simulator,name=iPhone 17 Pro",
                )
            ),
        );
        const ledger = JSON.parse(
            await Deno.readTextFile(`${evidenceRoot}/gate-ledger.json`),
        );
        assert(ledger.entries[0].stage === "ios-test");
        assert(ledger.entries[1].stage === "ios-build");
    } finally {
        await Deno.remove(evidenceRoot, { recursive: true });
    }
});
