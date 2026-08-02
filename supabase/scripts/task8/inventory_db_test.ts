import {
    canonicalJson,
    extractSingleJsonPayload,
    sha256CanonicalJson,
} from "./inventory_db_lib.ts";
import {
    readManifestBoundPrivateJson,
    writeEvidence,
    writeEvidenceManifest,
} from "./evidence_lib.ts";

function assert(
    condition: unknown,
    message = "assertion failed",
): asserts condition {
    if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            `expected ${JSON.stringify(expected)}, got ${
                JSON.stringify(actual)
            }`,
        );
    }
}

async function assertRejects(
    action: () => unknown | Promise<unknown>,
    message: string,
): Promise<void> {
    try {
        await action();
    } catch (error) {
        const actual = error instanceof Error ? error.message : String(error);
        assert(actual.includes(message), `expected ${message}, got ${actual}`);
        return;
    }
    throw new Error(`expected rejection containing ${message}`);
}

Deno.test("extracts exactly one unadorned JSON payload", () => {
    assertEquals(extractSingleJsonPayload('{"schemaVersion":2}\n'), {
        schemaVersion: 2,
    });
});

Deno.test("rejects missing, decorated, scalar, and multiple psql payloads", async () => {
    for (
        const stdout of [
            "",
            "schemaVersion | 2\n",
            'NOTICE before\n{"schemaVersion":2}\n',
            '{"schemaVersion":2}\n{"schemaVersion":2}\n',
            'prefix {"schemaVersion":2} suffix\n',
            ' {"schemaVersion":2}\n',
            "null\n",
            "[]\n",
        ]
    ) {
        await assertRejects(
            () => extractSingleJsonPayload(stdout),
            "exactly one JSON payload line",
        );
    }
});

Deno.test("canonical JSON sorts object keys recursively and preserves arrays", () => {
    assertEquals(
        canonicalJson({
            z: 1,
            a: { y: 2, x: 3 },
            rows: [{ b: 2, a: 1 }],
        }),
        '{"a":{"x":3,"y":2},"rows":[{"a":1,"b":2}],"z":1}',
    );
});

Deno.test("canonical JSON rejects non-JSON values", async () => {
    for (
        const value of [undefined, 1n, Number.NaN, Infinity, {
            value: undefined,
        }]
    ) {
        await assertRejects(
            () => canonicalJson(value),
            "unsupported value",
        );
    }
});

Deno.test("hashes the canonical UTF-8 bytes against a hand-derived checksum", async () => {
    const digest = await sha256CanonicalJson({
        z: 1,
        a: { y: 2, x: 3 },
        rows: [{ b: 2, a: 1 }],
    });
    assertEquals(
        digest,
        "7c44f426a3d71894241b18be995a8fd81135f54ebb1567f6b691af08a9efb1f1",
    );
});

Deno.test("reads a private JSON file only when its manifest entry matches", async () => {
    const root = await Deno.makeTempDir();
    try {
        await Deno.chmod(root, 0o700);
        await writeEvidence(root, "inventory-db-v2.json", {
            schemaVersion: 2,
        });
        await writeEvidenceManifest(root);

        assertEquals(
            await readManifestBoundPrivateJson(
                root,
                "inventory-db-v2.json",
            ),
            { schemaVersion: 2 },
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test("rejects tampered, duplicate, and group-readable manifest evidence", async () => {
    for (const mutation of ["tamper", "duplicate", "mode"] as const) {
        const root = await Deno.makeTempDir();
        try {
            await Deno.chmod(root, 0o700);
            const file = await writeEvidence(root, "inventory-db-v2.json", {
                schemaVersion: 2,
            });
            const manifestPath = await writeEvidenceManifest(root);
            if (mutation === "tamper") {
                await Deno.writeTextFile(file, '{"schemaVersion":3}\n');
            } else if (mutation === "duplicate") {
                const manifest = JSON.parse(
                    await Deno.readTextFile(manifestPath),
                );
                manifest.files.push({ ...manifest.files[0] });
                await Deno.writeTextFile(
                    manifestPath,
                    `${JSON.stringify(manifest, null, 2)}\n`,
                );
            } else {
                await Deno.chmod(file, 0o640);
            }

            await assertRejects(
                () =>
                    readManifestBoundPrivateJson(
                        root,
                        "inventory-db-v2.json",
                    ),
                mutation === "duplicate"
                    ? "exactly one manifest entry"
                    : mutation === "mode"
                    ? "mode must be 0600"
                    : "does not match manifest",
            );
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    }
});
