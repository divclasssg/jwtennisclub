/// <reference lib="deno.ns" />

import {
    authorizePermission,
    callRpc,
    readBearerToken,
    RpcHTTPError,
} from "../_shared/auth.ts";
import {
    type OperatorReadQuery,
    OperatorReadQuerySchema,
    OperatorReadResponseSchema,
} from "../_shared/contracts.ts";
import {
    readReleaseState,
    type ReleaseReader,
    requireRelease,
    rpcErrorResponse,
    simpleError,
} from "../_shared/release.ts";

export type OperatorReadDependencies = {
    release: ReleaseReader;
    authorize(request: Request): Promise<boolean>;
    read(scope: OperatorReadQuery["scope"], request: Request): Promise<unknown>;
};

const defaultDependencies: OperatorReadDependencies = {
    release: readReleaseState,
    authorize: (request) => authorizePermission(request, "matches.view"),
    read: (scope, request) =>
        callRpc(request, "get_match_operator_read", {
            requested_scope: scope,
        }),
};

export async function handleOperatorRead(
    request: Request,
    dependencies: OperatorReadDependencies = defaultDependencies,
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
    const parsed = OperatorReadQuerySchema.safeParse({
        scope: new URL(request.url).searchParams.get("scope"),
    });
    if (!parsed.success) return simpleError("invalid_request", 400);
    try {
        const result = OperatorReadResponseSchema.parse(
            await dependencies.read(parsed.data.scope, request),
        );
        if (result.scope !== parsed.data.scope) {
            return simpleError("operator_read_failed", 502);
        }
        return Response.json(result);
    } catch (error) {
        return rpcErrorResponse(error, "operator_read_failed", 502);
    }
}

if (import.meta.main) {
    Deno.serve((request) => handleOperatorRead(request));
}
