/// <reference lib="deno.ns" />

import { basename, isAbsolute, relative, resolve } from "node:path";
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

export interface IosGateOptions {
    evidenceRoot: string;
    clientRoot: string;
    configPath: string;
    expectedIdentity: ExpectedDatabaseIdentity;
    runner: RolloutCommandRunner;
}

interface RedactedIosConfig {
    digestSha256: string;
    url: string;
    publicKeyPresent: true;
    publicKeyClass: "publishable" | "anon-jwt";
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

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value),
    );
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

function classifyPublicKey(key: string): RedactedIosConfig["publicKeyClass"] {
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return "publishable";
    const parts = key.split(".");
    if (parts.length === 3 && parts.every((part) => part !== "")) {
        try {
            const base64 = parts[1].replaceAll("-", "+").replaceAll("_", "/")
                .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
            const payload = JSON.parse(atob(base64)) as Record<string, unknown>;
            if (payload.role === "anon") return "anon-jwt";
        } catch {
            // The caller receives the same fail-closed public-key error.
        }
    }
    throw new Error("Task8 config must contain a public Supabase key");
}

async function extractPlistValue(
    options: IosGateOptions,
    path: string,
    key: "SUPABASE_URL" | "SUPABASE_ANON_KEY",
): Promise<string> {
    const result = await options.runner.run({
        command: "plutil",
        args: ["-extract", key, "raw", "-o", "-", path],
        cwd: options.clientRoot,
    });
    if (result.code !== 0) {
        throw new Error("Task8 Supabase config could not be parsed");
    }
    return result.stdout.trim();
}

async function inspectConfig(
    options: IosGateOptions,
    path: string,
): Promise<RedactedIosConfig> {
    const url = await extractPlistValue(options, path, "SUPABASE_URL");
    const expectedUrl =
        `https://${options.expectedIdentity.validationRef}.supabase.co`;
    if (url !== expectedUrl) {
        throw new Error(`Task8 config must use exact validation Supabase URL`);
    }
    const publicKeyClass = classifyPublicKey(
        await extractPlistValue(options, path, "SUPABASE_ANON_KEY"),
    );
    const descriptor = {
        url,
        publicKeyPresent: true as const,
        publicKeyClass,
    };
    return {
        ...descriptor,
        digestSha256: await sha256(JSON.stringify(descriptor)),
    };
}

async function task8ConfigPath(options: IosGateOptions): Promise<string> {
    let configPath: string;
    try {
        configPath = await Deno.realPath(options.configPath);
    } catch {
        throw new Error("Task8 Supabase config file is missing");
    }
    const clientRoot = await Deno.realPath(options.clientRoot);
    const relativeToClient = relative(clientRoot, configPath);
    if (
        basename(configPath) !== "Task8Supabase.plist" ||
        relativeToClient === "" ||
        (!relativeToClient.startsWith("..") && !isAbsolute(relativeToClient))
    ) {
        throw new Error(
            "Task8 Supabase config must be external Task8Supabase.plist",
        );
    }
    const stat = await Deno.stat(configPath);
    if (
        !stat.isFile || stat.mode === null ||
        (stat.mode & 0o077) !== 0
    ) throw new Error("Task8 Supabase config must be a private regular file");
    return configPath;
}

async function assertMissing(path: string): Promise<void> {
    try {
        await Deno.lstat(path);
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return;
        throw error;
    }
    throw new Error("existing local Supabase.plist is forbidden");
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
    configDigestSha256: string,
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
        result: {
            passed: true,
            exitCode: result.code,
            configDigestSha256,
        },
    });
}

export async function runIosGates(options: IosGateOptions): Promise<void> {
    const sourceConfigPath = await task8ConfigPath(options);
    const sourceConfig = await inspectConfig(options, sourceConfigPath);
    const localConfigPath = resolve(
        options.clientRoot,
        "ios/JWTennisMatch/Configuration/Supabase.plist",
    );
    await assertMissing(localConfigPath);
    await assertClientCheckout(options);
    await Deno.copyFile(sourceConfigPath, localConfigPath);
    await Deno.chmod(localConfigPath, 0o600);
    try {
        for (
            const [action, stage] of [
                ["test", "ios-test"],
                ["build", "ios-build"],
            ] as const
        ) {
            await assertClientCheckout(options);
            const before = await inspectConfig(options, localConfigPath);
            if (before.digestSha256 !== sourceConfig.digestSha256) {
                throw new Error(
                    "Task8 Supabase config changed before iOS gate",
                );
            }
            const invocation = xcodeInvocation(options, action);
            const startedAt = new Date().toISOString();
            const result = await checked(options.runner, invocation);
            const after = await inspectConfig(options, localConfigPath);
            if (after.digestSha256 !== sourceConfig.digestSha256) {
                throw new Error(
                    "Task8 Supabase config changed during iOS gate",
                );
            }
            await assertClientCheckout(options);
            await append(
                options,
                stage,
                invocation,
                result,
                startedAt,
                sourceConfig.digestSha256,
            );
        }
    } finally {
        await Deno.remove(localConfigPath);
    }
    await assertClientCheckout(options);
}
