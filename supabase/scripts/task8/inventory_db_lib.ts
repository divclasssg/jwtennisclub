function unsupported(): never {
    throw new Error("canonical JSON contains an unsupported value");
}

function canonicalValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) =>
                    left < right ? -1 : left > right ? 1 : 0
                )
                .map(([key, child]) => [key, canonicalValue(child)]),
        );
    }
    if (
        value === null || typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
    ) {
        return value;
    }
    return unsupported();
}

export function extractSingleJsonPayload(stdout: string): unknown {
    const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length !== 1 || lines[0].trim() !== lines[0]) {
        throw new Error("psql must return exactly one JSON payload line");
    }
    try {
        const value = JSON.parse(lines[0]);
        if (
            value === null || typeof value !== "object" || Array.isArray(value)
        ) {
            throw new Error();
        }
        return value;
    } catch {
        throw new Error("psql must return exactly one JSON payload line");
    }
}

export function canonicalJson(value: unknown): string {
    return JSON.stringify(canonicalValue(value));
}

export async function sha256CanonicalJson(value: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(canonicalJson(value));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/;

export type DatabaseMigrationInventoryEntry =
    | {
        version: string;
        name: string;
        statementsState: "recorded";
        statementSha256: string;
        catalogSha256: string;
    }
    | {
        version: string;
        name: string;
        statementsState: "unavailable";
        statementSha256: null;
        catalogSha256: string;
    };

export interface DatabaseInventoryTable {
    schema: string;
    name: string;
    rowCount: number;
    sha256: string;
}

export interface DatabaseInventoryFunction {
    schema: string;
    name: string;
    identityArguments: string;
    sha256: string;
}

export interface DatabaseInventoryBucket {
    id: string;
    name: string;
    public: boolean;
    fileSizeLimit: number | null;
    allowedMimeTypes: string[] | null;
    objectCount: number;
}

export interface ValidatedDatabaseInventoryV2 {
    schemaVersion: 2;
    identity: {
        projectRef: string;
        systemIdentifier: string;
        databaseOid: string;
        sourceSystemIdentifier: string;
        markerDigest: string;
        provenanceId: string;
        sourceSnapshotAt: string;
    };
    migrations: DatabaseMigrationInventoryEntry[];
    memberBaseline: { count: number; sha256: string };
    authDatabaseInventory: {
        userCount: number;
        identityCount: number;
        providers: Record<string, number>;
    };
    tables: DatabaseInventoryTable[];
    storage: {
        buckets: DatabaseInventoryBucket[];
        totalObjectCount: number;
    };
    databaseFunctions: DatabaseInventoryFunction[];
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

function stringValue(value: unknown, path: string): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`${path} is required`);
    }
    return value;
}

function countValue(value: unknown, path: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`${path} must be a non-negative integer`);
    }
    return value as number;
}

function checksumValue(value: unknown, path: string): string {
    if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
        throw new Error(`${path} must be a SHA-256 checksum`);
    }
    return value;
}

function arrayValue(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
    return value;
}

function validateMigrationEntries(
    value: unknown,
): DatabaseMigrationInventoryEntry[] {
    const versions = new Set<string>();
    const names = new Set<string>();
    let previousVersion: string | undefined;
    return arrayValue(value, "databaseInventory.migrations").map(
        (entry, index) => {
            const path = `databaseInventory.migrations[${index}]`;
            const item = record(entry, path);
            exactKeys(item, [
                "version",
                "name",
                "statementsState",
                "statementSha256",
                "catalogSha256",
            ], path);
            const version = stringValue(item.version, `${path}.version`);
            const name = stringValue(item.name, `${path}.name`);
            if (!/^[0-9]{12,14}$/.test(version)) {
                throw new Error(`${path}.version is invalid`);
            }
            if (versions.has(version)) {
                throw new Error(`duplicate migration version: ${version}`);
            }
            if (names.has(name)) {
                throw new Error(`duplicate migration name: ${name}`);
            }
            if (previousVersion !== undefined && version < previousVersion) {
                throw new Error(
                    "migrations must be sorted by ascending version",
                );
            }
            versions.add(version);
            names.add(name);
            previousVersion = version;
            const catalogSha256 = checksumValue(
                item.catalogSha256,
                `${path}.catalogSha256`,
            );
            if (item.statementsState === "recorded") {
                return {
                    version,
                    name,
                    statementsState: "recorded" as const,
                    statementSha256: checksumValue(
                        item.statementSha256,
                        `${path}.statementSha256`,
                    ),
                    catalogSha256,
                };
            }
            if (item.statementsState === "unavailable") {
                if (item.statementSha256 !== null) {
                    throw new Error(
                        `${path}.statementSha256 must be null when unavailable`,
                    );
                }
                return {
                    version,
                    name,
                    statementsState: "unavailable" as const,
                    statementSha256: null,
                    catalogSha256,
                };
            }
            throw new Error(`${path}.statementsState is invalid`);
        },
    );
}

function validateTables(value: unknown): DatabaseInventoryTable[] {
    return arrayValue(value, "databaseInventory.tables").map(
        (entry, index) => {
            const path = `databaseInventory.tables[${index}]`;
            const item = record(entry, path);
            exactKeys(item, ["schema", "name", "rowCount", "sha256"], path);
            return {
                schema: stringValue(item.schema, `${path}.schema`),
                name: stringValue(item.name, `${path}.name`),
                rowCount: countValue(item.rowCount, `${path}.rowCount`),
                sha256: checksumValue(item.sha256, `${path}.sha256`),
            };
        },
    );
}

function validateFunctions(value: unknown): DatabaseInventoryFunction[] {
    return arrayValue(value, "databaseInventory.databaseFunctions").map(
        (entry, index) => {
            const path = `databaseInventory.databaseFunctions[${index}]`;
            const item = record(entry, path);
            exactKeys(
                item,
                ["schema", "name", "identityArguments", "sha256"],
                path,
            );
            if (typeof item.identityArguments !== "string") {
                throw new Error(`${path}.identityArguments is required`);
            }
            return {
                schema: stringValue(item.schema, `${path}.schema`),
                name: stringValue(item.name, `${path}.name`),
                identityArguments: item.identityArguments,
                sha256: checksumValue(item.sha256, `${path}.sha256`),
            };
        },
    );
}

function validateStorage(
    value: unknown,
): ValidatedDatabaseInventoryV2["storage"] {
    const storage = record(value, "databaseInventory.storage");
    exactKeys(
        storage,
        ["buckets", "totalObjectCount"],
        "databaseInventory.storage",
    );
    const buckets = arrayValue(
        storage.buckets,
        "databaseInventory.storage.buckets",
    ).map((entry, index) => {
        const path = `databaseInventory.storage.buckets[${index}]`;
        const item = record(entry, path);
        exactKeys(item, [
            "id",
            "name",
            "public",
            "fileSizeLimit",
            "allowedMimeTypes",
            "objectCount",
        ], path);
        if (typeof item.public !== "boolean") {
            throw new Error(`${path}.public is required`);
        }
        if (
            item.fileSizeLimit !== null &&
            (!Number.isSafeInteger(item.fileSizeLimit) ||
                (item.fileSizeLimit as number) < 0)
        ) {
            throw new Error(`${path}.fileSizeLimit is invalid`);
        }
        if (
            item.allowedMimeTypes !== null &&
            (!Array.isArray(item.allowedMimeTypes) ||
                !item.allowedMimeTypes.every((mime) =>
                    typeof mime === "string" && mime.trim() !== ""
                ))
        ) {
            throw new Error(`${path}.allowedMimeTypes is invalid`);
        }
        return {
            id: stringValue(item.id, `${path}.id`),
            name: stringValue(item.name, `${path}.name`),
            public: item.public,
            fileSizeLimit: item.fileSizeLimit as number | null,
            allowedMimeTypes: item.allowedMimeTypes as string[] | null,
            objectCount: countValue(item.objectCount, `${path}.objectCount`),
        };
    });
    return {
        buckets,
        totalObjectCount: countValue(
            storage.totalObjectCount,
            "databaseInventory.storage.totalObjectCount",
        ),
    };
}

export function validateDatabaseInventoryV2(
    value: unknown,
): ValidatedDatabaseInventoryV2 {
    const root = record(value, "databaseInventory");
    exactKeys(root, [
        "schemaVersion",
        "identity",
        "migrations",
        "memberBaseline",
        "authDatabaseInventory",
        "tables",
        "storage",
        "databaseFunctions",
    ], "databaseInventory");
    if (root.schemaVersion !== 2) {
        throw new Error("database inventory schemaVersion must equal 2");
    }

    const identity = record(root.identity, "databaseInventory.identity");
    exactKeys(identity, [
        "projectRef",
        "systemIdentifier",
        "databaseOid",
        "sourceSystemIdentifier",
        "markerDigest",
        "provenanceId",
        "sourceSnapshotAt",
    ], "databaseInventory.identity");
    const projectRef = stringValue(
        identity.projectRef,
        "databaseInventory.identity.projectRef",
    );
    if (!PROJECT_REF_PATTERN.test(projectRef)) {
        throw new Error("databaseInventory.identity.projectRef is invalid");
    }
    const systemIdentifier = stringValue(
        identity.systemIdentifier,
        "databaseInventory.identity.systemIdentifier",
    );
    const sourceSystemIdentifier = stringValue(
        identity.sourceSystemIdentifier,
        "databaseInventory.identity.sourceSystemIdentifier",
    );
    if (
        !/^[0-9]{10,32}$/.test(systemIdentifier) ||
        !/^[0-9]{10,32}$/.test(sourceSystemIdentifier)
    ) {
        throw new Error("databaseInventory identity fingerprint is invalid");
    }
    const databaseOid = stringValue(
        identity.databaseOid,
        "databaseInventory.identity.databaseOid",
    );
    if (!/^[1-9][0-9]*$/.test(databaseOid)) {
        throw new Error("databaseInventory.identity.databaseOid is invalid");
    }
    const sourceSnapshotAt = stringValue(
        identity.sourceSnapshotAt,
        "databaseInventory.identity.sourceSnapshotAt",
    );
    if (!Number.isFinite(Date.parse(sourceSnapshotAt))) {
        throw new Error(
            "databaseInventory.identity.sourceSnapshotAt is invalid",
        );
    }

    const member = record(
        root.memberBaseline,
        "databaseInventory.memberBaseline",
    );
    exactKeys(
        member,
        ["count", "sha256"],
        "databaseInventory.memberBaseline",
    );

    const auth = record(
        root.authDatabaseInventory,
        "databaseInventory.authDatabaseInventory",
    );
    exactKeys(auth, [
        "userCount",
        "identityCount",
        "providers",
    ], "databaseInventory.authDatabaseInventory");
    const providers = record(
        auth.providers,
        "databaseInventory.authDatabaseInventory.providers",
    );
    for (const [provider, count] of Object.entries(providers)) {
        stringValue(
            provider,
            "databaseInventory.authDatabaseInventory provider",
        );
        countValue(
            count,
            `databaseInventory.authDatabaseInventory.providers.${provider}`,
        );
    }

    return {
        schemaVersion: 2,
        identity: {
            projectRef,
            systemIdentifier,
            databaseOid,
            sourceSystemIdentifier,
            markerDigest: checksumValue(
                identity.markerDigest,
                "databaseInventory.identity.markerDigest",
            ),
            provenanceId: stringValue(
                identity.provenanceId,
                "databaseInventory.identity.provenanceId",
            ),
            sourceSnapshotAt,
        },
        migrations: validateMigrationEntries(root.migrations),
        memberBaseline: {
            count: countValue(
                member.count,
                "databaseInventory.memberBaseline.count",
            ),
            sha256: checksumValue(
                member.sha256,
                "databaseInventory.memberBaseline.sha256",
            ),
        },
        authDatabaseInventory: {
            userCount: countValue(
                auth.userCount,
                "databaseInventory.authDatabaseInventory.userCount",
            ),
            identityCount: countValue(
                auth.identityCount,
                "databaseInventory.authDatabaseInventory.identityCount",
            ),
            providers: providers as Record<string, number>,
        },
        tables: validateTables(root.tables),
        storage: validateStorage(root.storage),
        databaseFunctions: validateFunctions(root.databaseFunctions),
    };
}
