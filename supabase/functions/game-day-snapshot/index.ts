/// <reference lib="deno.ns" />

import {
    authorizePermission,
    callRpc,
    readBearerToken,
    RpcHTTPError,
} from "../_shared/auth.ts";
import {
    GameDaySnapshotQuerySchema,
    GameDaySnapshotSchema,
} from "../_shared/contracts.ts";
import {
    readReleaseState,
    type ReleaseReader,
    requireRelease,
    rpcErrorResponse,
    simpleError,
} from "../_shared/release.ts";

export type GameDaySnapshotDependencies = {
    release: ReleaseReader;
    authorize(request: Request): Promise<boolean>;
    read(gameDayId: string, request: Request): Promise<unknown>;
};

const defaultDependencies: GameDaySnapshotDependencies = {
    release: readReleaseState,
    authorize: (request) => authorizePermission(request, "matches.view"),
    read: (gameDayId, request) =>
        callRpc(request, "get_match_game_day_snapshot", {
            requested_game_day_id: gameDayId,
        }),
};

export async function handleGameDaySnapshot(
    request: Request,
    dependencies: GameDaySnapshotDependencies = defaultDependencies,
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
            return simpleError("forbidden", 403);
        }
    } catch (error) {
        if (error instanceof RpcHTTPError && error.status === 401) {
            return simpleError("unauthorized", 401);
        }
        return simpleError("authorization_unavailable", 503);
    }
    const parsed = GameDaySnapshotQuerySchema.safeParse({
        gameDayId: new URL(request.url).searchParams.get("gameDayId"),
    });
    if (!parsed.success) return simpleError("invalid_request", 400);
    try {
        return Response.json(
            GameDaySnapshotSchema.parse(
                await dependencies.read(parsed.data.gameDayId, request),
            ),
        );
    } catch (error) {
        if (error instanceof RpcHTTPError && error.code === "P0002") {
            return simpleError("not_found", 404);
        }
        return rpcErrorResponse(error, "snapshot_failed", 502);
    }
}

if (import.meta.main) {
    Deno.serve((request) => handleGameDaySnapshot(request));
}
