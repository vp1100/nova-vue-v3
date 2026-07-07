"use strict";

const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
const { createTsserverResponseParams } = require(path.join(root, "Vue.novaextension", "Scripts", "tsserver", "bridge.js"));

const result = { configFileName: "/tmp/tsconfig.json" };
const params = createTsserverResponseParams(7, result);

assert.deepStrictEqual(params, [[7, result]]);
assert(Array.isArray(params[0]), "tsserver/response first notification argument must be iterable");

console.log("Vue tsserver response params test passed.");
