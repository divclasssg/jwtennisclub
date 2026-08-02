const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BACKUP_ID_PATTERN =
    /^\d{8}T\d{9}Z-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WORKFLOW_RUN_ID_PATTERN = /^[1-9][0-9]*$/;
const LOGICAL_REPOSITORY = "divclasssg/jwtennisclub-backups";
const VALIDATION_PROJECT_REF = "orssnkppcukrqxikxdbf";
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface ManagedPitrProfile {
    readonly profile: "managed-pitr-v1";
    readonly physicalBackupsEnabled: true;
    readonly pitrEnabled: true;
    readonly newestRecoveryPointAt: string;
    readonly restoreStartedAt: string;
    readonly restoreHealthyAt: string;
    readonly recoveryPointAt: string;
    readonly latestRestoredOperationAt: string;
    readonly beforeMemberChecksum: string;
    readonly afterMemberChecksum: string;
    readonly beforeMatchChecksum: string;
    readonly afterMatchChecksum: string;
}

export interface LogicalOffsiteProfile {
    readonly profile: "logical-offsite-v1";
    readonly repository: typeof LOGICAL_REPOSITORY;
    readonly backupId: string;
    readonly workflowRunId: string;
    readonly encryptedArchiveSha256: string;
    readonly sourceFingerprintSha256: string;
    readonly archiveBytes: number;
    readonly backupStartedAt: string;
    readonly backupCompletedAt: string;
    readonly lastStateCheckAt: string;
    readonly maxStateCheckGapMinutes: number;
    readonly decryptTestedAt: string;
    readonly localRestoreTestedAt: string;
    readonly hostedRestoreStartedAt: string;
    readonly hostedRestoreHealthyAt: string;
    readonly hostedRestoreProjectRef: typeof VALIDATION_PROJECT_REF;
    readonly quarterlyDrillAt: string;
    readonly storageObjectCount: number;
    readonly storageObjectsProtected: boolean;
    readonly beforeMemberChecksum: string;
    readonly afterMemberChecksum: string;
    readonly beforeMatchChecksum: string;
    readonly afterMatchChecksum: string;
}

export type RecoveryProfile = ManagedPitrProfile | LogicalOffsiteProfile;

function record(value: unknown, path: string): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${path} must be an object`);
    }
    return value as Record<string, unknown>;
}

function exactKeys(
    value: Record<string, unknown>,
    allowed: readonly string[],
): void {
    const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
    if (unexpected) throw new Error(`${unexpected} is an unexpected field`);
}

function requiredString(
    value: Record<string, unknown>,
    key: string,
): string {
    const candidate = value[key];
    if (typeof candidate !== "string" || candidate.trim() === "") {
        throw new Error(`${key} is required`);
    }
    return candidate;
}

function requiredChecksum(
    value: Record<string, unknown>,
    key: string,
): string {
    const candidate = requiredString(value, key);
    if (!SHA256_PATTERN.test(candidate)) {
        throw new Error(`${key} must be a SHA-256 checksum`);
    }
    return candidate;
}

function requiredIso(
    value: Record<string, unknown>,
    key: string,
    nowMs: number,
): { value: string; ms: number } {
    const candidate = requiredString(value, key);
    const ms = Date.parse(candidate);
    if (!Number.isFinite(ms)) throw new Error(`${key} is invalid`);
    if (ms > nowMs) throw new Error(`${key} cannot be in the future`);
    return { value: candidate, ms };
}

function requiredInteger(
    value: Record<string, unknown>,
    key: string,
    minimum: number,
    maximum: number,
): number {
    const candidate = value[key];
    if (
        typeof candidate !== "number" || !Number.isInteger(candidate) ||
        candidate < minimum || candidate > maximum
    ) {
        throw new Error(
            `${key} must be an integer from ${minimum} to ${maximum}`,
        );
    }
    return candidate;
}

function requireMatchingChecksums(value: Record<string, unknown>) {
    const beforeMemberChecksum = requiredChecksum(
        value,
        "beforeMemberChecksum",
    );
    const afterMemberChecksum = requiredChecksum(value, "afterMemberChecksum");
    const beforeMatchChecksum = requiredChecksum(value, "beforeMatchChecksum");
    const afterMatchChecksum = requiredChecksum(value, "afterMatchChecksum");
    if (beforeMemberChecksum !== afterMemberChecksum) {
        throw new Error("member checksum mismatch");
    }
    if (beforeMatchChecksum !== afterMatchChecksum) {
        throw new Error("match checksum mismatch");
    }
    return {
        beforeMemberChecksum,
        afterMemberChecksum,
        beforeMatchChecksum,
        afterMatchChecksum,
    };
}

function validateManaged(
    value: Record<string, unknown>,
    nowMs: number,
): ManagedPitrProfile {
    exactKeys(value, [
        "profile",
        "physicalBackupsEnabled",
        "pitrEnabled",
        "newestRecoveryPointAt",
        "restoreStartedAt",
        "restoreHealthyAt",
        "recoveryPointAt",
        "latestRestoredOperationAt",
        "beforeMemberChecksum",
        "afterMemberChecksum",
        "beforeMatchChecksum",
        "afterMatchChecksum",
    ]);
    if (value.physicalBackupsEnabled !== true) {
        throw new Error("physicalBackupsEnabled must be true");
    }
    if (value.pitrEnabled !== true) throw new Error("pitrEnabled must be true");
    const newest = requiredIso(value, "newestRecoveryPointAt", nowMs);
    const restoreStarted = requiredIso(value, "restoreStartedAt", nowMs);
    const restoreHealthy = requiredIso(value, "restoreHealthyAt", nowMs);
    const recoveryPoint = requiredIso(value, "recoveryPointAt", nowMs);
    const latestOperation = requiredIso(
        value,
        "latestRestoredOperationAt",
        nowMs,
    );
    if (
        recoveryPoint.ms > newest.ms || restoreStarted.ms < recoveryPoint.ms ||
        restoreHealthy.ms < restoreStarted.ms
    ) {
        throw new Error("managed recovery timestamps are out of order");
    }
    if (restoreHealthy.ms - restoreStarted.ms > 60 * MINUTE_MS) {
        throw new Error("managed PITR RTO exceeds 60 minutes");
    }
    const rpoMs = recoveryPoint.ms - latestOperation.ms;
    if (rpoMs < 0 || rpoMs > 15 * MINUTE_MS) {
        throw new Error("managed PITR RPO exceeds 15 minutes");
    }
    return Object.freeze({
        profile: "managed-pitr-v1",
        physicalBackupsEnabled: true,
        pitrEnabled: true,
        newestRecoveryPointAt: newest.value,
        restoreStartedAt: restoreStarted.value,
        restoreHealthyAt: restoreHealthy.value,
        recoveryPointAt: recoveryPoint.value,
        latestRestoredOperationAt: latestOperation.value,
        ...requireMatchingChecksums(value),
    });
}

function validateLogical(
    value: Record<string, unknown>,
    nowMs: number,
): LogicalOffsiteProfile {
    exactKeys(value, [
        "profile",
        "repository",
        "backupId",
        "workflowRunId",
        "encryptedArchiveSha256",
        "sourceFingerprintSha256",
        "archiveBytes",
        "backupStartedAt",
        "backupCompletedAt",
        "lastStateCheckAt",
        "maxStateCheckGapMinutes",
        "decryptTestedAt",
        "localRestoreTestedAt",
        "hostedRestoreStartedAt",
        "hostedRestoreHealthyAt",
        "hostedRestoreProjectRef",
        "quarterlyDrillAt",
        "storageObjectCount",
        "storageObjectsProtected",
        "beforeMemberChecksum",
        "afterMemberChecksum",
        "beforeMatchChecksum",
        "afterMatchChecksum",
    ]);
    if (value.repository !== LOGICAL_REPOSITORY) {
        throw new Error(`repository must be ${LOGICAL_REPOSITORY}`);
    }
    const backupId = requiredString(value, "backupId");
    if (!BACKUP_ID_PATTERN.test(backupId)) {
        throw new Error("backupId is invalid");
    }
    const workflowRunId = requiredString(value, "workflowRunId");
    if (!WORKFLOW_RUN_ID_PATTERN.test(workflowRunId)) {
        throw new Error("workflowRunId is invalid");
    }
    const archiveBytes = requiredInteger(value, "archiveBytes", 1, 10_485_760);
    const backupStarted = requiredIso(value, "backupStartedAt", nowMs);
    const backupCompleted = requiredIso(value, "backupCompletedAt", nowMs);
    const stateCheck = requiredIso(value, "lastStateCheckAt", nowMs);
    const decryptTested = requiredIso(value, "decryptTestedAt", nowMs);
    const localRestore = requiredIso(value, "localRestoreTestedAt", nowMs);
    const hostedStarted = requiredIso(value, "hostedRestoreStartedAt", nowMs);
    const hostedHealthy = requiredIso(value, "hostedRestoreHealthyAt", nowMs);
    const quarterlyDrill = requiredIso(value, "quarterlyDrillAt", nowMs);
    if (backupCompleted.ms < backupStarted.ms) {
        throw new Error("backup timestamps are out of order");
    }
    if (
        decryptTested.ms < backupCompleted.ms ||
        localRestore.ms < backupCompleted.ms ||
        hostedStarted.ms < backupCompleted.ms ||
        hostedHealthy.ms < hostedStarted.ms
    ) {
        throw new Error("logical recovery timestamps are out of order");
    }
    let maxStateCheckGapMinutes: number;
    try {
        maxStateCheckGapMinutes = requiredInteger(
            value,
            "maxStateCheckGapMinutes",
            1,
            1440,
        );
    } catch {
        throw new Error(
            "state check gap must be an integer from 1 to 1440 minutes",
        );
    }
    if (nowMs - stateCheck.ms > 36 * 60 * MINUTE_MS) {
        throw new Error("state check is older than 36 hours");
    }
    if (hostedHealthy.ms - hostedStarted.ms > 60 * MINUTE_MS) {
        throw new Error("logical restore RTO exceeds 60 minutes");
    }
    if (nowMs - quarterlyDrill.ms > 93 * DAY_MS) {
        throw new Error("quarterly drill is older than 93 days");
    }
    if (value.hostedRestoreProjectRef !== VALIDATION_PROJECT_REF) {
        throw new Error(
            "hosted restore project is not the approved validation project",
        );
    }
    const storageObjectCount = requiredInteger(
        value,
        "storageObjectCount",
        0,
        Number.MAX_SAFE_INTEGER,
    );
    if (typeof value.storageObjectsProtected !== "boolean") {
        throw new Error("storageObjectsProtected is required");
    }
    if (storageObjectCount > 0 && value.storageObjectsProtected !== true) {
        throw new Error("Storage objects are not protected");
    }
    return Object.freeze({
        profile: "logical-offsite-v1",
        repository: LOGICAL_REPOSITORY,
        backupId,
        workflowRunId,
        encryptedArchiveSha256: requiredChecksum(
            value,
            "encryptedArchiveSha256",
        ),
        sourceFingerprintSha256: requiredChecksum(
            value,
            "sourceFingerprintSha256",
        ),
        archiveBytes,
        backupStartedAt: backupStarted.value,
        backupCompletedAt: backupCompleted.value,
        lastStateCheckAt: stateCheck.value,
        maxStateCheckGapMinutes,
        decryptTestedAt: decryptTested.value,
        localRestoreTestedAt: localRestore.value,
        hostedRestoreStartedAt: hostedStarted.value,
        hostedRestoreHealthyAt: hostedHealthy.value,
        hostedRestoreProjectRef: VALIDATION_PROJECT_REF,
        quarterlyDrillAt: quarterlyDrill.value,
        storageObjectCount,
        storageObjectsProtected: value.storageObjectsProtected,
        ...requireMatchingChecksums(value),
    });
}

export function validateRecoveryProfile(
    value: unknown,
    now: Date,
): RecoveryProfile {
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) throw new Error("now is invalid");
    const candidate = record(value, "recoveryProfile");
    if (candidate.profile === "managed-pitr-v1") {
        return validateManaged(candidate, nowMs);
    }
    if (candidate.profile === "logical-offsite-v1") {
        return validateLogical(candidate, nowMs);
    }
    throw new Error("recoveryProfile.profile is unsupported");
}
