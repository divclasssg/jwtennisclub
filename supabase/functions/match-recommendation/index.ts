/// <reference lib="deno.ns" />

import {
    authorizePermission,
    callRpc,
    readBearerToken,
} from "../_shared/auth.ts";
import {
    MatchInputSchema,
    MatchRecommendationRequestSchema,
} from "../_shared/contracts.ts";
import { recommendMatch } from "../_shared/matching/recommend.ts";
import type { MatchInput } from "../_shared/matching/types.ts";
import {
    readReleaseState,
    type ReleaseReader,
    requireRelease,
    rpcErrorResponse,
    simpleError,
} from "../_shared/release.ts";

export type MatchRecommendationDependencies = {
    release: ReleaseReader;
    authorize(request: Request): Promise<boolean>;
    loadInput(
        gameDayId: string,
        courtNumber: number,
        request: Request,
    ): Promise<MatchInput | unknown>;
};

const defaultDependencies: MatchRecommendationDependencies = {
    release: readReleaseState,
    authorize: (request) => authorizePermission(request, "matches.view"),
    loadInput: (gameDayId, courtNumber, request) =>
        callRpc(request, "get_match_recommendation_input", {
            requested_game_day_id: gameDayId,
            requested_court_number: courtNumber,
            requested_limit: 32,
        }),
};

export async function handleMatchRecommendation(
    request: Request,
    dependencies: MatchRecommendationDependencies = defaultDependencies,
): Promise<Response> {
    if (request.method !== "POST") {
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
        return rpcErrorResponse(error, "authorization_unavailable", 503);
    }
    let input: unknown;
    try {
        input = await request.json();
    } catch {
        return simpleError("invalid_json", 400);
    }
    const parsed = MatchRecommendationRequestSchema.safeParse(input);
    if (!parsed.success) return simpleError("invalid_request", 400);
    try {
        const matchInputResult = MatchInputSchema.safeParse(
            await dependencies.loadInput(
                parsed.data.gameDayId,
                parsed.data.courtNumber,
                request,
            ),
        );
        if (!matchInputResult.success) {
            return simpleError("invalid_upstream_response", 502);
        }
        const matchInput = matchInputResult.data;
        return Response.json(recommendMatch(matchInput));
    } catch (error) {
        return rpcErrorResponse(error, "recommendation_failed", 409);
    }
}

if (import.meta.main) {
    Deno.serve((request) => handleMatchRecommendation(request));
}
