/// <reference lib="deno.ns" />

import { PRODUCTION_REF } from "./identity_lib.ts";
import type { RolloutCommandRunner } from "./rollout_lib.ts";

const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const SYSTEM_IDENTIFIER_PATTERN = /^[0-9]{10,32}$/;
const SUPAVISOR_SESSION_HOST_PATTERN =
    /^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/;

export interface ProjectDbTarget {
    projectRef: string;
    host: string;
    user: string;
    database: string;
    sslMode: string;
    connectionMode?: "direct" | "supavisor-session";
    sslRootCert?: string;
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
    user: string;
    database: "postgres";
    sslMode: "verify-full";
    connectionMode?: "direct" | "supavisor-session";
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

export function derivedSupavisorSessionTarget(
    projectRef: string,
    poolerUrl: string,
    sslRootCert: string,
): ProjectDbTarget {
    const ref = strictString(projectRef, "project ref");
    const rawUrl = strictString(poolerUrl, "pooler URL");
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new Error("pooler URL must be a valid URL");
    }
    if (url.protocol !== "postgresql:") {
        throw new Error("pooler URL protocol must equal postgresql");
    }
    if (!SUPAVISOR_SESSION_HOST_PATTERN.test(url.hostname)) {
        throw new Error(
            "pooler URL must use an official Supavisor session host",
        );
    }
    if (url.port !== "5432") {
        throw new Error("pooler URL port must equal 5432");
    }
    if (decodeURIComponent(url.username) !== `postgres.${ref}`) {
        throw new Error("pooler user must equal postgres.<project-ref>");
    }
    if (url.password !== "") {
        throw new Error("pooler URL must not contain a password");
    }
    if (url.pathname !== "/postgres" || url.search !== "" || url.hash !== "") {
        throw new Error("pooler URL must target only the postgres database");
    }
    const canonical =
        `postgresql://postgres.${ref}@${url.hostname}:5432/postgres`;
    if (rawUrl !== canonical) {
        throw new Error(
            "pooler URL must use the canonical passwordless form",
        );
    }
    return validateProjectDbTarget({
        projectRef: ref,
        host: url.hostname,
        user: decodeURIComponent(url.username),
        database: "postgres",
        sslMode: "verify-full",
        connectionMode: "supavisor-session",
        sslRootCert,
    }, ref === PRODUCTION_REF ? "production" : "validation");
}

export function configuredProjectDbTarget(
    projectRef: string,
    options: { poolerUrl?: string; sslRootCert?: string },
): ProjectDbTarget {
    const hasPoolerUrl = options.poolerUrl !== undefined;
    const hasSslRootCert = options.sslRootCert !== undefined;
    if (hasPoolerUrl !== hasSslRootCert) {
        throw new Error(
            "pooler URL and sslRootCert must be supplied together",
        );
    }
    if (hasPoolerUrl && hasSslRootCert) {
        if (options.poolerUrl === "" || options.sslRootCert === "") {
            throw new Error("pooler URL and sslRootCert must not be empty");
        }
        return derivedSupavisorSessionTarget(
            projectRef,
            options.poolerUrl!,
            options.sslRootCert!,
        );
    }
    return derivedProjectDbTarget(projectRef);
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

    const connectionMode = target.connectionMode ?? "direct";
    const host = strictString(target.host, "database host");
    const user = strictString(target.user, "database user");
    let sslRootCert: string | undefined;
    if (connectionMode === "direct") {
        const expectedHost = `db.${projectRef}.supabase.co`;
        if (host !== expectedHost) {
            throw new Error(`host must equal ${expectedHost}`);
        }
        if (user !== "postgres") {
            throw new Error("user must equal postgres");
        }
    } else if (connectionMode === "supavisor-session") {
        if (!SUPAVISOR_SESSION_HOST_PATTERN.test(host)) {
            throw new Error(
                "host must equal an official Supavisor session host",
            );
        }
        if (user !== `postgres.${projectRef}`) {
            throw new Error("pooler user must equal postgres.<project-ref>");
        }
        sslRootCert = strictString(
            target.sslRootCert ?? "",
            "sslRootCert",
        );
        if (!sslRootCert.startsWith("/")) {
            throw new Error("sslRootCert must be an absolute path");
        }
    } else {
        throw new Error("unsupported database connection mode");
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
        user,
        database: "postgres",
        sslMode: "verify-full",
        connectionMode,
        ...(sslRootCert ? { sslRootCert } : {}),
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
            `--username=${bound.user}`,
            "--dbname=postgres",
        ],
        env: {
            PGSSLMODE: "verify-full",
            ...(bound.sslRootCert ? { PGSSLROOTCERT: bound.sslRootCert } : {}),
        },
    };
}

export function boundSupabaseDbUrl(
    target: ProjectDbTarget,
    purpose: ConnectionPurpose,
): string {
    const bound = validateProjectDbTarget(target, purpose);
    return `postgresql://${bound.user}@${bound.host}:5432/postgres`;
}

export function validateLinkedPoolerState(
    target: ProjectDbTarget,
    rawPoolerUrl: string,
): void {
    const bound = validateProjectDbTarget(target, "validation");
    if (bound.connectionMode !== "supavisor-session") return;

    const canonical = `postgresql://${bound.user}@${bound.host}:5432/postgres`;
    const value = rawPoolerUrl.endsWith("\n")
        ? rawPoolerUrl.slice(0, -1)
        : rawPoolerUrl;
    if (value !== canonical) {
        throw new Error("linked pooler target mismatch");
    }
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
        user: target.user,
        database: "postgres",
        sslMode: "verify-full",
        connectionMode: target.connectionMode ?? "direct",
        systemIdentifier: identity.systemIdentifier,
        databaseOid: identity.databaseOid,
        databaseName: "postgres",
        serverFingerprintSha256: await sha256(identity.systemIdentifier),
    };
}

export function validateBoundServerIdentityRecord(
    identity: BoundServerIdentity,
    purpose: ConnectionPurpose,
): void {
    const connectionMode = identity.connectionMode ?? "direct";
    validateProjectDbTarget({
        projectRef: identity.projectRef,
        host: identity.host,
        user: identity.user,
        database: identity.database,
        sslMode: identity.sslMode,
        connectionMode,
        ...(connectionMode === "supavisor-session"
            ? { sslRootCert: "/recorded-supabase-root-ca" }
            : {}),
    }, purpose);
    if (
        strictString(identity.managementProjectId, "management project id") !==
            identity.projectRef ||
        strictString(
                identity.managementProjectName,
                "management project name",
            ) === "" ||
        identity.databaseName !== "postgres" ||
        !SYSTEM_IDENTIFIER_PATTERN.test(identity.systemIdentifier) ||
        !/^[1-9][0-9]*$/.test(identity.databaseOid) ||
        !/^[a-f0-9]{64}$/.test(identity.serverFingerprintSha256)
    ) {
        throw new Error("recorded database identity is invalid");
    }
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
