/// <reference lib="deno.ns" />

export type EdgeConfig = {
    supabaseUrl: string;
    anonKey: string;
};

export type RpcCaller = (
    request: Request,
    functionName: string,
    body: Record<string, unknown>,
) => Promise<unknown>;

export class RpcHTTPError extends Error {
    constructor(
        readonly status: number,
        readonly responseBody: string,
    ) {
        super(`RPC request failed with status ${status}`);
        this.name = "RpcHTTPError";
    }

    get code(): string | null {
        try {
            const value = JSON.parse(this.responseBody) as { code?: unknown };
            return typeof value.code === "string" ? value.code : null;
        } catch {
            return null;
        }
    }
}

export function readBearerToken(headers: Headers): string | null {
    const value = headers.get("authorization");
    if (!value) return null;
    return /^Bearer ([^\s]+)$/.exec(value)?.[1] ?? null;
}

function edgeConfig(): EdgeConfig {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
        throw new Error("Supabase Edge environment is not configured");
    }
    return { supabaseUrl, anonKey };
}

export async function callRpc(
    request: Request,
    functionName: string,
    body: Record<string, unknown>,
    fetcher: typeof fetch = fetch,
    timeoutMs = 8_000,
    configured?: EdgeConfig,
): Promise<unknown> {
    const token = readBearerToken(request.headers);
    if (!token) throw new RpcHTTPError(401, '{"code":"invalid_token"}');
    const config = configured ?? edgeConfig();
    const response = await fetcher(
        `${config.supabaseUrl}/rest/v1/rpc/${functionName}`,
        {
            method: "POST",
            headers: {
                apikey: config.anonKey,
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
        },
    );
    if (!response.ok) {
        throw new RpcHTTPError(response.status, await response.text());
    }
    return await response.json();
}

export async function authorizePermission(
    request: Request,
    permission: string,
    rpc: RpcCaller = callRpc,
): Promise<boolean> {
    return await rpc(request, "has_permission", {
        required_permission: permission,
    }) === true;
}

export function authorizeAuthenticated(request: Request): Promise<boolean> {
    return Promise.resolve(readBearerToken(request.headers) !== null);
}
