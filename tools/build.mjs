// Single-file build: bundles src/ui/main.ts, src/ui/styles.css and the template
// src/ui/index.html into dist/mindmatters.html (no external requests, no CDN).
//
//   node tools/build.mjs
//
// Output: dist/mindmatters.html and dist/mindmatters.html.sha256
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateValidatorSource } from "./gen-validators.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// Pre-generated validators: the page then needs no 'unsafe-eval' (see tools/gen-validators.mjs).
const genDir = join(root, "dist", ".gen");
mkdirSync(genDir, { recursive: true });
const genFile = join(genDir, "validators.cjs");
writeFileSync(genFile, generateValidatorSource(), "utf8");
const standalone = {
  name: "mm-standalone-validators",
  setup(b) {
    b.onResolve({ filter: /^mm-generated-validators$/ }, () => ({ path: genFile }));
    b.onResolve({ filter: /(^|\/)schemas$/ }, (args) =>
      args.importer.endsWith("schemaCheck.ts") ? { path: join(root, "src/core/schemas.standalone.ts") } : undefined,
    );
  },
};

const result = await build({
  plugins: [standalone],
  entryPoints: [join(root, "src/ui/main.ts")],
  bundle: true,
  minify: true,
  format: "iife",
  // Syntax is lowered to ES2019 (optional chaining, ??, etc.). Runtime APIs used are
  // plain ES2019 plus Blob, FileReader, TextEncoder, URL.createObjectURL.
  target: ["es2019"],
  platform: "browser",
  write: false,
  legalComments: "none",
  logLevel: "warning",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\/script");
const css = readFileSync(join(root, "src/ui/styles.css"), "utf8");
const template = readFileSync(join(root, "src/ui/index.html"), "utf8");

for (const marker of ["<!--INLINE_CSS-->", "<!--INLINE_JS-->"]) {
  if (!template.includes(marker)) throw new Error(`template is missing ${marker}`);
}
const html = template
  .replace("<!--INLINE_CSS-->", () => `<style>\n${css}\n</style>`)
  .replace("<!--INLINE_JS-->", () => `<script>\n${js}\n</script>`)
  .replaceAll("{{VERSION}}", pkg.version);

mkdirSync(join(root, "dist"), { recursive: true });
const out = join(root, "dist/mindmatters.html");
writeFileSync(out, html, "utf8");
const sha = createHash("sha256").update(html).digest("hex");
writeFileSync(out + ".sha256", `${sha}  mindmatters.html\n`, "utf8");
console.log(`dist/mindmatters.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB  sha256 ${sha.slice(0, 16)}…`);
