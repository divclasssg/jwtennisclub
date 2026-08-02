function unsupported(): never {
    throw new Error("canonical JSON contains an unsupported value");
}

function canonicalValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) =>
                    left < right ? -1 : left > right ? 1 : 0
                )
                .map(([key, child]) => [key, canonicalValue(child)]),
        );
    }
    if (
        value === null || typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
    ) {
        return value;
    }
    return unsupported();
}

export function extractSingleJsonPayload(stdout: string): unknown {
    const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length !== 1 || lines[0].trim() !== lines[0]) {
        throw new Error("psql must return exactly one JSON payload line");
    }
    try {
        const value = JSON.parse(lines[0]);
        if (
            value === null || typeof value !== "object" || Array.isArray(value)
        ) {
            throw new Error();
        }
        return value;
    } catch {
        throw new Error("psql must return exactly one JSON payload line");
    }
}

export function canonicalJson(value: unknown): string {
    return JSON.stringify(canonicalValue(value));
}

export async function sha256CanonicalJson(value: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(canonicalJson(value));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
