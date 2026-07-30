const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const EDGE_FUNCTIONS = [
    "admin-command",
    "game-day-command",
    "game-day-snapshot",
    "match-recommendation",
    "member-link",
    "member-read",
    "operator-read",
] as const;

export interface InventoryBundle {
    schemaVersion: 1;
    identity: {
        validationRef: string;
        productionSystemIdentifier: string;
        validationSystemIdentifier: string;
        databaseOid: string;
        markerDigest: string;
        provenanceId: string;
    };
    migrations: unknown[];
    memberBaseline: { count: number; sha256: string };
    auth: {
        userCount: number;
        identityCount: number;
        providerCounts: Record<string, number>;
        siteUrl: string;
        redirectHosts: string[];
        jwtExpirySeconds: number;
        isolatedFromProduction: true;
    };
    tables: unknown[];
    storage: { buckets: unknown[] };
    databaseFunctions: unknown[];
    edgeFunctions: Array<{ name: string; version: number; status: string }>;
    backup: {
        physicalBackupsEnabled: true;
        pitrEnabled: true;
        newestRecoveryPointAt: string;
    };
    recovery: {
        restoreStartedAt: string;
        restoreHealthyAt: string;
        recoveryPointAt: string;
        latestRestoredOperationAt: string;
        beforeMemberChecksum: string;
        afterMemberChecksum: string;
        beforeMatchChecksum: string;
        afterMatchChecksum: string;
    };
}

function record(value: unknown, path: string): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${path} must be an object`);
    }
    return value as Record<string, unknown>;
}

function exactKeys(
    value: Record<string, unknown>,
    allowed: readonly string[],
    path: string,
): void {
    const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
    if (unexpected) {
        throw new Error(`${path}.${unexpected} is an unexpected field`);
    }
}

function required<T>(
    value: Record<string, unknown>,
    key: string,
    predicate: (candidate: unknown) => candidate is T,
    path: string,
): T {
    const candidate = value[key];
    if (!predicate(candidate)) throw new Error(`${path}.${key} is required`);
    return candidate;
}

const isBoolean = (value: unknown): value is boolean =>
    typeof value === "boolean";
const isNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
const isCount = (value: unknown): value is number =>
    isNumber(value) && Number.isInteger(value) && value >= 0;
const isString = (value: unknown): value is string =>
    typeof value === "string" && value.trim() !== "";
const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

function requireIso(value: string, path: string): void {
    if (!Number.isFinite(Date.parse(value))) {
        throw new Error(`${path} is invalid`);
    }
}

function requireChecksum(value: unknown, path: string): string {
    if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
        throw new Error(`${path} must be a SHA-256 checksum`);
    }
    return value;
}

function validateIdentity(root: Record<string, unknown>): void {
    const identity = record(root.identity, "identity");
    exactKeys(identity, [
        "validationRef",
        "productionSystemIdentifier",
        "validationSystemIdentifier",
        "databaseOid",
        "markerDigest",
        "provenanceId",
    ], "identity");
    for (
        const key of [
            "validationRef",
            "productionSystemIdentifier",
            "validationSystemIdentifier",
            "databaseOid",
            "provenanceId",
        ]
    ) {
        required(identity, key, isString, "identity");
    }
    requireChecksum(identity.markerDigest, "identity.markerDigest");
    if (
        identity.productionSystemIdentifier ===
            identity.validationSystemIdentifier
    ) {
        throw new Error("identity fingerprints must differ");
    }
}

function validateMigrations(root: Record<string, unknown>): void {
    const migrations = required(root, "migrations", isArray, "inventory");
    migrations.forEach((entry, index) => {
        const path = `migrations[${index}]`;
        const item = record(entry, path);
        exactKeys(item, ["version", "name", "sha256"], path);
        const version = required(item, "version", isString, path);
        if (!/^[0-9]{12,14}$/.test(version)) {
            throw new Error(`${path}.version is invalid`);
        }
        required(item, "name", isString, path);
        requireChecksum(item.sha256, `${path}.sha256`);
    });
}

function validateAuthAndMember(root: Record<string, unknown>): void {
    const member = record(root.memberBaseline, "memberBaseline");
    exactKeys(member, ["count", "sha256"], "memberBaseline");
    required(member, "count", isCount, "memberBaseline");
    requireChecksum(member.sha256, "memberBaseline.sha256");

    const auth = record(root.auth, "auth");
    exactKeys(auth, [
        "userCount",
        "identityCount",
        "providerCounts",
        "siteUrl",
        "redirectHosts",
        "jwtExpirySeconds",
        "isolatedFromProduction",
    ], "auth");
    required(auth, "userCount", isCount, "auth");
    required(auth, "identityCount", isCount, "auth");
    const providers = record(auth.providerCounts, "auth.providerCounts");
    if (
        Object.entries(providers).some(([key, count]) =>
            !isString(key) || !isCount(count)
        )
    ) {
        throw new Error("auth.providerCounts is invalid");
    }
    required(auth, "siteUrl", isString, "auth");
    const redirectHosts = required(auth, "redirectHosts", isArray, "auth");
    if (!redirectHosts.every(isString)) {
        throw new Error("auth.redirectHosts is invalid");
    }
    required(auth, "jwtExpirySeconds", isCount, "auth");
    if (auth.isolatedFromProduction !== true) {
        throw new Error("auth.isolatedFromProduction must be true");
    }
}

function validateTablesAndStorage(root: Record<string, unknown>): void {
    const tables = required(root, "tables", isArray, "inventory");
    tables.forEach((entry, index) => {
        const path = `tables[${index}]`;
        const item = record(entry, path);
        exactKeys(item, ["schema", "name", "rowCount", "sha256"], path);
        required(item, "schema", isString, path);
        required(item, "name", isString, path);
        required(item, "rowCount", isCount, path);
        requireChecksum(item.sha256, `${path}.sha256`);
    });

    const storage = record(root.storage, "storage");
    exactKeys(storage, ["buckets"], "storage");
    const buckets = required(storage, "buckets", isArray, "storage");
    buckets.forEach((entry, index) => {
        const path = `storage.buckets[${index}]`;
        const item = record(entry, path);
        exactKeys(item, [
            "id",
            "public",
            "fileSizeLimit",
            "allowedMimeTypes",
            "objectCount",
        ], path);
        required(item, "id", isString, path);
        required(item, "public", isBoolean, path);
        if (item.fileSizeLimit !== null && !isCount(item.fileSizeLimit)) {
            throw new Error(`${path}.fileSizeLimit is invalid`);
        }
        if (
            item.allowedMimeTypes !== null &&
            (!isArray(item.allowedMimeTypes) ||
                !item.allowedMimeTypes.every(isString))
        ) {
            throw new Error(`${path}.allowedMimeTypes is invalid`);
        }
        required(item, "objectCount", isCount, path);
    });
}

function validateFunctions(root: Record<string, unknown>): void {
    const databaseFunctions = required(
        root,
        "databaseFunctions",
        isArray,
        "inventory",
    );
    databaseFunctions.forEach((entry, index) => {
        const path = `databaseFunctions[${index}]`;
        const item = record(entry, path);
        exactKeys(
            item,
            ["schema", "name", "identityArguments", "sha256"],
            path,
        );
        required(item, "schema", isString, path);
        required(item, "name", isString, path);
        if (typeof item.identityArguments !== "string") {
            throw new Error(`${path}.identityArguments is required`);
        }
        requireChecksum(item.sha256, `${path}.sha256`);
    });

    const edgeFunctions = required(root, "edgeFunctions", isArray, "inventory")
        .map((entry, index) => {
            const path = `edgeFunctions[${index}]`;
            const item = record(entry, path);
            exactKeys(item, ["name", "version", "status"], path);
            return {
                name: required(item, "name", isString, path),
                version: required(item, "version", isCount, path),
                status: required(item, "status", isString, path),
            };
        });
    const names = edgeFunctions.map(({ name }) => name).sort();
    if (
        names.length !== EDGE_FUNCTIONS.length ||
        names.some((name, index) => name !== [...EDGE_FUNCTIONS].sort()[index])
    ) {
        throw new Error(
            "inventory must contain exactly the seven approved edge functions",
        );
    }
    if (edgeFunctions.some(({ version }) => version < 1)) {
        throw new Error("edge function versions must be positive");
    }
}

function validateRecovery(root: Record<string, unknown>): void {
    const backup = record(root.backup, "backup");
    exactKeys(backup, [
        "physicalBackupsEnabled",
        "pitrEnabled",
        "newestRecoveryPointAt",
    ], "backup");
    required(backup, "physicalBackupsEnabled", isBoolean, "backup");
    required(backup, "pitrEnabled", isBoolean, "backup");
    if (backup.physicalBackupsEnabled !== true || backup.pitrEnabled !== true) {
        throw new Error("backup and PITR capability must be enabled");
    }
    const newest = required(
        backup,
        "newestRecoveryPointAt",
        isString,
        "backup",
    );
    requireIso(newest, "backup.newestRecoveryPointAt");

    const recovery = record(root.recovery, "recovery");
    exactKeys(recovery, [
        "restoreStartedAt",
        "restoreHealthyAt",
        "recoveryPointAt",
        "latestRestoredOperationAt",
        "beforeMemberChecksum",
        "afterMemberChecksum",
        "beforeMatchChecksum",
        "afterMatchChecksum",
    ], "recovery");
    const times = Object.fromEntries([
        "restoreStartedAt",
        "restoreHealthyAt",
        "recoveryPointAt",
        "latestRestoredOperationAt",
    ].map((key) => {
        const timestamp = required(recovery, key, isString, "recovery");
        requireIso(timestamp, `recovery.${key}`);
        return [key, Date.parse(timestamp)];
    }));
    const beforeMember = requireChecksum(
        recovery.beforeMemberChecksum,
        "recovery.beforeMemberChecksum",
    );
    const afterMember = requireChecksum(
        recovery.afterMemberChecksum,
        "recovery.afterMemberChecksum",
    );
    const beforeMatch = requireChecksum(
        recovery.beforeMatchChecksum,
        "recovery.beforeMatchChecksum",
    );
    const afterMatch = requireChecksum(
        recovery.afterMatchChecksum,
        "recovery.afterMatchChecksum",
    );
    if (beforeMember !== afterMember) {
        throw new Error("member checksum mismatch");
    }
    if (beforeMatch !== afterMatch) throw new Error("match checksum mismatch");
    const rtoMinutes = (times.restoreHealthyAt - times.restoreStartedAt) /
        60_000;
    const rpoMinutes =
        (times.recoveryPointAt - times.latestRestoredOperationAt) / 60_000;
    if (rtoMinutes < 0 || rtoMinutes > 60) {
        throw new Error("RTO exceeds 60 minutes");
    }
    if (rpoMinutes < 0 || rpoMinutes > 15) {
        throw new Error("RPO exceeds 15 minutes");
    }
}

export function validateInventoryBundle(value: unknown): InventoryBundle {
    const root = record(value, "inventory");
    exactKeys(root, [
        "schemaVersion",
        "identity",
        "migrations",
        "memberBaseline",
        "auth",
        "tables",
        "storage",
        "databaseFunctions",
        "edgeFunctions",
        "backup",
        "recovery",
    ], "inventory");
    if (root.schemaVersion !== 1) throw new Error("schemaVersion must equal 1");
    validateIdentity(root);
    validateMigrations(root);
    validateAuthAndMember(root);
    validateTablesAndStorage(root);
    validateFunctions(root);
    validateRecovery(root);
    return value as InventoryBundle;
}
