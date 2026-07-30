/// <reference lib="deno.ns" />

import { PRODUCTION_REF } from "./identity_lib.ts";
import type { RolloutCommandRunner } from "./rollout_lib.ts";

const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const SYSTEM_IDENTIFIER_PATTERN = /^[0-9]{10,32}$/;

export interface ProjectDbTarget {
    projectRef: string;
    host: string;
    user: string;
    database: string;
    sslMode: string;
}

export interface ManagementProjectIdentity {
    id: string;
    ref: string;
    name: string;
}

export interface BoundServerIdentity {
    projectRef: string;
    managementProjectId: string;
    managementProjectName: string;
    host: string;
    user: "postgres";
    database: "postgres";
    sslMode: "verify-full";
    systemIdentifier: string;
    databaseOid: string;
    databaseName: "postgres";
    serverFingerprintSha256: string;
}

type ConnectionPurpose = "production" | "validation";

export function derivedProjectDbTarget(projectRef: string): ProjectDbTarget {
    return {
        projectRef,
        host: `db.${projectRef}.supabase.co`,
        user: "postgres",
        database: "postgres",
        sslMode: "verify-full",
    };
}

function strictString(value: string, label: string): string {
    if (value === "" || value !== value.trim()) {
        throw new Error(`${label} must not contain surrounding whitespace`);
    }
    return value;
}

export function validateProjectDbTarget(
    target: ProjectDbTarget,
    purpose: ConnectionPurpose,
): ProjectDbTarget {
    const projectRef = strictString(target.projectRef, "project ref");
    if (!PROJECT_REF_PATTERN.test(projectRef)) {
        throw new Error(
            "project ref must be exactly 20 lowercase ASCII letters",
        );
    }
    if (purpose === "production" && projectRef !== PRODUCTION_REF) {
        throw new Error("production capture ref mismatch");
    }
    if (purpose === "validation" && projectRef === PRODUCTION_REF) {
        throw new Error("production project is forbidden");
    }

    const expectedHost = `db.${projectRef}.supabase.co`;
    const host = strictString(target.host, "database host");
    if (host !== expectedHost) {
        throw new Error(`host must equal ${expectedHost}`);
    }
    if (strictString(target.user, "database user") !== "postgres") {
        throw new Error("user must equal postgres");
    }
    if (strictString(target.database, "database name") !== "postgres") {
        throw new Error("database must equal postgres");
    }
    if (strictString(target.sslMode, "sslMode") !== "verify-full") {
        throw new Error("sslMode must equal verify-full");
    }
    return {
        projectRef,
        host,
        user: "postgres",
        database: "postgres",
        sslMode: "verify-full",
    };
}

export function boundPsqlInvocation(
    target: ProjectDbTarget,
    purpose: ConnectionPurpose,
): { args: string[]; env: Record<string, string> } {
    const bound = validateProjectDbTarget(target, purpose);
    return {
        args: [
            `--host=${bound.host}`,
            "--port=5432",
            "--username=postgres",
            "--dbname=postgres",
        ],
        env: { PGSSLMODE: "verify-full" },
    };
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

function parseIdentity(stdout: string): {
    systemIdentifier: string;
    databaseOid: string;
    databaseName: string;
} {
    const line = stdout.split(/\r?\n/).find((candidate) =>
        candidate.trim().startsWith("{")
    );
    if (!line) throw new Error("identity capture returned no JSON");
    const value = JSON.parse(line) as Record<string, unknown>;
    if (
        typeof value.systemIdentifier !== "string" ||
        !SYSTEM_IDENTIFIER_PATTERN.test(value.systemIdentifier) ||
        typeof value.databaseOid !== "string" ||
        !/^[1-9][0-9]*$/.test(value.databaseOid) ||
        value.databaseName !== "postgres"
    ) {
        throw new Error("identity capture returned invalid database identity");
    }
    return value as {
        systemIdentifier: string;
        databaseOid: string;
        databaseName: string;
    };
}

export async function captureBoundServerIdentity(options: {
    purpose: ConnectionPurpose;
    target: ProjectDbTarget;
    managementProject: ManagementProjectIdentity;
    runner: RolloutCommandRunner;
    cwd: string;
}): Promise<BoundServerIdentity> {
    const target = validateProjectDbTarget(options.target, options.purpose);
    for (
        const [value, label] of [
            [options.managementProject.id, "management project id"],
            [options.managementProject.ref, "management project ref"],
            [options.managementProject.name, "management project name"],
        ] as const
    ) {
        strictString(value, label);
    }
    if (
        options.managementProject.id !== target.projectRef ||
        options.managementProject.ref !== target.projectRef
    ) {
        throw new Error(
            "management project identity does not match target ref",
        );
    }

    const connection = boundPsqlInvocation(target, options.purpose);
    const result = await options.runner.run({
        command: "psql",
        args: [
            ...connection.args,
            "-X",
            "-A",
            "-t",
            "-v",
            "ON_ERROR_STOP=1",
            "-f",
            new URL("./sql/task8_capture_server_identity.sql", import.meta.url)
                .pathname,
        ],
        cwd: options.cwd,
        env: connection.env,
    });
    if (result.code !== 0) {
        throw new Error(result.stderr.trim() || "identity capture failed");
    }
    const identity = parseIdentity(result.stdout);
    return {
        projectRef: target.projectRef,
        managementProjectId: options.managementProject.id,
        managementProjectName: options.managementProject.name,
        host: target.host,
        user: "postgres",
        database: "postgres",
        sslMode: "verify-full",
        systemIdentifier: identity.systemIdentifier,
        databaseOid: identity.databaseOid,
        databaseName: "postgres",
        serverFingerprintSha256: await sha256(identity.systemIdentifier),
    };
}

export async function fetchManagementProjectIdentity(options: {
    projectRef: string;
    purpose: ConnectionPurpose;
    runner: RolloutCommandRunner;
    cwd: string;
}): Promise<ManagementProjectIdentity> {
    validateProjectDbTarget(
        derivedProjectDbTarget(options.projectRef),
        options.purpose,
    );
    const result = await options.runner.run({
        command: "supabase",
        args: ["projects", "list", "--output", "json"],
        cwd: options.cwd,
    });
    if (result.code !== 0) {
        throw new Error(
            result.stderr.trim() || "management project lookup failed",
        );
    }
    const projects = JSON.parse(result.stdout) as Array<
        Record<string, unknown>
    >;
    const matches = projects.filter((project) =>
        project.id === options.projectRef
    );
    if (
        matches.length !== 1 ||
        typeof matches[0].name !== "string" ||
        matches[0].name === ""
    ) {
        throw new Error("management project identity is missing or ambiguous");
    }
    return {
        id: options.projectRef,
        ref: options.projectRef,
        name: matches[0].name,
    };
}
