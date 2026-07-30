/// <reference lib="deno.ns" />

import {
    authorizeAuthenticated,
    callRpc,
    readBearerToken,
} from "../_shared/auth.ts";
import {
    type MemberReadQuery,
    MemberReadQuerySchema,
} from "../_shared/contracts.ts";
import {
    readReleaseState,
    type ReleaseReader,
    requireRelease,
    rpcErrorResponse,
    simpleError,
} from "../_shared/release.ts";

const BLOCKED_KEYS = new Set([
    "legalName",
    "phoneSuffix",
    "phoneNumber",
    "gender",
    "grade",
    "gradeId",
    "gradeName",
    "gradeStrength",
    "auditEvents",
]);

function sanitize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => !BLOCKED_KEYS.has(key))
                .map(([key, child]) => [key, sanitize(child)]),
        );
    }
    return value;
}

export type MemberReadDependencies = {
    release: ReleaseReader;
    authorize(request: Request): Promise<boolean>;
    read(query: MemberReadQuery, request: Request): Promise<unknown>;
};

const defaultDependencies: MemberReadDependencies = {
    release: readReleaseState,
    authorize: authorizeAuthenticated,
    read: (query, request) =>
        callRpc(request, "get_member_read", {
            requested_scope: query.scope,
            requested_season_id: query.scope === "season"
                ? query.seasonId
                : null,
        }),
};

export async function handleMemberRead(
    request: Request,
    dependencies: MemberReadDependencies = defaultDependencies,
): Promise<Response> {
    if (request.method !== "GET") {
        return simpleError("method_not_allowed", 405);
    }
    if (!readBearerToken(request.headers)) {
        return simpleError("unauthorized", 401);
    }
    const releaseFailure = await requireRelease(request, dependencies.release);
    if (releaseFailure) return releaseFailure;
    try {
        if (!await dependencies.authorize(request)) {
            return simpleError("unauthorized", 401);
        }
    } catch (error) {
        return rpcErrorResponse(error, "authorization_unavailable", 503);
    }
    const url = new URL(request.url);
    const parsed = MemberReadQuerySchema.safeParse({
        scope: url.searchParams.get("scope"),
        ...(url.searchParams.has("seasonId")
            ? { seasonId: url.searchParams.get("seasonId") }
            : {}),
    });
    if (!parsed.success) return simpleError("invalid_request", 400);
    try {
        return Response.json(
            sanitize(await dependencies.read(parsed.data, request)),
        );
    } catch (error) {
        return rpcErrorResponse(error, "read_forbidden", 403);
    }
}

if (import.meta.main) {
    Deno.serve((request) => handleMemberRead(request));
}
