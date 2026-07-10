#!/usr/bin/env node
/**
 * check-api-contract.mjs — guardrail for the two failure classes that have
 * bitten us in production (see docs/replicate-input-contract.md):
 *
 *   1. Node-runtime api/ functions run as Node ESM — relative imports MUST end
 *      in an extension or they throw ERR_MODULE_NOT_FOUND at runtime (tsconfig's
 *      "bundler" resolution won't flag it). This crashed billing. (Edge-runtime
 *      functions bundle their imports, so the rule does NOT apply to them.)
 *   2. Every Replicate model takes its source image under a specific field
 *      name (`image_input` array vs `input_image` string vs `input_images`
 *      array vs `image`). Wrong field = the model ignores the photo. Some
 *      models also reject specific keys (bria/fibo-edit has no negative_prompt).
 *
 * Exits non-zero on any violation. Run: npm run check:api
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = path.join(ROOT, "api");

const ALL_IMAGE_FIELDS = ["image_input", "input_image", "input_images", "image"];
// imageField: the ONE correct source-image key. forbidden: keys the model does
// NOT accept (hard fail — silent-drop traps). Keyed by base slug (no :version).
const CONTRACT = {
  "google/nano-banana-pro": { imageField: "image_input" },
  "google/nano-banana": { imageField: "image_input" },
  "bytedance/seedream-4": { imageField: "image_input" },
  "black-forest-labs/flux-kontext-pro": { imageField: "input_image" },
  "black-forest-labs/flux-2-pro": { imageField: "input_images" },
  "black-forest-labs/flux-fill-pro": { imageField: "image" },
  "bria/fibo-edit": { imageField: "image", forbidden: ["negative_prompt"] },
  "prunaai/p-image-upscale": { imageField: "image" },
  "tmappdev/lang-segment-anything": { imageField: "image" },
  "lucataco/moondream2": { imageField: "image" },
};

const errors = [];
const warnings = [];

function matchDelim(src, openIdx) {
  const open = src[openIdx];
  const close = open === "{" ? "}" : ")";
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  return src.slice(openIdx);
}
const baseSlug = (m) => m.split(":")[0];
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

const tsFiles = fs
  .readdirSync(API_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => path.join(API_DIR, f));

// Global const→model-slug map (models are sometimes declared in utils.ts and
// imported, and the value can be on the next line).
const constModels = {};
for (const file of tsFiles) {
  const src = fs.readFileSync(file, "utf8");
  const cre =
    /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*["']([\w.-]+\/[\w.:-]+)["']/g;
  let cm;
  while ((cm = cre.exec(src))) constModels[cm[1]] = cm[2];
}

for (const file of tsFiles) {
  const src = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  const isEdge = /runtime:\s*["']edge["']/.test(src);

  // ── Check 1: relative imports carry an extension (Node runtime only) ───────
  if (!isEdge) {
    const importRe = /(?:import|export)[^;]*?from\s*["'](\.[^"']+)["']/g;
    let im;
    while ((im = importRe.exec(src))) {
      if (!/\.[a-z0-9]+$/i.test(im[1])) {
        errors.push(
          `${rel}:${lineOf(src, im.index)}  relative import "${im[1]}" has no extension — Node ESM ERR_MODULE_NOT_FOUND at runtime. Add ".js".`,
        );
      }
    }
  }

  // ── Check 2: replicate.run source-image field + forbidden keys ────────────
  const runRe =
    /replicate\.run\(\s*([A-Z][A-Z0-9_]*|["'][\w.-]+\/[\w.:-]+["'])/g;
  let rm;
  while ((rm = runRe.exec(src))) {
    let model = rm[1].replace(/["']/g, "");
    if (constModels[model]) model = constModels[model];
    const base = baseSlug(model);
    const line = lineOf(src, rm.index);

    const contract = CONTRACT[base];
    if (!contract) {
      warnings.push(
        `${rel}:${line}  replicate.run("${base}") — no contract entry; add one to scripts/check-api-contract.mjs + docs.`,
      );
      continue;
    }

    const braceIdx = src.indexOf("{", rm.index);
    if (braceIdx === -1) continue;
    const optsText = matchDelim(src, braceIdx);

    let keys = [];
    const inputInline = optsText.match(/input:\s*\{/);
    if (inputInline) {
      const inputObj = matchDelim(
        optsText,
        optsText.indexOf("{", inputInline.index + inputInline[0].length - 1),
      );
      keys = [...inputObj.matchAll(/(?:^|[\n{,])\s*([a-z_]\w*)\s*:/g)].map(
        (m) => m[1],
      );
    } else {
      const inputVar = optsText.match(/input:\s*([a-zA-Z_]\w*)/);
      if (inputVar) {
        const v = inputVar[1];
        const dm = src.match(
          new RegExp(`(?:const|let|var)\\s+${v}\\b[^=]*=\\s*\\{`),
        );
        if (dm) {
          const objText = matchDelim(src, src.indexOf("{", dm.index));
          keys.push(
            ...[...objText.matchAll(/(?:^|[\n{,])\s*([a-z_]\w*)\s*:/g)].map(
              (m) => m[1],
            ),
          );
        }
        const asgnRe = new RegExp(`${v}\\.([a-z_]\\w*)\\s*=`, "g");
        let am;
        while ((am = asgnRe.exec(src))) keys.push(am[1]);
      }
    }
    keys = [...new Set(keys)];
    if (keys.length === 0) {
      warnings.push(
        `${rel}:${line}  replicate.run("${base}") — couldn't statically read input keys; verify by hand.`,
      );
      continue;
    }

    if (!keys.includes(contract.imageField)) {
      errors.push(
        `${rel}:${line}  "${base}" expects source image under "${contract.imageField}" but it's missing (keys: ${keys.join(", ")}).`,
      );
    }
    for (const f of ALL_IMAGE_FIELDS) {
      if (f !== contract.imageField && keys.includes(f)) {
        errors.push(
          `${rel}:${line}  "${base}" uses "${f}" — that's another model's image field. It wants "${contract.imageField}".`,
        );
      }
    }
    for (const bad of contract.forbidden || []) {
      if (keys.includes(bad)) {
        errors.push(
          `${rel}:${line}  "${base}" has no "${bad}" field — it's silently dropped. Fold it into a supported field (see docs).`,
        );
      }
    }
  }
}

for (const w of warnings) console.warn("⚠️  " + w);
if (errors.length) {
  console.error(`\n❌ API contract check failed (${errors.length}):`);
  for (const e of errors) console.error("   " + e);
  process.exit(1);
}
console.log(
  `✅ API contract OK — ${tsFiles.length} files, Node imports extension-safe, Replicate image fields match.` +
    (warnings.length ? ` (${warnings.length} warning(s))` : ""),
);
