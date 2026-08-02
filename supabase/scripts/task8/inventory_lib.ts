import {
    type DatabaseIdentity,
    type ExpectedDatabaseIdentity,
    PRODUCTION_REF,
    validateDatabaseIdentity,
} from "./identity_lib.ts";
import {
    type RecoveryProfile,
    validateRecoveryProfile,
} from "./recovery_profile_lib.ts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const EDGE_FUNCTIONS = [
    "admin-command",
    "game-day-command",
    "game-day-snapshot",
    "match-recommendation",
    "member-link",
    "member-read",
    "operator-read",
] as const;

export interface InventoryBundleV2 {
    schemaVersion: 2;
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
        projectRef: string;
        siteUrl: string;
        redirectHosts: string[];
        jwtExpirySeconds: number;
    };
    tables: unknown[];
    storage: { projectRef: string; buckets: unknown[] };
    databaseFunctions: unknown[];
    edgeFunctions: Array<{ name: string; version: number; status: string }>;
    recoveryProfile: RecoveryProfile;
}

export interface InventoryValidationContext {
    storedIdentity: ExpectedDatabaseIdentity;
    liveIdentity: DatabaseIdentity;
    productionInventory: {
        projectRef: string;
        systemIdentifier: string;
        auth: {
            projectRef: string;
            siteUrl: string;
            redirectHosts: string[];
        };
        storage: { projectRef: string };
    };
}

export interface ValidatedInventoryBundle extends InventoryBundleV2 {
    derivedIsolation: {
        authProjectBound: true;
        storageProjectBound: true;
        networkHostsDistinct: true;
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

function requireChecksum(value: unknown, path: string): string {
    if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
        throw new Error(`${path} must be a SHA-256 checksum`);
    }
    return value;
}

function validateIdentity(
    root: Record<string, unknown>,
    context: InventoryValidationContext,
): void {
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
    const stored = context.storedIdentity;
    const expectedEntries: Array<[string, string]> = [
        ["validationRef", stored.validationRef],
        ["productionSystemIdentifier", stored.productionSystemIdentifier],
        ["validationSystemIdentifier", stored.validationSystemIdentifier],
        ["databaseOid", stored.databaseOid],
        ["markerDigest", stored.markerDigest],
        ["provenanceId", stored.provenanceId],
    ];
    if (
        !PROJECT_REF_PATTERN.test(stored.validationRef) ||
        expectedEntries.some(([key, expected]) => identity[key] !== expected)
    ) {
        throw new Error("inventory identity does not match stored identity");
    }
    validateDatabaseIdentity(context.liveIdentity, stored);
    const production = context.productionInventory;
    if (
        production.projectRef !== PRODUCTION_REF ||
        production.storage.projectRef !== PRODUCTION_REF ||
        production.systemIdentifier !== stored.productionSystemIdentifier
    ) {
        throw new Error("production inventory identity mismatch");
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

function hostFromSiteUrl(value: string, path: string): string {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.hostname === "") throw new Error();
        return url.hostname.toLowerCase();
    } catch {
        throw new Error(`${path} must be an HTTPS URL`);
    }
}

function overlapsHost(left: string, right: string): boolean {
    return left === right || left.endsWith(`.${right}`) ||
        right.endsWith(`.${left}`);
}

function validateAuthAndMember(
    root: Record<string, unknown>,
    context: InventoryValidationContext,
): {
    authProjectBound: true;
    networkHostsDistinct: true;
} {
    const member = record(root.memberBaseline, "memberBaseline");
    exactKeys(member, ["count", "sha256"], "memberBaseline");
    required(member, "count", isCount, "memberBaseline");
    requireChecksum(member.sha256, "memberBaseline.sha256");

    const auth = record(root.auth, "auth");
    exactKeys(auth, [
        "userCount",
        "identityCount",
        "providerCounts",
        "projectRef",
        "siteUrl",
        "redirectHosts",
        "jwtExpirySeconds",
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
    const authProjectRef = required(auth, "projectRef", isString, "auth");
    const siteUrl = required(auth, "siteUrl", isString, "auth");
    const redirectHosts = required(auth, "redirectHosts", isArray, "auth");
    if (!redirectHosts.every(isString)) {
        throw new Error("auth.redirectHosts is invalid");
    }
    required(auth, "jwtExpirySeconds", isCount, "auth");
    const productionAuth = context.productionInventory.auth;
    if (
        authProjectRef !== context.storedIdentity.validationRef ||
        authProjectRef === productionAuth.projectRef ||
        productionAuth.projectRef !== context.productionInventory.projectRef ||
        !PROJECT_REF_PATTERN.test(authProjectRef)
    ) {
        throw new Error("Auth project is not bound to validation");
    }
    const validationHosts = [
        hostFromSiteUrl(siteUrl, "auth.siteUrl"),
        ...redirectHosts.map((host) => host.toLowerCase()),
    ];
    const productionHosts = [
        hostFromSiteUrl(productionAuth.siteUrl, "production auth.siteUrl"),
        ...productionAuth.redirectHosts.map((host) => host.toLowerCase()),
    ];
    if (
        validationHosts.some((host) =>
            host.includes(PRODUCTION_REF) ||
            productionHosts.some((productionHost) =>
                overlapsHost(host, productionHost)
            )
        )
    ) {
        throw new Error("validation auth network host overlaps production");
    }
    return {
        authProjectBound: true,
        networkHostsDistinct: true,
    };
}

function validateTablesAndStorage(
    root: Record<string, unknown>,
    context: InventoryValidationContext,
): { storageProjectBound: true } {
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
    exactKeys(storage, ["projectRef", "buckets"], "storage");
    const storageProjectRef = required(
        storage,
        "projectRef",
        isString,
        "storage",
    );
    if (
        storageProjectRef !== context.storedIdentity.validationRef ||
        storageProjectRef === context.productionInventory.storage.projectRef ||
        !PROJECT_REF_PATTERN.test(storageProjectRef)
    ) {
        throw new Error("storage project is not bound to validation");
    }
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
    return { storageProjectBound: true };
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
        names.length !== 0 &&
        (names.length !== EDGE_FUNCTIONS.length ||
            names.some((name, index) =>
                name !== [...EDGE_FUNCTIONS].sort()[index]
            ))
    ) {
        throw new Error(
            "inventory must contain zero or exactly the seven approved edge functions",
        );
    }
    if (edgeFunctions.some(({ version }) => version < 1)) {
        throw new Error("edge function versions must be positive");
    }
    if (edgeFunctions.some(({ status }) => status !== "ACTIVE")) {
        throw new Error("all seven edge functions must have ACTIVE status");
    }
}

export function validateInventoryBundle(
    value: unknown,
    context: InventoryValidationContext,
    now = new Date(),
): ValidatedInventoryBundle {
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
        "recoveryProfile",
    ], "inventory");
    if (root.schemaVersion !== 2) throw new Error("schemaVersion must equal 2");
    validateIdentity(root, context);
    validateMigrations(root);
    const authIsolation = validateAuthAndMember(root, context);
    const storageIsolation = validateTablesAndStorage(root, context);
    validateFunctions(root);
    const recoveryProfile = validateRecoveryProfile(root.recoveryProfile, now);
    return {
        ...(value as InventoryBundleV2),
        recoveryProfile,
        derivedIsolation: {
            ...authIsolation,
            ...storageIsolation,
        },
    };
}
