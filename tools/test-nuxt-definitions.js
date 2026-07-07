"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const { resolveNuxtGeneratedComponentDefinition } = require(path.join(
  root,
  "Vue.novaextension",
  "Support",
  "proxy",
  "nuxt-definitions.js"
));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vue-nuxt-definitions-"));
const componentPath = path.join(tempRoot, "app", "components", "HelloWorld.vue");
const generatedPath = path.join(tempRoot, ".nuxt", "types", "components.d.ts");

fs.mkdirSync(path.dirname(componentPath), { recursive: true });
fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
fs.writeFileSync(componentPath, "<template><div>Hello</div></template>\n");
fs.writeFileSync(generatedPath, [
  "import type { DefineComponent } from 'vue'",
  "interface _GlobalComponents {",
  "  HelloWorld: typeof import('../../app/components/HelloWorld.vue')['default']",
  "}",
  ""
].join("\n"));

const redirected = resolveNuxtGeneratedComponentDefinition({
  file: generatedPath,
  start: { line: 3, offset: 3 },
  end: { line: 3, offset: 13 }
});

assert.deepStrictEqual(redirected, {
  uri: `file://${encodeURI(componentPath).replace(/#/g, "%23")}`,
  range: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 }
  }
});

assert.strictEqual(resolveNuxtGeneratedComponentDefinition({
  file: path.join(tempRoot, "types", "components.d.ts"),
  start: { line: 3, offset: 3 },
  end: { line: 3, offset: 13 }
}), null);

console.log("Nuxt generated component definition redirect test passed.");
