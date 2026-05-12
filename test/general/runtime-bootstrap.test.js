/*
 * Copyright © 2022, 2023, Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License (UPL), Version 1.0  as shown at https://oss.oracle.com/licenses/upl/
 */

import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function createLocalStorage(initial = {}) {
    const store = new Map(Object.entries(initial));

    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        },
    };
}

async function loadSourceModule() {
    const source = readFileSync("src/main.ts", "utf8");
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ES2022,
            target: ts.ScriptTarget.ES2020,
        },
    });
    const tempDir = mkdtempSync(join(process.cwd(), ".tmp-main-"));
    const tempFile = join(tempDir, "main.mjs");

    writeFileSync(tempFile, transpiled.outputText, "utf8");

    return {
        module: await import(
            `${pathToFileURL(tempFile).href}?t=${Date.now()}`
        ),
        cleanup() {
            rmSync(tempDir, { recursive: true, force: true });
        },
    };
}

describe("Runtime bootstrap", () => {
    const originalWindow = globalThis.window;
    let cleanupModule = () => {};

    beforeEach(() => {
        globalThis.window = {
            localStorage: createLocalStorage(),
        };
    });

    afterEach(() => {
        cleanupModule();
        cleanupModule = () => {};
        globalThis.window = originalWindow;
        delete globalThis.callId;
        delete globalThis.waitForProxy;
    });

    test("requests legacy OFS token using applicationKey", async () => {
        const loaded = await loadSourceModule();
        const { OFSPlugin, Procedure } = loaded.module;
        cleanupModule = loaded.cleanup;

        class TestPlugin extends OFSPlugin {
            constructor() {
                super("TestPlugin", true);
                this.calls = [];
            }

            open() {}

            callProcedure(data) {
                this.calls.push(data);
            }

            _generateCallId() {
                return "legacy-call-id";
            }
        }

        window.localStorage.setItem(
            "TestPlugin.applications",
            JSON.stringify({
                legacyApp: {
                    type: "ofs",
                    resourceUrl: "https://legacy.example.com",
                },
            })
        );

        const plugin = new TestPlugin();
        plugin._createProxy({});

        assert.deepEqual(plugin.calls, [
            {
                callId: "legacy-call-id",
                procedure: Procedure.GetAccessToken,
                params: {
                    applicationKey: "legacyApp",
                },
            },
        ]);
        assert.equal(
            window.localStorage.getItem("TestPlugin.baseURL"),
            "https://legacy.example.com"
        );
        assert.equal(globalThis.waitForProxy, true);
    });

    test("requests FusionFS token using scope derived from environmentName", async () => {
        const loaded = await loadSourceModule();
        const { OFSPlugin, Procedure } = loaded.module;
        cleanupModule = loaded.cleanup;

        class TestPlugin extends OFSPlugin {
            constructor() {
                super("TestPlugin", true);
                this.calls = [];
            }

            open() {}

            callProcedure(data) {
                this.calls.push(data);
            }

            _generateCallId() {
                return "fusion-call-id";
            }
        }

        const plugin = new TestPlugin();
        plugin._createProxy({
            environment: {
                environmentName: "MyEnv",
                fsUrl: "https://fieldservice.example.com",
                faUrl: "https://fusion.example.com",
            },
        });

        assert.deepEqual(plugin.calls, [
            {
                callId: "fusion-call-id",
                procedure: Procedure.GetAccessTokenByScope,
                params: {
                    scope: "urn:opc:resource:fusion:myenv:field-service-common/use",
                },
            },
        ]);
        assert.equal(
            window.localStorage.getItem("TestPlugin.baseURL"),
            "https://fieldservice.example.com"
        );
        assert.equal(globalThis.waitForProxy, true);
    });
});
