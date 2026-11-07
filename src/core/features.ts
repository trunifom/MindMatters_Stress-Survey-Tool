import { Diagnostic, diag, pointer } from "./diagnostics";
import type { Catalog, Condition, ConditionOrGroup } from "./types";

/**
 * Feature registry (spec B19). A catalog must declare every behaviour-critical
 * feature it uses in `requiredFeatures`. Unknown required features block normal
 * processing (read-only diagnosis stays possible).
 */

/** Features this application version implements. */
export const SUPPORTED_FEATURES = [
  "coreQuestions",
  "requiredInclusion",
  "requiredAnswer",
  "selectionModules",
  "wholeScaleSelection",
  "simpleVisibility",
  "compoundVisibility",
  "sliderResponse",
  "rankingResponse",
  "noteItems",
  "randomization",
] as const;

/** Always required, independent of content. */
export const ALWAYS_REQUIRED_FEATURES = ["coreQuestions", "requiredInclusion", "requiredAnswer"] as const;

const BASIC_OPERATORS = new Set(["equals", "notEquals", "contains"]);

/** Flatten a visibleWhen value to its leaf conditions. */
export function leafConditions(vw: ConditionOrGroup | undefined): Condition[] {
  if (!vw) return [];
  if ("itemRef" in vw) return [vw];
  return [...(vw.all ?? []), ...(vw.any ?? [])];
}

export function isCompound(vw: ConditionOrGroup): boolean {
  if (!("itemRef" in vw)) return true;
  return !BASIC_OPERATORS.has(vw.operator);
}

/** Features a catalog actually uses, with the first JSON path that uses each. */
export function usedFeatures(c: Catalog): Map<string, string> {
  const used = new Map<string, string>();
  const note = (f: string, path: string) => {
    if (!used.has(f)) used.set(f, path);
  };
  if (c.modules.length > 0) note("selectionModules", "/modules");
  c.scales.forEach((s, i) => {
    if (s.selectionPolicy === "wholeScale") note("wholeScaleSelection", pointer("scales", i, "selectionPolicy"));
  });
  c.items.forEach((it, i) => {
    if (it.visibleWhen) {
      note("simpleVisibility", pointer("items", i, "visibleWhen"));
      if (isCompound(it.visibleWhen)) note("compoundVisibility", pointer("items", i, "visibleWhen"));
    }
    if (it.response.kind === "slider") note("sliderResponse", pointer("items", i, "response"));
    if (it.response.kind === "ranking") note("rankingResponse", pointer("items", i, "response"));
    if (it.response.kind === "note") note("noteItems", pointer("items", i, "response"));
    if (it.presentation?.optionOrder === "random") note("randomization", pointer("items", i, "presentation"));
  });
  return used;
}

export function checkFeatures(c: Catalog): Diagnostic[] {
  const out: Diagnostic[] = [];
  const declared = new Set(c.requiredFeatures);
  const supported = new Set<string>(SUPPORTED_FEATURES);

  for (const f of ALWAYS_REQUIRED_FEATURES) {
    if (!declared.has(f)) {
      out.push(diag("content", "error", "REQUIRED_FEATURE_MISSING", `Feature "${f}" must always be declared in requiredFeatures.`, { jsonPath: "/requiredFeatures" }));
    }
  }
  c.requiredFeatures.forEach((f, i) => {
    if (!supported.has(f)) {
      out.push(
        diag("content", "error", "UNKNOWN_FEATURE", `Required feature "${f}" is not supported by this application version. Normal processing is blocked; read-only diagnosis remains possible.`, {
          jsonPath: pointer("requiredFeatures", i),
        }),
      );
    }
  });
  for (const [f, path] of usedFeatures(c)) {
    if (!declared.has(f)) {
      out.push(diag("content", "error", "FEATURE_NOT_DECLARED", `The catalog uses feature "${f}" but does not declare it in requiredFeatures.`, { jsonPath: path }));
    }
  }

  // behavior extensions must reference a declared feature
  const checkExt = (ext: Record<string, { kind: string; featureId?: string }> | undefined, base: string) => {
    if (!ext) return;
    for (const [key, entry] of Object.entries(ext)) {
      if (entry.kind === "behavior" && entry.featureId && !declared.has(entry.featureId)) {
        out.push(diag("content", "error", "FEATURE_NOT_DECLARED", `Behavior extension "${key}" uses feature "${entry.featureId}" which is not declared in requiredFeatures.`, { jsonPath: base + pointer(key) }));
      }
    }
  };
  checkExt(c.extensions, "/extensions");
  c.items.forEach((it, i) => checkExt(it.extensions, pointer("items", i, "extensions")));
  c.instruments.forEach((x, i) => checkExt(x.extensions, pointer("instruments", i, "extensions")));
  return out;
}
