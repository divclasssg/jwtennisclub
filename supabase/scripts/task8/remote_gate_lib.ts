/// <reference lib="deno.ns" />

import {
    BACKEND_PRODUCT_SHA,
    CLIENT_PRODUCT_SHA,
    type ExpectedDatabaseIdentity,
    normalizeProjectRef,
} from "./identity_lib.ts";
import {
    boundPsqlInvocation,
    type ProjectDbTarget,
    validateProjectDbTarget,
} from "./connection_binding_lib.ts";
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

const EDGE_FUNCTIONS = [
    "admin-command",
    "game-day-command",
    "game-day-snapshot",
    "match-recommendation",
    "member-link",
    "member-read",
    "operator-read",
] as const;

const RPC_CASES = [
    {
        name: "allowed-release-state",
        rpc: "get_match_release_state",
        auth: "allowed.curl",
        payload: "get_match_release_state.json",
        status: 200,
        body: '"trafficEnabled":false',
    },
    {
        name: "unauthenticated",
        rpc: "get_match_operator_read",
        auth: "unauthenticated.curl",
        payload: "get_match_operator_read.json",
        status: 401,
        body: "",
    },
    {
        name: "insufficient-permission",
        rpc: "get_match_operator_read",
        auth: "insufficient.curl",
        payload: "get_match_operator_read.json",
        status: 403,
        body: "",
    },
    {
        name: "release-off-sqlstate",
        rpc: "apply_admin_command",
        auth: "admin.curl",
        payload: "apply_admin_command.json",
        status: 500,
        body: '"code":"55000"',
    },
] as const;

export interface RemoteGateOptions {
    evidenceRoot: string;
    backendRoot: string;
    clientRoot: string;
    target: ProjectDbTarget;
    expectedIdentity: ExpectedDatabaseIdentity;
    authConfigRoot: string;
    payloadRoot: string;
    runner: RolloutCommandRunner;
}

interface CurlResponse {
    result: CommandResult;
    body: string;
    httpCode: number;
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

async function assertWorkspace(
    runner: RolloutCommandRunner,
    root: string,
    head: string,
): Promise<void> {
    const actual = await checked(runner, {
        command: "git",
        args: ["rev-parse", "HEAD"],
        cwd: root,
    });
    const status = await checked(runner, {
        command: "git",
        args: ["status", "--porcelain", "--untracked-files=all"],
        cwd: root,
    });
    if (actual.stdout.trim() !== head || status.stdout.trim() !== "") {
        throw new Error("remote gate requires exact clean product checkout");
    }
}

function identityVariables(identity: ExpectedDatabaseIdentity): string[] {
    return [
        "-v",
        `task8_validation_ref=${identity.validationRef}`,
        "-v",
        `task8_production_system_identifier=${identity.productionSystemIdentifier}`,
        "-v",
        `task8_validation_system_identifier=${identity.validationSystemIdentifier}`,
        "-v",
        `task8_database_oid=${identity.databaseOid}`,
        "-v",
        `task8_marker_digest=${identity.markerDigest}`,
        "-v",
        `task8_provenance_id=${identity.provenanceId}`,
    ];
}

async function assertLiveIdentity(options: RemoteGateOptions): Promise<void> {
    const connection = boundPsqlInvocation(options.target, "validation");
    await checked(options.runner, {
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
            new URL("./sql/task8_identity.sql", import.meta.url).pathname,
        ],
        cwd: options.backendRoot,
        env: connection.env,
    });
}

async function assertPreconditions(options: RemoteGateOptions): Promise<void> {
    const target = validateProjectDbTarget(options.target, "validation");
    if (
        target.projectRef !==
            normalizeProjectRef(options.expectedIdentity.validationRef)
    ) throw new Error("remote gate target identity mismatch");
    await assertWorkspace(
        options.runner,
        options.backendRoot,
        BACKEND_PRODUCT_SHA,
    );
    await assertWorkspace(
        options.runner,
        options.clientRoot,
        CLIENT_PRODUCT_SHA,
    );
    await assertLiveIdentity(options);
}

function curlInvocation(
    options: RemoteGateOptions,
    authFile: string,
    payloadFile: string,
    url: string,
): CommandInvocation {
    return {
        command: "curl",
        args: [
            "--silent",
            "--show-error",
            "--request",
            "POST",
            "--config",
            `${options.authConfigRoot}/${authFile}`,
            "--header",
            "Content-Type: application/json",
            "--data-binary",
            `@${options.payloadRoot}/${payloadFile}`,
            "--write-out",
            '\n{"httpCode":%{http_code}}\n',
            url,
        ],
        cwd: options.backendRoot,
    };
}

async function runCurl(
    options: RemoteGateOptions,
    invocation: CommandInvocation,
): Promise<CurlResponse> {
    const result = await checked(options.runner, invocation);
    const lines = result.stdout.trimEnd().split(/\r?\n/);
    const metadata = lines.pop();
    let parsed: { httpCode?: unknown };
    try {
        parsed = JSON.parse(metadata ?? "") as { httpCode?: unknown };
    } catch {
        throw new Error("curl response metadata is invalid");
    }
    if (
        typeof parsed.httpCode !== "number" ||
        !Number.isInteger(parsed.httpCode)
    ) throw new Error("curl response metadata is invalid");
    return {
        result,
        body: lines.join("\n"),
        httpCode: parsed.httpCode,
    };
}

async function appendAggregateStage(
    options: RemoteGateOptions,
    stage: GateStage,
    startedAt: string,
    command: { program: string; args: string[] },
    results: CommandResult[],
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
        command,
        stdout: commandStreamEvidence(
            results.map((result) => result.stdout).join("\n"),
        ),
        stderr: commandStreamEvidence(
            results.map((result) => result.stderr).join("\n"),
        ),
        result: { passed: true, commandCount: results.length },
    });
}

export async function runDirectRpcGate(
    options: RemoteGateOptions,
): Promise<void> {
    await assertPreconditions(options);
    const startedAt = new Date().toISOString();
    const results: CommandResult[] = [];
    for (const testCase of RPC_CASES) {
        const invocation = curlInvocation(
            options,
            testCase.auth,
            testCase.payload,
            `https://${options.target.projectRef}.supabase.co/rest/v1/rpc/${testCase.rpc}`,
        );
        const response = await runCurl(options, invocation);
        results.push(response.result);
        if (
            response.httpCode !== testCase.status ||
            !response.body.includes(testCase.body)
        ) {
            throw new Error(`RPC postcondition failed: ${testCase.name}`);
        }
    }
    await assertLiveIdentity(options);
    await appendAggregateStage(
        options,
        "direct-rpc",
        startedAt,
        {
            program: "curl",
            args: RPC_CASES.map((testCase) =>
                `POST /rest/v1/rpc/${testCase.rpc} (${testCase.name})`
            ),
        },
        results,
    );
}

function functionsInvocation(
    options: RemoteGateOptions,
    action: "delete" | "deploy",
    name: string,
): CommandInvocation {
    return {
        command: "supabase",
        args: [
            "functions",
            action,
            name,
            "--project-ref",
            options.target.projectRef,
            ...(action === "delete" ? ["--yes"] : []),
        ],
        cwd: options.backendRoot,
    };
}

function listInvocation(options: RemoteGateOptions): CommandInvocation {
    return {
        command: "supabase",
        args: [
            "functions",
            "list",
            "--project-ref",
            options.target.projectRef,
            "--output",
            "json",
        ],
        cwd: options.backendRoot,
    };
}

function parseFunctionList(result: CommandResult): Array<{
    name: string;
    version: number;
    status: string;
}> {
    let value: unknown;
    try {
        value = JSON.parse(result.stdout);
    } catch {
        throw new Error("Edge function inventory is invalid");
    }
    if (!Array.isArray(value)) {
        throw new Error("Edge function inventory is invalid");
    }
    return value as Array<{ name: string; version: number; status: string }>;
}

export async function runEdgeReplacementGate(
    options: RemoteGateOptions & { approval: string },
): Promise<void> {
    await assertPreconditions(options);
    const identityDigest = await expectedIdentityDigest(
        options.expectedIdentity,
    );
    const expectedApproval =
        `EDGE:${options.target.projectRef}:${identityDigest}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`;
    if (options.approval !== expectedApproval) {
        throw new Error("explicit Edge replacement approval is required");
    }

    const deleteStartedAt = new Date().toISOString();
    const deleteResults: CommandResult[] = [];
    for (const name of EDGE_FUNCTIONS) {
        deleteResults.push(
            await checked(
                options.runner,
                functionsInvocation(options, "delete", name),
            ),
        );
    }
    const emptyResult = await checked(options.runner, listInvocation(options));
    deleteResults.push(emptyResult);
    if (parseFunctionList(emptyResult).length !== 0) {
        throw new Error("Edge inventory must be empty after exact deletion");
    }
    await appendAggregateStage(
        options,
        "edge-delete-empty",
        deleteStartedAt,
        {
            program: "supabase",
            args: ["functions delete", ...EDGE_FUNCTIONS, "then list empty"],
        },
        deleteResults,
    );

    const deployStartedAt = new Date().toISOString();
    const deployResults: CommandResult[] = [];
    for (const name of EDGE_FUNCTIONS) {
        deployResults.push(
            await checked(
                options.runner,
                functionsInvocation(options, "deploy", name),
            ),
        );
    }
    const activeResult = await checked(options.runner, listInvocation(options));
    deployResults.push(activeResult);
    const active = parseFunctionList(activeResult).sort((left, right) =>
        left.name.localeCompare(right.name)
    );
    const expectedNames = [...EDGE_FUNCTIONS].sort();
    if (
        active.length !== expectedNames.length ||
        active.some((item, index) =>
            item.name !== expectedNames[index] ||
            !Number.isInteger(item.version) ||
            item.version < 1 ||
            item.status !== "ACTIVE"
        )
    ) throw new Error("Edge inventory must be exact seven ACTIVE deployments");

    for (const name of EDGE_FUNCTIONS) {
        const response = await runCurl(
            options,
            curlInvocation(
                options,
                "release-off.curl",
                "edge-release-off.json",
                `https://${options.target.projectRef}.supabase.co/functions/v1/${name}`,
            ),
        );
        deployResults.push(response.result);
        if (
            response.httpCode !== 503 ||
            !response.body.includes('"code":"feature_unavailable"')
        ) throw new Error(`Edge release-off postcondition failed: ${name}`);
    }
    await assertLiveIdentity(options);
    await appendAggregateStage(
        options,
        "edge-deploy-active",
        deployStartedAt,
        {
            program: "supabase",
            args: [
                "functions deploy",
                ...EDGE_FUNCTIONS,
                "then list ACTIVE and curl release-off 503",
            ],
        },
        deployResults,
    );
}
