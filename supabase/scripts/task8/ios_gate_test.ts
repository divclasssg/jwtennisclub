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
    constructor(
        private readonly configUrl = "https://abcdefghijklmnopqrst.supabase.co",
        private readonly publicKey = "sb_publishable_super-secret-task8-key",
        private readonly extractionFails = false,
    ) {}

    run(invocation: CommandInvocation): Promise<CommandResult> {
        this.invocations.push(invocation);
        const joined = [invocation.command, ...invocation.args].join(" ");
        if (invocation.command === "plutil") {
            if (this.extractionFails) {
                return Promise.resolve({
                    code: 1,
                    stdout: "sb_publishable_must-not-leak\n",
                    stderr: "",
                });
            }
            const stdout = invocation.args.includes("SUPABASE_URL")
                ? this.configUrl
                : this.publicKey;
            return Promise.resolve({
                code: 0,
                stdout: `${stdout}\n`,
                stderr: "",
            });
        }
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

async function setupIosGate(
    runner: FakeRunner,
): Promise<{
    root: string;
    clientRoot: string;
    evidenceRoot: string;
    configPath: string;
    options: Parameters<typeof runIosGates>[0] & { configPath: string };
}> {
    const root = await Deno.makeTempDir();
    const clientRoot = `${root}/client`;
    const evidenceRoot = `${root}/evidence`;
    const configPath = `${root}/Task8Supabase.plist`;
    await Deno.mkdir(
        `${clientRoot}/ios/JWTennisMatch/Configuration`,
        { recursive: true },
    );
    await Deno.mkdir(evidenceRoot);
    await Deno.writeTextFile(configPath, "<plist>test-only</plist>\n", {
        mode: 0o600,
    });
    return {
        root,
        clientRoot,
        evidenceRoot,
        configPath,
        options: {
            evidenceRoot,
            clientRoot,
            configPath,
            expectedIdentity: {
                validationRef: "abcdefghijklmnopqrst",
                productionSystemIdentifier: "1111111111111111111",
                validationSystemIdentifier: "2222222222222222222",
                databaseOid: "5",
                markerDigest: "9".repeat(64),
                provenanceId: "clone-ticket-42",
            },
            runner,
        },
    };
}

Deno.test("iOS gate runs exact test then build and appends ordered evidence", async () => {
    const runner = new FakeRunner();
    const setup = await setupIosGate(runner);
    try {
        await runIosGates(setup.options);
        const xcode = runner.invocations.filter((invocation) =>
            invocation.command === "xcodebuild"
        );
        assert(xcode.length === 2);
        assert(xcode[0].args[0] === "test");
        assert(xcode[1].args[0] === "build");
        assert(
            xcode.every((invocation) =>
                invocation.cwd === `${setup.clientRoot}/ios/JWTennisMatch` &&
                invocation.args.includes("JWTennisMatch.xcodeproj") &&
                invocation.args.includes("JWTennisMatch") &&
                invocation.args.includes(
                    "platform=iOS Simulator,name=iPhone 17 Pro",
                )
            ),
        );
        const ledger = JSON.parse(
            await Deno.readTextFile(`${setup.evidenceRoot}/gate-ledger.json`),
        );
        assert(ledger.entries[0].stage === "ios-test");
        assert(ledger.entries[1].stage === "ios-build");
        const evidence = await Deno.readTextFile(
            `${setup.evidenceRoot}/${ledger.entries[0].file}`,
        );
        assert(!evidence.includes("super-secret-task8-key"));
        const stage = JSON.parse(evidence);
        assert(/^[a-f0-9]{64}$/.test(stage.result.configDigestSha256));
        let localConfigExists = true;
        try {
            await Deno.lstat(
                `${setup.clientRoot}/ios/JWTennisMatch/Configuration/Supabase.plist`,
            );
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                localConfigExists = false;
            } else throw error;
        }
        assert(!localConfigExists, "temporary Task8 config was not removed");
    } finally {
        await Deno.remove(setup.root, { recursive: true });
    }
});

Deno.test("iOS gate rejects missing Task8 config and any existing local Supabase plist", async () => {
    const missing = await setupIosGate(new FakeRunner());
    try {
        await Deno.remove(missing.configPath);
        await assertRejects(
            () => runIosGates(missing.options),
            "Task8 Supabase config",
        );
    } finally {
        await Deno.remove(missing.root, { recursive: true });
    }

    const local = await setupIosGate(new FakeRunner());
    try {
        await Deno.writeTextFile(
            `${local.clientRoot}/ios/JWTennisMatch/Configuration/Supabase.plist`,
            "<plist>production-local</plist>\n",
        );
        await assertRejects(
            () => runIosGates(local.options),
            "existing local Supabase.plist",
        );
    } finally {
        await Deno.remove(local.root, { recursive: true });
    }
});

Deno.test("iOS gate rejects production and other Supabase URL hosts", async () => {
    for (
        const url of [
            "https://ydiusirreirhbvlftegp.supabase.co",
            "https://bcdefghijklmnopqrstu.supabase.co",
            "https://abcdefghijklmnopqrst.supabase.co.evil.example",
        ]
    ) {
        const setup = await setupIosGate(new FakeRunner(url));
        try {
            await assertRejects(
                () => runIosGates(setup.options),
                "validation Supabase URL",
            );
        } finally {
            await Deno.remove(setup.root, { recursive: true });
        }
    }
});

Deno.test("iOS gate rejects a missing or non-public Supabase key", async () => {
    for (const key of ["", "service_role_secret", "YOUR_SUPABASE_ANON_KEY"]) {
        const setup = await setupIosGate(
            new FakeRunner(
                "https://abcdefghijklmnopqrst.supabase.co",
                key,
            ),
        );
        try {
            await assertRejects(
                () => runIosGates(setup.options),
                "public Supabase key",
            );
        } finally {
            await Deno.remove(setup.root, { recursive: true });
        }
    }
});

Deno.test("iOS gate discards plist parser output on failure", async () => {
    const setup = await setupIosGate(
        new FakeRunner(
            "https://abcdefghijklmnopqrst.supabase.co",
            "sb_publishable_test",
            true,
        ),
    );
    try {
        let message = "";
        try {
            await runIosGates(setup.options);
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }
        assert(message.includes("could not be parsed"), message);
        assert(!message.includes("must-not-leak"), message);
    } finally {
        await Deno.remove(setup.root, { recursive: true });
    }
});
