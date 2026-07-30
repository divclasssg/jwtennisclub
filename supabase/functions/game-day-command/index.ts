/// <reference lib="deno.ns" />

import {
    authorizePermission,
    callRpc,
    readBearerToken,
} from "../_shared/auth.ts";
import {
    type GameDayCommand,
    type GameDayCommandResponse,
    GameDayCommandResponseSchema,
    GameDayCommandSchema,
} from "../_shared/contracts.ts";
import {
    readReleaseState,
    type ReleaseReader,
    requireRelease,
    rpcErrorResponse,
    simpleError,
} from "../_shared/release.ts";

export type GameDayCommandDependencies = {
    release: ReleaseReader;
    authorize(request: Request): Promise<boolean>;
    apply(
        command: GameDayCommand,
        request: Request,
    ): Promise<GameDayCommandResponse | unknown>;
};

const defaultDependencies: GameDayCommandDependencies = {
    release: readReleaseState,
    authorize: (request) => authorizePermission(request, "matches.operate"),
    apply: (command, request) =>
        callRpc(request, "apply_game_day_command", { command_json: command }),
};

export async function handleGameDayCommand(
    request: Request,
    dependencies: GameDayCommandDependencies = defaultDependencies,
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
    const parsed = GameDayCommandSchema.safeParse(input);
    if (!parsed.success) return simpleError("invalid_command", 400);
    try {
        const result = GameDayCommandResponseSchema.parse(
            await dependencies.apply(parsed.data, request),
        );
        return Response.json(result, {
            status: result.status === "conflict" ? 409 : 200,
        });
    } catch (error) {
        return rpcErrorResponse(error, "command_failed", 409);
    }
}

if (import.meta.main) {
    Deno.serve((request) => handleGameDayCommand(request));
}
