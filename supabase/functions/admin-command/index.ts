/// <reference lib="deno.ns" />

import {
    authorizePermission,
    callRpc,
    readBearerToken,
} from "../_shared/auth.ts";
import { type AdminCommand, AdminCommandSchema } from "../_shared/contracts.ts";
import {
    readReleaseState,
    type ReleaseReader,
    requireRelease,
    rpcErrorResponse,
    simpleError,
} from "../_shared/release.ts";

export type AdminCommandDependencies = {
    release: ReleaseReader;
    authorize(request: Request): Promise<boolean>;
    apply(command: AdminCommand, request: Request): Promise<unknown>;
};

const defaultDependencies: AdminCommandDependencies = {
    release: readReleaseState,
    authorize: (request) => authorizePermission(request, "matches.manage"),
    apply: (command, request) =>
        callRpc(request, "apply_admin_command", { command_json: command }),
};

export async function handleAdminCommand(
    request: Request,
    dependencies: AdminCommandDependencies = defaultDependencies,
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
    const parsed = AdminCommandSchema.safeParse(input);
    if (!parsed.success) return simpleError("invalid_command", 400);
    try {
        return Response.json(await dependencies.apply(parsed.data, request));
    } catch (error) {
        return rpcErrorResponse(error, "command_failed", 409);
    }
}

if (import.meta.main) {
    Deno.serve((request) => handleAdminCommand(request));
}
