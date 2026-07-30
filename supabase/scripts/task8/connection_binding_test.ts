/// <reference lib="deno.ns" />

import {
    boundPsqlInvocation,
    boundSupabaseDbUrl,
    captureBoundServerIdentity,
    configuredProjectDbTarget,
    derivedSupavisorSessionTarget,
    type ProjectDbTarget,
    validateBoundServerIdentityRecord,
    validateProjectDbTarget,
} from "./connection_binding_lib.ts";
import type {
    CommandInvocation,
    CommandResult,
    RolloutCommandRunner,
} from "./rollout_lib.ts";

function assert(
    condition: unknown,
    message = "assertion failed",
): asserts condition {
    if (!condition) throw new Error(message);
}

async function assertRejects(
    action: () => Promise<unknown> | unknown,
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

class IdentityRunner implements RolloutCommandRunner {
    invocations: CommandInvocation[] = [];

    run(invocation: CommandInvocation): Promise<CommandResult> {
        this.invocations.push(invocation);
        return Promise.resolve({
            code: 0,
            stdout: `${
                JSON.stringify({
                    systemIdentifier: "7668114044670738470",
                    databaseOid: "5",
                    databaseName: "postgres",
                })
            }\n`,
            stderr: "",
        });
    }
}

const productionRef = "ydiusirreirhbvlftegp";
const validationRef = "abcdefghijklmnopqrst";

function target(ref: string): ProjectDbTarget {
    return {
        projectRef: ref,
        host: `db.${ref}.supabase.co`,
        user: "postgres",
        database: "postgres",
        sslMode: "verify-full",
    };
}

Deno.test("clone-as-production alias attack is rejected before SQL", async () => {
    const runner = new IdentityRunner();
    await assertRejects(
        () =>
            captureBoundServerIdentity({
                purpose: "production",
                target: {
                    ...target(productionRef),
                    host: `db.${validationRef}.supabase.co`,
                },
                managementProject: {
                    id: productionRef,
                    ref: productionRef,
                    name: "jwtennisclub",
                },
                runner,
                cwd: Deno.cwd(),
            }),
        "host must equal db.ydiusirreirhbvlftegp.supabase.co",
    );
    assert(runner.invocations.length === 0, "SQL must not run");
});

Deno.test("bound targets reject whitespace, poolers, aliases, and user mismatch", async () => {
    for (
        const [candidate, expected] of [
            [
                { ...target(validationRef), projectRef: ` ${validationRef}` },
                "whitespace",
            ],
            [{
                ...target(validationRef),
                host: `aws-0-region.pooler.supabase.com`,
            }, "host must equal"],
            [
                { ...target(validationRef), host: "validation.internal" },
                "host must equal",
            ],
            [
                { ...target(validationRef), user: `postgres.${validationRef}` },
                "user must equal postgres",
            ],
            [
                { ...target(validationRef), sslMode: "require" },
                "sslMode must equal verify-full",
            ],
        ] as const
    ) {
        await assertRejects(
            () => validateProjectDbTarget(candidate, "validation"),
            expected,
        );
    }
});

Deno.test("capture binds management identity to an exact derived endpoint", async () => {
    const runner = new IdentityRunner();
    const result = await captureBoundServerIdentity({
        purpose: "validation",
        target: target(validationRef),
        managementProject: {
            id: validationRef,
            ref: validationRef,
            name: "approved-clone",
        },
        runner,
        cwd: Deno.cwd(),
    });
    assert(result.projectRef === validationRef);
    assert(result.managementProjectId === validationRef);
    assert(/^[a-f0-9]{64}$/.test(result.serverFingerprintSha256));
    const invocation = runner.invocations[0];
    assert(invocation.args.includes(`--host=db.${validationRef}.supabase.co`));
    assert(invocation.args.includes("--username=postgres"));
    assert(invocation.env?.PGSSLMODE === "verify-full");
    assert(!invocation.args.join(" ").includes("password"));
});

Deno.test("official Supavisor session URL binds the project ref and CA", () => {
    const caPath = "/private/evidence/supabase-root-ca.crt";
    const session = derivedSupavisorSessionTarget(
        validationRef,
        `postgresql://postgres.${validationRef}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`,
        caPath,
    );

    const invocation = boundPsqlInvocation(session, "validation");

    assert(
        invocation.args.includes(
            "--host=aws-1-ap-south-1.pooler.supabase.com",
        ),
    );
    assert(
        invocation.args.includes(`--username=postgres.${validationRef}`),
    );
    assert(invocation.args.includes("--port=5432"));
    assert(invocation.env.PGSSLMODE === "verify-full");
    assert(invocation.env.PGSSLROOTCERT === caPath);
    assert(
        boundSupabaseDbUrl(session, "validation") ===
            `postgresql://postgres.${validationRef}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`,
    );
    assert(
        boundSupabaseDbUrl(target(validationRef), "validation") ===
            `postgresql://postgres@db.${validationRef}.supabase.co:5432/postgres`,
    );
});

Deno.test("Supavisor binding rejects ambiguous or credential-bearing URLs", async () => {
    const caPath = "/private/evidence/supabase-root-ca.crt";
    for (
        const [url, expected] of [
            [
                `postgresql://postgres.${validationRef}@pooler.example.com:5432/postgres`,
                "official Supavisor session host",
            ],
            [
                `postgresql://postgres.${productionRef}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`,
                "pooler user",
            ],
            [
                `postgresql://postgres.${validationRef}:secret@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`,
                "must not contain a password",
            ],
            [
                `postgresql://postgres.${validationRef}@aws-1-ap-south-1.pooler.supabase.com:6543/postgres`,
                "port must equal 5432",
            ],
            [
                `postgresql://postgres.${validationRef}:@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`,
                "canonical passwordless",
            ],
            [
                `postgresql://postgres.${validationRef}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?`,
                "canonical passwordless",
            ],
            [
                `postgresql://postgres.${validationRef}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres#`,
                "canonical passwordless",
            ],
        ] as const
    ) {
        await assertRejects(
            () =>
                derivedSupavisorSessionTarget(
                    validationRef,
                    url,
                    caPath,
                ),
            expected,
        );
    }
});

Deno.test("configured target requires pooler URL and CA as an atomic pair", async () => {
    const url =
        `postgresql://postgres.${validationRef}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`;
    const caPath = "/private/evidence/supabase-root-ca.crt";

    const direct = configuredProjectDbTarget(validationRef, {});
    assert(direct.host === `db.${validationRef}.supabase.co`);

    const session = configuredProjectDbTarget(validationRef, {
        poolerUrl: url,
        sslRootCert: caPath,
    });
    assert(session.connectionMode === "supavisor-session");

    for (
        const inputs of [
            { poolerUrl: url },
            { sslRootCert: caPath },
            { poolerUrl: "", sslRootCert: "" },
        ]
    ) {
        await assertRejects(
            () => configuredProjectDbTarget(validationRef, inputs),
            inputs.poolerUrl === ""
                ? "must not be empty"
                : "must be supplied together",
        );
    }
});

Deno.test("recorded Supavisor identity is rebound to the exact project ref", async () => {
    const runner = new IdentityRunner();
    const captured = await captureBoundServerIdentity({
        purpose: "production",
        target: derivedSupavisorSessionTarget(
            productionRef,
            `postgresql://postgres.${productionRef}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`,
            "/private/evidence/supabase-root-ca.crt",
        ),
        managementProject: {
            id: productionRef,
            ref: productionRef,
            name: "jwtennisclub",
        },
        runner,
        cwd: Deno.cwd(),
    });

    validateBoundServerIdentityRecord(captured, "production");

    await assertRejects(
        () =>
            validateBoundServerIdentityRecord({
                ...captured,
                user: `postgres.${validationRef}`,
            }, "production"),
        "pooler user",
    );
});
