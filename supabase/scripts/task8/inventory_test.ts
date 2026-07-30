/// <reference lib="deno.ns" />

import { validateInventoryBundle } from "./inventory_lib.ts";

function assert(
    condition: unknown,
    message = "assertion failed",
): asserts condition {
    if (!condition) throw new Error(message);
}

async function assertRejects(action: () => unknown, message: string) {
    try {
        await action();
    } catch (error) {
        const actual = error instanceof Error ? error.message : String(error);
        assert(actual.includes(message), `expected ${message}, got ${actual}`);
        return;
    }
    throw new Error(`expected rejection containing ${message}`);
}

function completeInventory() {
    return {
        schemaVersion: 1,
        identity: {
            validationRef: "abcdefghijklmnopqrst",
            productionSystemIdentifier: "1111111111111111111",
            validationSystemIdentifier: "2222222222222222222",
            databaseOid: "5",
            markerDigest: "9".repeat(64),
            provenanceId: "clone-ticket-42",
        },
        migrations: [{
            version: "20260730000000",
            name: "match",
            sha256: "a".repeat(64),
        }],
        memberBaseline: { count: 25, sha256: "b".repeat(64) },
        auth: {
            userCount: 25,
            identityCount: 25,
            providerCounts: { email: 25 },
            instanceId: "validation-auth-instance",
            siteUrl: "https://validation.invalid",
            redirectHosts: ["validation.invalid"],
            jwtExpirySeconds: 3600,
        },
        tables: [{
            schema: "match",
            name: "events",
            rowCount: 0,
            sha256: "c".repeat(64),
        }],
        storage: {
            projectRef: "abcdefghijklmnopqrst",
            buckets: [{
                id: "avatars",
                public: false,
                fileSizeLimit: 1048576,
                allowedMimeTypes: ["image/png"],
                objectCount: 0,
            }],
        },
        databaseFunctions: [{
            schema: "public",
            name: "match_state",
            identityArguments: "uuid",
            sha256: "d".repeat(64),
        }],
        edgeFunctions: [
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
        })),
        backup: {
            physicalBackupsEnabled: true,
            pitrEnabled: true,
            newestRecoveryPointAt: "2026-07-30T01:00:00.000Z",
        },
        recovery: {
            restoreStartedAt: "2026-07-30T01:01:00.000Z",
            restoreHealthyAt: "2026-07-30T01:31:00.000Z",
            recoveryPointAt: "2026-07-30T01:00:00.000Z",
            latestRestoredOperationAt: "2026-07-30T00:50:00.000Z",
            beforeMemberChecksum: "e".repeat(64),
            afterMemberChecksum: "e".repeat(64),
            beforeMatchChecksum: "f".repeat(64),
            afterMatchChecksum: "f".repeat(64),
        },
    };
}

function validationContext() {
    return {
        storedIdentity: {
            validationRef: "abcdefghijklmnopqrst",
            productionSystemIdentifier: "1111111111111111111",
            validationSystemIdentifier: "2222222222222222222",
            databaseOid: "5",
            markerDigest: "9".repeat(64),
            provenanceId: "clone-ticket-42",
        },
        liveIdentity: {
            projectRef: "abcdefghijklmnopqrst",
            systemIdentifier: "2222222222222222222",
            databaseOid: "5",
            databaseName: "postgres",
            sourceSystemIdentifier: "1111111111111111111",
            markerDigest: "9".repeat(64),
            provenanceId: "clone-ticket-42",
        },
        productionInventory: {
            projectRef: "ydiusirreirhbvlftegp",
            systemIdentifier: "1111111111111111111",
            auth: {
                instanceId: "production-auth-instance",
                siteUrl: "https://jwtennisclub.example",
                redirectHosts: ["jwtennisclub.example"],
            },
            storage: { projectRef: "ydiusirreirhbvlftegp" },
        },
    };
}

Deno.test("inventory accepts the exact versioned custody bundle", () => {
    const result = validateInventoryBundle(
        completeInventory(),
        validationContext(),
    );
    assert(result.edgeFunctions.length === 7);
    assert(result.derivedIsolation.authInstanceDistinct);
    assert(result.derivedIsolation.storageProjectBound);
    assert(result.derivedIsolation.networkHostsDistinct);
});

Deno.test("inventory fails closed when PITR or recovery evidence is missing", async () => {
    const missingPitr = completeInventory();
    delete (missingPitr.backup as Partial<typeof missingPitr.backup>)
        .pitrEnabled;
    await assertRejects(
        () => validateInventoryBundle(missingPitr, validationContext()),
        "backup.pitrEnabled",
    );

    const missingTiming = completeInventory();
    delete (missingTiming.recovery as Partial<typeof missingTiming.recovery>)
        .restoreHealthyAt;
    await assertRejects(
        () => validateInventoryBundle(missingTiming, validationContext()),
        "recovery.restoreHealthyAt",
    );
});

Deno.test("inventory requires exactly the seven approved edge functions", async () => {
    const inventory = completeInventory();
    inventory.edgeFunctions.pop();
    await assertRejects(
        () => validateInventoryBundle(inventory, validationContext()),
        "seven approved edge functions",
    );
});

Deno.test("inventory derives and rejects production-coupled auth/storage", async () => {
    const auth = completeInventory();
    auth.auth.instanceId = "production-auth-instance";
    await assertRejects(
        () => validateInventoryBundle(auth, validationContext()),
        "auth instance",
    );

    const storage = completeInventory();
    storage.storage.projectRef = "ydiusirreirhbvlftegp";
    await assertRejects(
        () => validateInventoryBundle(storage, validationContext()),
        "storage project",
    );

    const restore = completeInventory();
    restore.recovery.afterMemberChecksum = "0".repeat(64);
    await assertRejects(
        () => validateInventoryBundle(restore, validationContext()),
        "member checksum",
    );
});

Deno.test("inventory binds stored, live, and production identities", async () => {
    const storedMismatch = validationContext();
    storedMismatch.storedIdentity.markerDigest = "8".repeat(64);
    await assertRejects(
        () => validateInventoryBundle(completeInventory(), storedMismatch),
        "stored identity",
    );

    const liveMismatch = validationContext();
    liveMismatch.liveIdentity.systemIdentifier = "3333333333333333333";
    await assertRejects(
        () => validateInventoryBundle(completeInventory(), liveMismatch),
        "validation database fingerprint mismatch",
    );
});

Deno.test("inventory requires exact ACTIVE edge deployment status", async () => {
    const inventory = completeInventory();
    inventory.edgeFunctions[0].status = "DEPLOYING";
    await assertRejects(
        () => validateInventoryBundle(inventory, validationContext()),
        "ACTIVE",
    );
});

Deno.test("inventory rejects malformed entries, extra fields, and recovery limits", async () => {
    const extra = completeInventory() as
        & ReturnType<
            typeof completeInventory
        >
        & { bearerToken?: string };
    extra.bearerToken = "must-not-be-accepted";
    await assertRejects(
        () => validateInventoryBundle(extra, validationContext()),
        "unexpected field",
    );

    const malformed = completeInventory();
    malformed.migrations[0].sha256 = "not-a-hash";
    await assertRejects(
        () => validateInventoryBundle(malformed, validationContext()),
        "migrations[0].sha256",
    );

    const rto = completeInventory();
    rto.recovery.restoreHealthyAt = "2026-07-30T02:02:00.000Z";
    await assertRejects(
        () => validateInventoryBundle(rto, validationContext()),
        "RTO",
    );

    const rpo = completeInventory();
    rpo.recovery.latestRestoredOperationAt = "2026-07-30T00:44:00.000Z";
    await assertRejects(
        () => validateInventoryBundle(rpo, validationContext()),
        "RPO",
    );
});
