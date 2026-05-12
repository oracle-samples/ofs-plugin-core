/*
 * Copyright © 2022, 2023, Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License (UPL), Version 1.0  as shown at https://oss.oracle.com/licenses/upl/
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("Backward compatibility and OJET/AMD compatibility", () => {
    test("package metadata keeps ESM default and exposes AMD subpath", () => {
        const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

        assert.equal(packageJson.main, "dist/ofs-plugin.es.js");
        assert.equal(packageJson.module, "dist/ofs-plugin.es.js");

        assert.equal(
            packageJson.exports["."].default,
            "./dist/ofs-plugin.es.js"
        );
        assert.equal(packageJson.exports["."].types, "./dist/main.d.ts");
        assert.equal(
            packageJson.exports["./amd"].default,
            "./dist/ofs-plugin.amd.js"
        );
    });

    test("rollup config includes AMD output artifact", () => {
        const rollupConfig = readFileSync("rollup.config.mjs", "utf8");

        assert.match(rollupConfig, /file: "dist\/ofs-plugin\.amd\.js"/);
        assert.match(rollupConfig, /format: "amd"/);
    });
});
