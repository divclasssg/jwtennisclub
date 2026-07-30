/// <reference lib="deno.ns" />

import { isAbsolute, relative, resolve, sep } from "node:path";

const SECRET_KEY_PATTERN =
    /(?:password|token|secret|bearer|database[_-]?url|service[_-]?role|anon[_-]?key|api[_-]?key)/i;

function isInside(candidate: string, root: string): boolean {
    const pathFromRoot = relative(root, candidate);
    return pathFromRoot === "" ||
        (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." &&
            !isAbsolute(pathFromRoot));
}

export async function ensureEvidenceRoot(
    evidenceRoot: string,
    backendRoot: string,
    clientRoot: string,
    toolRoot: string,
): Promise<string> {
    Deno.umask(0o077);
    const [
        canonicalEvidence,
        canonicalBackend,
        canonicalClient,
        canonicalTool,
    ] = await Promise.all([
        Deno.realPath(resolve(evidenceRoot)),
        Deno.realPath(resolve(backendRoot)),
        Deno.realPath(resolve(clientRoot)),
        Deno.realPath(resolve(toolRoot)),
    ]);
    if (
        isInside(canonicalEvidence, canonicalBackend) ||
        isInside(canonicalEvidence, canonicalClient) ||
        isInside(canonicalEvidence, canonicalTool)
    ) {
        throw new Error(
            "evidence root must be outside backend, client, and tool Git roots",
        );
    }
    await Deno.chmod(canonicalEvidence, 0o700);
    const mode = (await Deno.stat(canonicalEvidence)).mode;
    if (mode === null || (mode & 0o777) !== 0o700) {
        throw new Error("evidence root mode must be 0700");
    }
    return canonicalEvidence;
}

function redactEvidence(value: unknown, key = ""): unknown {
    if (SECRET_KEY_PATTERN.test(key)) return "[REDACTED]";
    if (Array.isArray(value)) {
        return value.map((item) => redactEvidence(item));
    }
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([childKey, childValue]) => [
                childKey,
                redactEvidence(childValue, childKey),
            ]),
        );
    }
    return value;
}

function safeEvidenceName(name: string): string {
    if (
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) || name === "manifest.json"
    ) {
        throw new Error("invalid evidence filename");
    }
    return name;
}

export async function writeEvidence(
    evidenceRoot: string,
    name: string,
    value: unknown,
): Promise<string> {
    const file = resolve(evidenceRoot, safeEvidenceName(name));
    if (!isInside(file, evidenceRoot)) {
        throw new Error("evidence filename escapes evidence root");
    }
    const body = `${JSON.stringify(redactEvidence(value), null, 2)}\n`;
    await Deno.writeTextFile(file, body, { mode: 0o600 });
    await Deno.chmod(file, 0o600);
    return file;
}

async function sha256File(path: string): Promise<string> {
    const bytes = await Deno.readFile(path);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export async function writeEvidenceManifest(
    evidenceRoot: string,
): Promise<string> {
    const files: Array<{ path: string; sha256: string; bytes: number }> = [];
    for await (const entry of Deno.readDir(evidenceRoot)) {
        if (!entry.isFile || entry.name === "manifest.json") continue;
        const path = resolve(evidenceRoot, entry.name);
        const stat = await Deno.stat(path);
        if (stat.mode === null || (stat.mode & 0o777) !== 0o600) {
            throw new Error(`evidence file mode is not 0600: ${entry.name}`);
        }
        files.push({
            path: entry.name,
            sha256: await sha256File(path),
            bytes: stat.size,
        });
    }
    files.sort((left, right) => left.path.localeCompare(right.path));
    const manifestPath = resolve(evidenceRoot, "manifest.json");
    await Deno.writeTextFile(
        manifestPath,
        `${JSON.stringify({ schemaVersion: 1, files }, null, 2)}\n`,
        { mode: 0o600 },
    );
    await Deno.chmod(manifestPath, 0o600);
    return manifestPath;
}
