import { callRpc, readBearerToken, RpcHTTPError } from "../_shared/auth.ts";
import {
    AdminCommandSchema,
    GameDayCommandSchema,
    MatchInputSchema,
} from "../_shared/contracts.ts";
import {
    featureUnavailableResponse,
    readReleaseState,
} from "../_shared/release.ts";
import { recommendMatch } from "../_shared/matching/recommend.ts";
import matchingCases from "../../../contracts/matching/v1/cases.json" with {
    type: "json",
};
import {
    handleOperatorRead,
    type OperatorReadDependencies,
} from "../operator-read/index.ts";
import {
    type GameDaySnapshotDependencies,
    handleGameDaySnapshot,
} from "../game-day-snapshot/index.ts";
import {
    type GameDayCommandDependencies,
    handleGameDayCommand,
} from "../game-day-command/index.ts";
import {
    handleMatchRecommendation,
    type MatchRecommendationDependencies,
} from "../match-recommendation/index.ts";
import {
    type AdminCommandDependencies,
    handleAdminCommand,
} from "../admin-command/index.ts";
import {
    consumeMemberLinkRate,
    createOriginRateProof,
    handleMemberLink,
    type MemberLinkDependencies,
} from "../member-link/index.ts";
import {
    handleMemberRead,
    type MemberReadDependencies,
} from "../member-read/index.ts";

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message?: string): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            message ??
                `Expected ${JSON.stringify(expected)}, got ${
                    JSON.stringify(actual)
                }`,
        );
    }
}

const uuid = (suffix: number) =>
    `00000000-0000-0000-0000-${suffix.toString().padStart(12, "0")}`;
const occurredAt = "2026-07-29T12:00:00.000Z";
const bearerHeaders = { authorization: "Bearer caller.jwt.token" };

type MatchingCase = {
    name: string;
    input: Parameters<typeof recommendMatch>[0];
    expectedSelected: string[];
    expectedTeam1?: [string, string];
    expectedTeam2?: [string, string];
};

const validGameCommand = {
    operationId: uuid(1),
    gameDayId: uuid(2),
    baseVersion: 1,
    deviceId: uuid(3),
    occurredAt,
    type: "update_attendance",
    payload: { memberId: uuid(4), checkedIn: true, allowPaused: true },
};

const validAdminCommand = {
    operationId: uuid(1),
    deviceId: uuid(2),
    occurredAt,
    type: "setup_member_profile",
    payload: {
        memberId: uuid(3),
        publicAlias: "회원3",
        gender: "unspecified",
        gradeId: uuid(4),
    },
};

const snapshot = {
    id: uuid(1),
    seasonId: uuid(2),
    playedOn: "2026-07-29",
    status: "active",
    activeCourts: 1,
    version: 3,
    updatedAt: occurredAt,
    attendees: [{
        memberId: uuid(3),
        memberCode: "#0003",
        legalName: "회원 삼",
        publicAlias: "회원3",
        setupStatus: "ready",
        phoneSuffix: "1234",
        gender: "unspecified",
        gradeName: "A",
        gradeStrength: 1,
        checkedIn: true,
        gamesToday: 0,
    }],
    courts: [{ courtNumber: 1, currentMatch: null, nextMatch: null }],
    completedMatches: [],
};

const operatorMembers = {
    scope: "members",
    members: [{
        id: uuid(3),
        memberCode: "#0003",
        legalName: "회원 삼",
        memberStatus: "active",
        setupStatus: "ready",
        publicAlias: "회원3",
        phoneSuffix: "1234",
        gender: "unspecified",
        gradeId: uuid(4),
        gradeName: "A",
        gradeStrength: 1,
    }],
    grades: [{
        id: uuid(4),
        name: "A",
        strength: 1,
        active: true,
        updatedAt: occurredAt,
    }],
};

Deno.test("bearer parsing rejects missing and malformed authorization", () => {
    assertEquals(
        readBearerToken(new Headers(bearerHeaders)),
        "caller.jwt.token",
    );
    for (const value of ["", "Basic token", "Bearer", "Bearer one two"]) {
        const headers = new Headers(value ? { authorization: value } : {});
        assertEquals(readBearerToken(headers), null);
    }
});

Deno.test("RPC calls use only anon key and the original caller JWT", async () => {
    let outgoing: Request | undefined;
    const fetcher = (input: RequestInfo | URL, init?: RequestInit) => {
        outgoing = new Request(input, init);
        return Promise.resolve(Response.json({ ok: true }));
    };
    const result = await callRpc(
        new Request("http://edge.test", { headers: bearerHeaders }),
        "get_match_release_state",
        {},
        fetcher,
        1_000,
        { supabaseUrl: "https://project.test", anonKey: "public-anon" },
    );
    assertEquals(result, { ok: true });
    assert(outgoing !== undefined, "RPC request was not emitted");
    assertEquals(
        outgoing.url,
        "https://project.test/rest/v1/rpc/get_match_release_state",
    );
    assertEquals(outgoing.headers.get("apikey"), "public-anon");
    assertEquals(
        outgoing.headers.get("authorization"),
        "Bearer caller.jwt.token",
    );
    assertEquals(outgoing.headers.get("x-service-role-key"), null);
});

Deno.test("release reader fails closed unless the authoritative RPC says enabled", async () => {
    const request = new Request("http://edge.test", { headers: bearerHeaders });
    assertEquals(
        await readReleaseState(
            request,
            () => Promise.resolve({ trafficEnabled: true }),
        ),
        true,
    );
    for (
        const value of [
            false,
            null,
            {},
            { trafficEnabled: false },
            { trafficEnabled: "true" },
        ]
    ) {
        assertEquals(
            await readReleaseState(request, () => Promise.resolve(value)),
            false,
        );
    }
});

Deno.test("feature unavailable has one stable response contract", async () => {
    const response = featureUnavailableResponse();
    assertEquals(response.status, 503);
    assertEquals(await response.json(), {
        error: {
            code: "feature_unavailable",
            message: "Match service is temporarily unavailable.",
        },
    });
});

Deno.test("strict command schemas accept shared-member inputs only", () => {
    assert(
        GameDayCommandSchema.safeParse(validGameCommand).success,
        "allowPaused command rejected",
    );
    assert(
        AdminCommandSchema.safeParse(validAdminCommand).success,
        "setup_member_profile rejected",
    );
    for (
        const command of [
            {
                ...validAdminCommand,
                type: "create_member",
                payload: {
                    legalName: "raw name",
                    phoneSuffix: "1234",
                    publicAlias: "alias",
                    gender: "unspecified",
                    gradeId: uuid(4),
                },
            },
            {
                ...validAdminCommand,
                type: "set_member_active",
                payload: { memberId: uuid(3), active: false },
            },
            {
                ...validAdminCommand,
                type: "update_member",
                payload: {
                    memberId: uuid(3),
                    changes: { legalName: "new raw name" },
                },
            },
        ]
    ) {
        assertEquals(AdminCommandSchema.safeParse(command).success, false);
    }
});

Deno.test("all seven endpoints reject malformed bearer headers before dependencies", async () => {
    let touched = false;
    const common = {
        release: () => {
            touched = true;
            return Promise.resolve(true);
        },
        authorize: () => {
            touched = true;
            return Promise.resolve(true);
        },
    };
    const requests: Array<Promise<Response>> = [
        handleOperatorRead(
            new Request("http://edge.test?scope=members"),
            { ...common, read: () => Promise.resolve(operatorMembers) },
        ),
        handleGameDaySnapshot(
            new Request(`http://edge.test?gameDayId=${uuid(1)}`),
            { ...common, read: () => Promise.resolve(snapshot) },
        ),
        handleGameDayCommand(
            new Request("http://edge.test", {
                method: "POST",
                body: JSON.stringify(validGameCommand),
            }),
            { ...common, apply: () => Promise.resolve({}) },
        ),
        handleMatchRecommendation(
            new Request("http://edge.test", {
                method: "POST",
                body: JSON.stringify({ gameDayId: uuid(1), courtNumber: 1 }),
            }),
            { ...common, loadInput: () => Promise.resolve({}) },
        ),
        handleAdminCommand(
            new Request("http://edge.test", {
                method: "POST",
                body: JSON.stringify(validAdminCommand),
            }),
            { ...common, apply: () => Promise.resolve({}) },
        ),
        handleMemberLink(
            new Request("http://edge.test", {
                method: "POST",
                body: JSON.stringify({
                    legalName: "회원",
                    phoneSuffix: "1234",
                }),
            }),
            {
                ...common,
                consumeRate: () => Promise.resolve(true),
                requestLink: () => Promise.resolve({}),
            },
        ),
        handleMemberRead(
            new Request("http://edge.test?scope=all"),
            { ...common, read: () => Promise.resolve({}) },
        ),
    ];
    const responses = await Promise.all(requests);
    assertEquals(
        responses.map((response) => response.status),
        Array(7).fill(401),
    );
    assertEquals(touched, false);
});

Deno.test("all seven endpoints stop at the release gate", async () => {
    let domainCalls = 0;
    const common = {
        release: () => Promise.resolve(false),
        authorize: () => {
            domainCalls++;
            return Promise.resolve(true);
        },
    };
    const requests: Array<Promise<Response>> = [
        handleOperatorRead(
            new Request("http://edge.test?scope=members", {
                headers: bearerHeaders,
            }),
            {
                ...common,
                read: () => {
                    domainCalls++;
                    return Promise.resolve(operatorMembers);
                },
            },
        ),
        handleGameDaySnapshot(
            new Request(`http://edge.test?gameDayId=${uuid(1)}`, {
                headers: bearerHeaders,
            }),
            {
                ...common,
                read: () => {
                    domainCalls++;
                    return Promise.resolve(snapshot);
                },
            },
        ),
        handleGameDayCommand(
            new Request("http://edge.test", {
                method: "POST",
                headers: bearerHeaders,
                body: JSON.stringify(validGameCommand),
            }),
            {
                ...common,
                apply: () => {
                    domainCalls++;
                    return Promise.resolve({});
                },
            },
        ),
        handleMatchRecommendation(
            new Request("http://edge.test", {
                method: "POST",
                headers: bearerHeaders,
                body: JSON.stringify({ gameDayId: uuid(1), courtNumber: 1 }),
            }),
            {
                ...common,
                loadInput: () => {
                    domainCalls++;
                    return Promise.resolve({});
                },
            },
        ),
        handleAdminCommand(
            new Request("http://edge.test", {
                method: "POST",
                headers: bearerHeaders,
                body: JSON.stringify(validAdminCommand),
            }),
            {
                ...common,
                apply: () => {
                    domainCalls++;
                    return Promise.resolve({});
                },
            },
        ),
        handleMemberLink(
            new Request("http://edge.test", {
                method: "POST",
                headers: bearerHeaders,
                body: JSON.stringify({
                    legalName: "회원",
                    phoneSuffix: "1234",
                }),
            }),
            {
                ...common,
                consumeRate: () => {
                    domainCalls++;
                    return Promise.resolve(true);
                },
                requestLink: () => {
                    domainCalls++;
                    return Promise.resolve({});
                },
            },
        ),
        handleMemberRead(
            new Request("http://edge.test?scope=all", {
                headers: bearerHeaders,
            }),
            {
                ...common,
                read: () => {
                    domainCalls++;
                    return Promise.resolve({});
                },
            },
        ),
    ];
    const responses = await Promise.all(requests);
    assertEquals(
        responses.map((response) => response.status),
        Array(7).fill(503),
    );
    for (const response of responses) {
        assertEquals((await response.json()).error.code, "feature_unavailable");
    }
    assertEquals(domainCalls, 0);
});

Deno.test("operator read maps to the canonical RPC response contract", async () => {
    const dependencies: OperatorReadDependencies = {
        release: () => Promise.resolve(true),
        authorize: () => Promise.resolve(true),
        read: () => Promise.resolve(operatorMembers),
    };
    const response = await handleOperatorRead(
        new Request("http://edge.test?scope=members", {
            headers: bearerHeaders,
        }),
        dependencies,
    );
    assertEquals(response.status, 200);
    assertEquals(await response.json(), operatorMembers);
});

Deno.test("game-day snapshot preserves the canonical nullable member contract", async () => {
    const dependencies: GameDaySnapshotDependencies = {
        release: () => Promise.resolve(true),
        authorize: () => Promise.resolve(true),
        read: () => Promise.resolve(snapshot),
    };
    const response = await handleGameDaySnapshot(
        new Request(`http://edge.test?gameDayId=${uuid(1)}`, {
            headers: bearerHeaders,
        }),
        dependencies,
    );
    assertEquals(response.status, 200);
    assertEquals(await response.json(), snapshot);
});

Deno.test("command handlers preserve applied and conflict responses", async () => {
    const common = {
        release: () => Promise.resolve(true),
        authorize: () => Promise.resolve(true),
    };
    const applied = await handleGameDayCommand(
        new Request("http://edge.test", {
            method: "POST",
            headers: bearerHeaders,
            body: JSON.stringify(validGameCommand),
        }),
        {
            ...common,
            apply: () =>
                Promise.resolve({
                    status: "applied",
                    version: 2,
                    conflict: null,
                }),
        },
    );
    assertEquals(applied.status, 200);
    assertEquals(await applied.json(), {
        status: "applied",
        version: 2,
        conflict: null,
    });

    const conflict = await handleGameDayCommand(
        new Request("http://edge.test", {
            method: "POST",
            headers: bearerHeaders,
            body: JSON.stringify(validGameCommand),
        }),
        {
            ...common,
            apply: () =>
                Promise.resolve({
                    status: "conflict",
                    version: 3,
                    conflict: { currentVersion: 3 },
                }),
        },
    );
    assertEquals(conflict.status, 409);

    const admin = await handleAdminCommand(
        new Request("http://edge.test", {
            method: "POST",
            headers: bearerHeaders,
            body: JSON.stringify(validAdminCommand),
        }),
        {
            ...common,
            apply: () =>
                Promise.resolve({
                    status: "applied",
                    targetType: "member_profile",
                    targetId: uuid(3),
                    version: 1,
                }),
        },
    );
    assertEquals(admin.status, 200);
    assertEquals((await admin.json()).targetType, "member_profile");
});

Deno.test("release-off database command errors normalize to feature unavailable", async () => {
    const dependencies: GameDayCommandDependencies = {
        release: () => Promise.resolve(true),
        authorize: () => Promise.resolve(true),
        apply: () =>
            Promise.reject(
                new RpcHTTPError(
                    400,
                    '{"code":"55000","message":"match traffic is disabled"}',
                ),
            ),
    };
    const response = await handleGameDayCommand(
        new Request("http://edge.test", {
            method: "POST",
            headers: bearerHeaders,
            body: JSON.stringify(validGameCommand),
        }),
        dependencies,
    );
    assertEquals(response.status, 503);
    assertEquals((await response.json()).error.code, "feature_unavailable");
});

Deno.test("RPC errors keep auth permission validation and conflict boundaries", async () => {
    const base: AdminCommandDependencies = {
        release: () => Promise.resolve(true),
        authorize: () => Promise.resolve(true),
        apply: () => Promise.resolve({}),
    };
    const expected: Array<[RpcHTTPError, number]> = [
        [new RpcHTTPError(401, '{"code":"PGRST301"}'), 401],
        [new RpcHTTPError(400, '{"code":"42501"}'), 403],
        [new RpcHTTPError(400, '{"code":"22023"}'), 400],
        [new RpcHTTPError(409, '{"code":"23505"}'), 409],
    ];
    for (const [error, status] of expected) {
        const response = await handleAdminCommand(
            new Request("http://edge.test", {
                method: "POST",
                headers: bearerHeaders,
                body: JSON.stringify(validAdminCommand),
            }),
            { ...base, apply: () => Promise.reject(error) },
        );
        assertEquals(response.status, status);
    }
});

Deno.test("matcher endpoint returns the preserved deterministic suggestion", async () => {
    const dependencies: MatchRecommendationDependencies = {
        release: () => Promise.resolve(true),
        authorize: () => Promise.resolve(true),
        loadInput: () =>
            Promise.resolve({
                members: [1, 2, 3, 4, 5].map((value) => ({
                    id: uuid(value),
                    games: value === 5 ? 1 : 0,
                    waitRank: value - 1,
                    gender: value % 2 ? "female" as const : "male" as const,
                    grade: value <= 2 ? 2 : 1,
                })),
                completedMatches: [],
                inProgressMemberIds: [],
            }),
    };
    const response = await handleMatchRecommendation(
        new Request("http://edge.test", {
            method: "POST",
            headers: bearerHeaders,
            body: JSON.stringify({ gameDayId: uuid(20), courtNumber: 1 }),
        }),
        dependencies,
    );
    assertEquals(response.status, 200);
    assertEquals(
        (await response.json()).selected,
        [uuid(1), uuid(2), uuid(3), uuid(4)],
    );
});

Deno.test("matcher input accepts 32 members and rejects 33 members", () => {
    const input = (memberCount: number) => ({
        members: Array.from({ length: memberCount }, (_, index) => ({
            id: uuid(index + 1),
            games: 0,
            waitRank: index,
            gender: index % 2 === 0 ? "female" as const : "male" as const,
            grade: 1,
        })),
        completedMatches: [],
        inProgressMemberIds: [],
    });

    assertEquals(MatchInputSchema.safeParse(input(32)).success, true);
    assertEquals(MatchInputSchema.safeParse(input(33)).success, false);
});

Deno.test("matcher endpoint rejects oversized database input with stable 400", async () => {
    const response = await handleMatchRecommendation(
        new Request("http://edge.test", {
            method: "POST",
            headers: bearerHeaders,
            body: JSON.stringify({ gameDayId: uuid(20), courtNumber: 1 }),
        }),
        {
            release: () => Promise.resolve(true),
            authorize: () => Promise.resolve(true),
            loadInput: () =>
                Promise.resolve({
                    members: Array.from({ length: 33 }, (_, index) => ({
                        id: uuid(index + 1),
                        games: 0,
                        waitRank: index,
                        gender: index % 2 === 0
                            ? "female" as const
                            : "male" as const,
                        grade: 1,
                    })),
                    completedMatches: [],
                    inProgressMemberIds: [],
                }),
        },
    );

    assertEquals(response.status, 400);
    assertEquals(await response.json(), { error: "invalid_request" });
});

Deno.test("matcher remains deterministic at the 32-member product cap", () => {
    const result = recommendMatch({
        members: Array.from({ length: 32 }, (_, index) => ({
            id: uuid(index + 1),
            games: index < 4 ? 0 : 1,
            waitRank: index,
            gender: index % 2 === 0 ? "female" : "male",
            grade: 1,
        })),
        completedMatches: [],
        inProgressMemberIds: [],
    });

    assertEquals(result.selected, [uuid(1), uuid(2), uuid(3), uuid(4)]);
});

for (const fixture of matchingCases as MatchingCase[]) {
    Deno.test(`matching contract: ${fixture.name}`, () => {
        const result = recommendMatch(fixture.input);
        assertEquals(result.selected, fixture.expectedSelected);
        if (fixture.expectedTeam1) {
            assertEquals(result.team1, fixture.expectedTeam1);
        }
        if (fixture.expectedTeam2) {
            assertEquals(result.team2, fixture.expectedTeam2);
        }
    });
}

Deno.test("member-link origin proof never contains the raw origin", async () => {
    const proof = await createOriginRateProof(
        "203.0.113.42",
        "edge-secret-value",
        new Date("2026-07-29T12:34:00.000Z"),
    );
    assertEquals(proof.windowStartedAt, "2026-07-29T12:00:00.000Z");
    assert(!proof.originBucket.includes("203.0.113.42"), "raw IP leaked");
    assert(!proof.proof.includes("203.0.113.42"), "raw IP leaked in proof");
    assert(/^[0-9a-f]{64}$/.test(proof.originBucket), "bucket is not SHA-256");
    assert(/^[0-9a-f]{64}$/.test(proof.proof), "proof is not HMAC-SHA256");
});

Deno.test("shared member-link limiter forwards only signed buckets", async () => {
    let body: Record<string, unknown> | undefined;
    const allowed = await consumeMemberLinkRate(
        new Request("http://edge.test", { headers: bearerHeaders }),
        "198.51.100.9",
        {
            secret: "edge-secret-value",
            now: new Date("2026-07-29T12:34:00.000Z"),
            rpc: (_request, _name, input) => {
                body = input;
                return Promise.resolve({ allowed: true });
            },
        },
    );
    assertEquals(allowed, true);
    assert(body !== undefined, "limiter RPC body missing");
    assertEquals(Object.keys(body).sort(), [
        "origin_bucket",
        "proof",
        "window_started_at",
    ]);
    assert(!JSON.stringify(body).includes("198.51.100.9"), "raw origin sent");
});

Deno.test("member-link keeps match and rate outcomes indistinguishable", async () => {
    for (const outcome of ["match", "mismatch", "origin-limit", "user-limit"]) {
        const dependencies: MemberLinkDependencies = {
            release: () => Promise.resolve(true),
            authorize: () => Promise.resolve(true),
            consumeRate: () => Promise.resolve(outcome !== "origin-limit"),
            requestLink: () =>
                outcome === "user-limit"
                    ? Promise.reject(
                        new RpcHTTPError(429, '{"code":"rate_limited"}'),
                    )
                    : Promise.resolve({ matched: outcome === "match" }),
        };
        const response = await handleMemberLink(
            new Request("http://edge.test", {
                method: "POST",
                headers: bearerHeaders,
                body: JSON.stringify({
                    legalName: outcome === "match" ? "회원" : "없는 회원",
                    phoneSuffix: outcome === "match" ? "1234" : "9999",
                }),
            }),
            dependencies,
        );
        assertEquals(response.status, 202);
        assertEquals(await response.json(), { accepted: true });
    }
});

Deno.test("member-link maps limiter release shutdown to exact feature unavailable", async () => {
    const response = await handleMemberLink(
        new Request("http://edge.test", {
            method: "POST",
            headers: bearerHeaders,
            body: JSON.stringify({
                legalName: "회원",
                phoneSuffix: "1234",
            }),
        }),
        {
            release: () => Promise.resolve(true),
            authorize: () => Promise.resolve(true),
            consumeRate: () =>
                Promise.reject(
                    new RpcHTTPError(
                        400,
                        '{"code":"55000","message":"match traffic is disabled"}',
                    ),
                ),
            requestLink: () => Promise.resolve({ matched: false }),
        },
    );

    assertEquals(response.status, 503);
    assertEquals(await response.json(), {
        error: {
            code: "feature_unavailable",
            message: "Match service is temporarily unavailable.",
        },
    });
});

Deno.test("member-link fails closed on limiter infrastructure errors", async () => {
    const response = await handleMemberLink(
        new Request("http://edge.test", {
            method: "POST",
            headers: bearerHeaders,
            body: JSON.stringify({
                legalName: "회원",
                phoneSuffix: "1234",
            }),
        }),
        {
            release: () => Promise.resolve(true),
            authorize: () => Promise.resolve(true),
            consumeRate: () =>
                Promise.reject(new Error("Vault configuration unavailable")),
            requestLink: () => Promise.resolve({ matched: false }),
        },
    );

    assertEquals(response.status, 503);
    assertEquals(await response.json(), {
        error: {
            code: "infrastructure_unavailable",
            message: "Match service is temporarily unavailable.",
        },
    });
});

Deno.test("member-link exposes a fixed error for invalid limiter proof", async () => {
    const response = await handleMemberLink(
        new Request("http://edge.test", {
            method: "POST",
            headers: bearerHeaders,
            body: JSON.stringify({
                legalName: "회원",
                phoneSuffix: "1234",
            }),
        }),
        {
            release: () => Promise.resolve(true),
            authorize: () => Promise.resolve(true),
            consumeRate: () =>
                Promise.reject(
                    new RpcHTTPError(
                        400,
                        '{"code":"42501","message":"secret diagnostic"}',
                    ),
                ),
            requestLink: () => Promise.resolve({ matched: false }),
        },
    );

    assertEquals(response.status, 403);
    assertEquals(await response.json(), {
        error: {
            code: "invalid_rate_limit_proof",
            message: "Request could not be verified.",
        },
    });
});

Deno.test("approved member read preserves the public-only response", async () => {
    const memberRead = {
        member: { memberId: uuid(1), publicAlias: "회원1" },
        scope: "all",
        summary: { games: 1, wins: 1, losses: 0, winRate: 1 },
        partners: [],
        matchHistory: [],
        leaderboards: { games: [], wins: [], winRate: [] },
        live: null,
    };
    const dependencies: MemberReadDependencies = {
        release: () => Promise.resolve(true),
        authorize: () => Promise.resolve(true),
        read: () => Promise.resolve(memberRead),
    };
    const response = await handleMemberRead(
        new Request("http://edge.test?scope=all", {
            headers: bearerHeaders,
        }),
        dependencies,
    );
    assertEquals(response.status, 200);
    assertEquals(await response.json(), memberRead);
    const serialized = JSON.stringify(
        await (await handleMemberRead(
            new Request("http://edge.test?scope=all", {
                headers: bearerHeaders,
            }),
            dependencies,
        )).json(),
    );
    for (const forbidden of ["legalName", "phoneSuffix", "gender", "grade"]) {
        assert(
            !serialized.includes(forbidden),
            `member read leaked ${forbidden}`,
        );
    }
});
