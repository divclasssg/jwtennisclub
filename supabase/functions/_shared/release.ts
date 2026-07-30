import { callRpc, type RpcCaller, RpcHTTPError } from "./auth.ts";

export type ReleaseReader = (request: Request) => Promise<boolean>;

export async function readReleaseState(
    request: Request,
    rpc: RpcCaller = callRpc,
): Promise<boolean> {
    const value = await rpc(request, "get_match_release_state", {});
    return value !== null && typeof value === "object" &&
        !Array.isArray(value) &&
        (value as { trafficEnabled?: unknown }).trafficEnabled === true;
}

export function featureUnavailableResponse(): Response {
    return Response.json({
        error: {
            code: "feature_unavailable",
            message: "Match service is temporarily unavailable.",
        },
    }, { status: 503 });
}

export function simpleError(code: string, status: number): Response {
    return Response.json({ error: code }, { status });
}

export function isReleaseDisabledError(error: unknown): boolean {
    return error instanceof RpcHTTPError && error.code === "55000";
}

export function rpcErrorResponse(
    error: unknown,
    fallbackCode: string,
    fallbackStatus: number,
): Response {
    if (isReleaseDisabledError(error)) return featureUnavailableResponse();
    if (error instanceof RpcHTTPError) {
        if (error.status === 401 || error.code === "PGRST301") {
            return simpleError("unauthorized", 401);
        }
        if (error.status === 403 || error.code === "42501") {
            return simpleError("forbidden", 403);
        }
        if (error.code === "22023") {
            return simpleError("invalid_request", 400);
        }
        if (
            error.status === 409 ||
            error.code === "23505" ||
            error.code === "40001"
        ) {
            return simpleError("conflict", 409);
        }
    }
    return simpleError(fallbackCode, fallbackStatus);
}

export async function requireRelease(
    request: Request,
    release: ReleaseReader,
): Promise<Response | null> {
    try {
        return await release(request) ? null : featureUnavailableResponse();
    } catch (error) {
        if (error instanceof RpcHTTPError && error.status === 401) {
            return simpleError("unauthorized", 401);
        }
        return featureUnavailableResponse();
    }
}
