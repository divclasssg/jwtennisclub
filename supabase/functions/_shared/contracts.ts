import { z } from "zod";

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MEMBER_CODE_PATTERN = /^#[0-9]{4,}$/;
export const UuidSchema = z.string().regex(UUID_PATTERN);
const DateSchema = z.string().regex(DATE_PATTERN);
const DateTimeSchema = z.string().datetime({ offset: true });
const NonEmptyTextSchema = z.string().trim().min(1).max(100);
const PhoneSuffixSchema = z.string().regex(/^\d{4}$/);
const GenderSchema = z.enum(["female", "male", "unspecified"]);
const PositiveVersionSchema = z.number().int().positive();
const EmptyPayloadSchema = z.object({}).strict();

export const GAME_DAY_COMMAND_TYPES = [
    "create_game_day",
    "update_attendance",
    "activate_game_day",
    "set_active_courts",
    "designate_offline_device",
    "confirm_match",
    "start_match",
    "record_winner",
    "correct_winner",
    "cancel_match",
    "complete_game_day",
] as const;

const gameBase = {
    operationId: UuidSchema,
    gameDayId: UuidSchema,
    deviceId: UuidSchema,
    occurredAt: DateTimeSchema,
    source: z.enum(["online", "offline"]).default("online"),
};

function existingGameCommand<T extends string, P extends z.ZodType>(
    type: T,
    payload: P,
) {
    return z.object({
        ...gameBase,
        baseVersion: PositiveVersionSchema,
        type: z.literal(type),
        payload,
    }).strict();
}

const TeamSchema = z.tuple([UuidSchema, UuidSchema]);
export const GameDayCommandSchema = z.discriminatedUnion("type", [
    z.object({
        ...gameBase,
        baseVersion: z.literal(0),
        type: z.literal("create_game_day"),
        payload: z.object({
            seasonId: UuidSchema,
            playedOn: DateSchema,
            activeCourts: z.number().int().min(1).max(2),
            offlineOperatorId: UuidSchema,
            offlineDeviceId: UuidSchema,
        }).strict(),
    }).strict(),
    existingGameCommand(
        "update_attendance",
        z.object({
            memberId: UuidSchema,
            checkedIn: z.boolean(),
            allowPaused: z.boolean().optional(),
        }).strict(),
    ),
    existingGameCommand("activate_game_day", EmptyPayloadSchema),
    existingGameCommand(
        "set_active_courts",
        z.object({ activeCourts: z.number().int().min(1).max(2) }).strict(),
    ),
    existingGameCommand(
        "designate_offline_device",
        z.object({
            operatorId: UuidSchema,
            offlineDeviceId: UuidSchema,
            expiresAt: DateTimeSchema,
        }).strict(),
    ),
    existingGameCommand(
        "confirm_match",
        z.object({
            matchId: UuidSchema,
            courtNumber: z.number().int().min(1).max(2),
            team1: TeamSchema,
            team2: TeamSchema,
        }).strict().refine(
            ({ team1, team2 }) => new Set([...team1, ...team2]).size === 4,
        ),
    ),
    existingGameCommand(
        "start_match",
        z.object({ matchId: UuidSchema }).strict(),
    ),
    existingGameCommand(
        "record_winner",
        z.object({
            matchId: UuidSchema,
            winnerTeam: z.union([z.literal(1), z.literal(2)]),
        }).strict(),
    ),
    existingGameCommand(
        "correct_winner",
        z.object({
            matchId: UuidSchema,
            winnerTeam: z.union([z.literal(1), z.literal(2)]),
        }).strict(),
    ),
    existingGameCommand(
        "cancel_match",
        z.object({ matchId: UuidSchema }).strict(),
    ),
    existingGameCommand(
        "complete_game_day",
        z.object({ acknowledgeUnfinished: z.boolean() }).strict(),
    ),
]);

export const GameDayCommandResponseSchema = z.union([
    z.object({
        status: z.enum(["applied", "replayed"]),
        version: PositiveVersionSchema,
        conflict: z.null(),
    }).strict(),
    z.object({
        status: z.literal("conflict"),
        version: PositiveVersionSchema,
        conflict: z.object({ currentVersion: PositiveVersionSchema }).strict(),
    }).strict(),
]);

const adminBase = {
    operationId: UuidSchema,
    deviceId: UuidSchema,
    occurredAt: DateTimeSchema,
};
function adminCommand<T extends string, P extends z.ZodType>(
    type: T,
    payload: P,
) {
    return z.object({ ...adminBase, type: z.literal(type), payload }).strict();
}
const ProfileChangesSchema = z.object({
    publicAlias: NonEmptyTextSchema.optional(),
    gender: GenderSchema.optional(),
    gradeId: UuidSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

export const ADMIN_COMMAND_TYPES = [
    "setup_member_profile",
    "update_member",
    "update_member_profile",
    "create_grade",
    "update_grade",
    "create_season",
    "update_season",
    "review_member_link",
] as const;

export const AdminCommandSchema = z.discriminatedUnion("type", [
    adminCommand(
        "setup_member_profile",
        z.object({
            memberId: UuidSchema,
            publicAlias: NonEmptyTextSchema,
            gender: GenderSchema,
            gradeId: UuidSchema,
        }).strict(),
    ),
    adminCommand(
        "update_member",
        z.object({
            memberId: UuidSchema,
            changes: ProfileChangesSchema,
        }).strict(),
    ),
    adminCommand(
        "update_member_profile",
        z.object({
            memberId: UuidSchema,
            changes: ProfileChangesSchema,
        }).strict(),
    ),
    adminCommand(
        "create_grade",
        z.object({
            name: NonEmptyTextSchema,
            strength: z.number().int().positive(),
        }).strict(),
    ),
    adminCommand(
        "update_grade",
        z.object({
            gradeId: UuidSchema,
            name: NonEmptyTextSchema.optional(),
            strength: z.number().int().positive().optional(),
            active: z.boolean().optional(),
        }).strict().refine((value) => Object.keys(value).length > 1),
    ),
    adminCommand(
        "create_season",
        z.object({
            name: NonEmptyTextSchema,
            startsOn: DateSchema,
            endsOn: DateSchema.nullable().optional(),
        }).strict(),
    ),
    adminCommand(
        "update_season",
        z.object({
            seasonId: UuidSchema,
            name: NonEmptyTextSchema.optional(),
            startsOn: DateSchema.optional(),
            endsOn: DateSchema.nullable().optional(),
            active: z.boolean().optional(),
        }).strict().refine((value) => Object.keys(value).length > 1),
    ),
    adminCommand(
        "review_member_link",
        z.object({
            linkId: UuidSchema,
            decision: z.enum(["approved", "rejected"]),
        }).strict(),
    ),
]);

export const OperatorReadQuerySchema = z.object({
    scope: z.enum(["members", "seasons", "approvals"]),
}).strict();
const SetupStatusSchema = z.enum(["pending", "ready"]);
const OperatorMemberSchema = z.object({
    id: UuidSchema,
    memberCode: z.string().regex(MEMBER_CODE_PATTERN),
    legalName: NonEmptyTextSchema,
    memberStatus: z.enum(["active", "paused", "withdrawn"]),
    setupStatus: SetupStatusSchema,
    publicAlias: NonEmptyTextSchema.nullable(),
    phoneSuffix: PhoneSuffixSchema.nullable(),
    gender: GenderSchema.nullable(),
    gradeId: UuidSchema.nullable(),
    gradeName: NonEmptyTextSchema.nullable(),
    gradeStrength: z.number().int().positive().nullable(),
}).strict();
const OperatorGradeSchema = z.object({
    id: UuidSchema,
    name: NonEmptyTextSchema,
    strength: z.number().int().positive(),
    active: z.boolean(),
    updatedAt: DateTimeSchema,
}).strict();
export const OperatorReadResponseSchema = z.discriminatedUnion("scope", [
    z.object({
        scope: z.literal("members"),
        members: z.array(OperatorMemberSchema),
        grades: z.array(OperatorGradeSchema),
    }).strict(),
    z.object({
        scope: z.literal("seasons"),
        seasons: z.array(
            z.object({
                id: UuidSchema,
                name: NonEmptyTextSchema,
                startsOn: DateSchema,
                endsOn: DateSchema.nullable(),
                active: z.boolean(),
                createdAt: DateTimeSchema,
                updatedAt: DateTimeSchema,
            }).strict(),
        ),
    }).strict(),
    z.object({
        scope: z.literal("approvals"),
        approvals: z.array(
            z.object({
                id: UuidSchema,
                memberId: UuidSchema,
                memberCode: z.string().regex(MEMBER_CODE_PATTERN),
                legalName: NonEmptyTextSchema,
                setupStatus: SetupStatusSchema,
                publicAlias: NonEmptyTextSchema.nullable(),
                phoneSuffix: PhoneSuffixSchema.nullable(),
                requestedAt: DateTimeSchema,
            }).strict(),
        ),
    }).strict(),
]);

export const GameDaySnapshotQuerySchema = z.object({
    gameDayId: UuidSchema,
}).strict();
const MatchPlayerSchema = z.object({
    memberId: UuidSchema,
    legalName: NonEmptyTextSchema,
    publicAlias: NonEmptyTextSchema.nullable(),
    setupStatus: SetupStatusSchema,
    team: z.union([z.literal(1), z.literal(2)]),
    slot: z.number().int().min(1).max(4),
    gradeStrength: z.number().int().positive().nullable(),
}).strict();
const SnapshotMatchSchema: z.ZodType = z.object({
    id: UuidSchema,
    courtNumber: z.number().int().min(1).max(2),
    status: z.enum(["confirmed", "in_progress", "completed"]),
    winnerTeam: z.union([z.literal(1), z.literal(2)]).nullable(),
    version: PositiveVersionSchema,
    players: z.array(MatchPlayerSchema).max(4),
}).strict();
export const GameDaySnapshotSchema = z.object({
    id: UuidSchema,
    seasonId: UuidSchema,
    playedOn: DateSchema,
    status: z.enum(["draft", "active", "completed"]),
    activeCourts: z.number().int().min(1).max(2),
    version: PositiveVersionSchema,
    updatedAt: DateTimeSchema,
    attendees: z.array(
        z.object({
            memberId: UuidSchema,
            memberCode: z.string().regex(MEMBER_CODE_PATTERN),
            legalName: NonEmptyTextSchema,
            publicAlias: NonEmptyTextSchema.nullable(),
            setupStatus: SetupStatusSchema,
            phoneSuffix: PhoneSuffixSchema.nullable(),
            gender: GenderSchema.nullable(),
            gradeName: NonEmptyTextSchema.nullable(),
            gradeStrength: z.number().int().positive().nullable(),
            checkedIn: z.boolean(),
            gamesToday: z.number().int().nonnegative(),
        }).strict(),
    ),
    courts: z.array(
        z.object({
            courtNumber: z.number().int().min(1).max(2),
            currentMatch: SnapshotMatchSchema.nullable(),
            nextMatch: SnapshotMatchSchema.nullable(),
        }).strict(),
    ).max(2),
    completedMatches: z.array(SnapshotMatchSchema),
}).strict();

export const MatchRecommendationRequestSchema = z.object({
    gameDayId: UuidSchema,
    courtNumber: z.number().int().min(1).max(2),
}).strict();
export const MatchInputSchema = z.object({
    members: z.array(
        z.object({
            id: UuidSchema,
            games: z.number().int().nonnegative(),
            waitRank: z.number().int().nonnegative(),
            gender: GenderSchema,
            grade: z.number().int().positive(),
        }).strict(),
    ).max(32),
    completedMatches: z.array(
        z.object({
            team1: z.tuple([UuidSchema, UuidSchema]),
            team2: z.tuple([UuidSchema, UuidSchema]),
        }).strict(),
    ),
    inProgressMemberIds: z.array(UuidSchema),
}).strict();

export const MemberLinkRequestSchema = z.object({
    legalName: NonEmptyTextSchema,
    phoneSuffix: PhoneSuffixSchema,
}).strict();
export const MemberReadQuerySchema = z.discriminatedUnion("scope", [
    z.object({ scope: z.literal("current") }).strict(),
    z.object({ scope: z.literal("all") }).strict(),
    z.object({ scope: z.literal("season"), seasonId: UuidSchema }).strict(),
]);

export type GameDayCommand = z.infer<typeof GameDayCommandSchema>;
export type GameDayCommandResponse = z.infer<
    typeof GameDayCommandResponseSchema
>;
export type AdminCommand = z.infer<typeof AdminCommandSchema>;
export type OperatorReadQuery = z.infer<typeof OperatorReadQuerySchema>;
export type MemberLinkRequest = z.infer<typeof MemberLinkRequestSchema>;
export type MemberReadQuery = z.infer<typeof MemberReadQuerySchema>;
