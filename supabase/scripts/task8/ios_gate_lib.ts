/// <reference lib="deno.ns" />

import {
    BACKEND_PRODUCT_SHA,
    CLIENT_PRODUCT_SHA,
    type ExpectedDatabaseIdentity,
} from "./identity_lib.ts";
import type {
    CommandInvocation,
    CommandResult,
    RolloutCommandRunner,
} from "./rollout_lib.ts";
import {
    appendStageEvidence,
    commandStreamEvidence,
    expectedIdentityDigest,
    type GateStage,
    readStageCursor,
} from "./stage_evidence_lib.ts";

interface IosGateOptions {
    evidenceRoot: string;
    clientRoot: string;
    expectedIdentity: ExpectedDatabaseIdentity;
    runner: RolloutCommandRunner;
}

async function checked(
    runner: RolloutCommandRunner,
    invocation: CommandInvocation,
): Promise<CommandResult> {
    const result = await runner.run(invocation);
    if (result.code !== 0) {
        throw new Error(
            result.stderr.trim() || result.stdout.trim() ||
                `${invocation.command} exited ${result.code}`,
        );
    }
    return result;
}

async function assertClientCheckout(options: IosGateOptions): Promise<void> {
    const head = await checked(options.runner, {
        command: "git",
        args: ["rev-parse", "HEAD"],
        cwd: options.clientRoot,
    });
    const status = await checked(options.runner, {
        command: "git",
        args: ["status", "--porcelain", "--untracked-files=all"],
        cwd: options.clientRoot,
    });
    if (
        head.stdout.trim() !== CLIENT_PRODUCT_SHA ||
        status.stdout.trim() !== ""
    ) throw new Error("iOS gate requires exact clean client checkout");
}

function xcodeInvocation(
    options: IosGateOptions,
    action: "test" | "build",
): CommandInvocation {
    return {
        command: "xcodebuild",
        args: [
            action,
            "-project",
            "JWTennisMatch.xcodeproj",
            "-scheme",
            "JWTennisMatch",
            "-destination",
            "platform=iOS Simulator,name=iPhone 17 Pro",
        ],
        cwd: `${options.clientRoot}/ios/JWTennisMatch`,
    };
}

async function append(
    options: IosGateOptions,
    stage: GateStage,
    invocation: CommandInvocation,
    result: CommandResult,
    startedAt: string,
): Promise<void> {
    const cursor = await readStageCursor(options.evidenceRoot);
    await appendStageEvidence(options.evidenceRoot, {
        schemaVersion: 1,
        stage,
        sequence: cursor.sequence,
        startedAt,
        endedAt: new Date().toISOString(),
        projectRef: options.expectedIdentity.validationRef,
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
        result: { passed: true, exitCode: result.code },
    });
}

export async function runIosGates(options: IosGateOptions): Promise<void> {
    for (
        const [action, stage] of [
            ["test", "ios-test"],
            ["build", "ios-build"],
        ] as const
    ) {
        await assertClientCheckout(options);
        const invocation = xcodeInvocation(options, action);
        const startedAt = new Date().toISOString();
        const result = await checked(options.runner, invocation);
        await assertClientCheckout(options);
        await append(options, stage, invocation, result, startedAt);
    }
}
