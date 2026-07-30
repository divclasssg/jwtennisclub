/// <reference lib="deno.ns" />

import {
    authorizeAuthenticated,
    callRpc,
    readBearerToken,
    type RpcCaller,
} from "../_shared/auth.ts";
import {
    type MemberLinkRequest,
    MemberLinkRequestSchema,
} from "../_shared/contracts.ts";
import {
    featureUnavailableResponse,
    isReleaseDisabledError,
    readReleaseState,
    type ReleaseReader,
    requireRelease,
    rpcErrorResponse,
    simpleError,
} from "../_shared/release.ts";

export type MemberLinkDependencies = {
    release: ReleaseReader;
    authorize(request: Request): Promise<boolean>;
    consumeRate(request: Request): Promise<boolean>;
    requestLink(
        input: MemberLinkRequest,
        request: Request,
    ): Promise<unknown>;
};

export type OriginRateProof = {
    originBucket: string;
    windowStartedAt: string;
    proof: string;
};

const encoder = new TextEncoder();
function hex(bytes: ArrayBuffer): string {
    return [...new Uint8Array(bytes)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
}
async function hmac(value: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function createOriginRateProof(
    trustedOrigin: string,
    secret: string,
    now = new Date(),
): Promise<OriginRateProof> {
    if (!secret) throw new Error("Edge rate-limit secret is unavailable");
    const normalizedOrigin = trustedOrigin.trim().toLowerCase();
    if (!normalizedOrigin) throw new Error("Trusted origin is unavailable");
    const window = new Date(now);
    window.setUTCMinutes(0, 0, 0);
    const windowStartedAt = window.toISOString();
    const originBucket = await hmac(`origin\u001f${normalizedOrigin}`, secret);
    const epochSeconds = Math.floor(window.getTime() / 1_000);
    const proof = await hmac(
        `v1\u001f${epochSeconds}\u001f${originBucket}`,
        secret,
    );
    return { originBucket, windowStartedAt, proof };
}

export async function consumeMemberLinkRate(
    request: Request,
    trustedOrigin: string,
    options: {
        secret?: string;
        now?: Date;
        rpc?: RpcCaller;
    } = {},
): Promise<boolean> {
    const secret = options.secret ??
        Deno.env.get("MATCH_EDGE_RATE_LIMIT_SECRET");
    if (!secret) throw new Error("Edge rate-limit secret is unavailable");
    const signed = await createOriginRateProof(
        trustedOrigin,
        secret,
        options.now,
    );
    const result = await (options.rpc ?? callRpc)(
        request,
        "consume_member_link_edge_rate",
        {
            origin_bucket: signed.originBucket,
            window_started_at: signed.windowStartedAt,
            proof: signed.proof,
        },
    );
    return result !== null && typeof result === "object" &&
        !Array.isArray(result) &&
        (result as { allowed?: unknown }).allowed === true;
}

function accepted(): Response {
    return Response.json({ accepted: true }, { status: 202 });
}

export async function handleMemberLink(
    request: Request,
    dependencies: MemberLinkDependencies,
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
            return simpleError("unauthorized", 401);
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
    const parsed = MemberLinkRequestSchema.safeParse(input);
    if (!parsed.success) return simpleError("invalid_request", 400);
    try {
        if (!await dependencies.consumeRate(request)) return accepted();
    } catch {
        return accepted();
    }
    try {
        await dependencies.requestLink(parsed.data, request);
    } catch (error) {
        if (isReleaseDisabledError(error)) return featureUnavailableResponse();
    }
    return accepted();
}

function peerOrigin(info: Deno.ServeHandlerInfo): string {
    return info.remoteAddr.transport === "tcp" ||
            info.remoteAddr.transport === "udp"
        ? info.remoteAddr.hostname
        : "unavailable";
}

function runtimeDependencies(
    trustedOrigin: string,
): MemberLinkDependencies {
    return {
        release: readReleaseState,
        authorize: authorizeAuthenticated,
        consumeRate: (request) => consumeMemberLinkRate(request, trustedOrigin),
        requestLink: (input, request) =>
            callRpc(request, "request_member_link", {
                requested_legal_name: input.legalName,
                requested_phone_suffix: input.phoneSuffix,
            }),
    };
}

if (import.meta.main) {
    Deno.serve((request, info) =>
        handleMemberLink(request, runtimeDependencies(peerOrigin(info)))
    );
}
