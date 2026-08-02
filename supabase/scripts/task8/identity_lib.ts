export const PRODUCTION_REF = "ydiusirreirhbvlftegp";
export const BACKEND_PRODUCT_SHA = "37e75f15e5c1efd68c6a3514cb2ddcd8695a02d3";
export const CLIENT_PRODUCT_SHA = "ab1a6f0a41f4ce62a9a69ada7408627190a34e2e";

const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const SYSTEM_IDENTIFIER_PATTERN = /^[0-9]{10,32}$/;
const OID_PATTERN = /^[1-9][0-9]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface DatabaseIdentity {
    projectRef: string;
    systemIdentifier: string;
    databaseOid: string;
    databaseName: string;
    sourceSystemIdentifier: string;
    markerDigest: string;
    provenanceId: string;
}

export interface ExpectedDatabaseIdentity {
    validationRef: string;
    productionSystemIdentifier: string;
    validationSystemIdentifier: string;
    databaseOid: string;
    markerDigest: string;
    provenanceId: string;
}

export function normalizeProjectRef(rawRef: string): string {
    const normalized = rawRef.trim();
    if (normalized === PRODUCTION_REF) {
        throw new Error("production project is forbidden");
    }
    if (!PROJECT_REF_PATTERN.test(normalized)) {
        throw new Error(
            "project ref must be exactly 20 lowercase ASCII letters",
        );
    }
    return normalized;
}

export function requireSystemIdentifier(
    value: string,
    label: string,
): string {
    const normalized = value.trim();
    if (!SYSTEM_IDENTIFIER_PATTERN.test(normalized)) {
        throw new Error(`${label} is not a valid PostgreSQL system identifier`);
    }
    return normalized;
}

export function requireDatabaseOid(value: string): string {
    const normalized = value.trim();
    if (!OID_PATTERN.test(normalized)) {
        throw new Error("database OID is invalid");
    }
    return normalized;
}

export function validateDatabaseIdentity(
    actual: DatabaseIdentity,
    expected: ExpectedDatabaseIdentity,
): DatabaseIdentity {
    const validationRef = normalizeProjectRef(expected.validationRef);
    const actualRef = normalizeProjectRef(actual.projectRef);
    if (actualRef !== validationRef) {
        throw new Error("database provenance project ref mismatch");
    }

    const productionIdentifier = requireSystemIdentifier(
        expected.productionSystemIdentifier,
        "production database fingerprint",
    );
    const expectedValidationIdentifier = requireSystemIdentifier(
        expected.validationSystemIdentifier,
        "validation database fingerprint",
    );
    const actualIdentifier = requireSystemIdentifier(
        actual.systemIdentifier,
        "server-derived database fingerprint",
    );
    if (actualIdentifier === productionIdentifier) {
        throw new Error("validation database fingerprint matches production");
    }
    if (actualIdentifier !== expectedValidationIdentifier) {
        throw new Error("validation database fingerprint mismatch");
    }

    const expectedOid = requireDatabaseOid(expected.databaseOid);
    if (requireDatabaseOid(actual.databaseOid) !== expectedOid) {
        throw new Error("database OID mismatch");
    }
    if (actual.databaseName.trim() !== "postgres") {
        throw new Error("database name mismatch");
    }
    if (
        !SHA256_PATTERN.test(expected.markerDigest) ||
        actual.markerDigest !== expected.markerDigest
    ) {
        throw new Error("provenance marker mismatch");
    }
    if (
        expected.provenanceId.trim() === "" ||
        actual.provenanceId !== expected.provenanceId
    ) {
        throw new Error("provenance ID mismatch");
    }
    if (actual.sourceSystemIdentifier !== productionIdentifier) {
        throw new Error("provenance source fingerprint mismatch");
    }

    return {
        projectRef: actualRef,
        systemIdentifier: actualIdentifier,
        databaseOid: expectedOid,
        databaseName: "postgres",
        sourceSystemIdentifier: productionIdentifier,
        markerDigest: actual.markerDigest,
        provenanceId: actual.provenanceId,
    };
}
