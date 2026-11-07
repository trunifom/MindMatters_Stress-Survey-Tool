import { Diagnostic, diag, pointer } from "./diagnostics";
import type { Catalog } from "./types";

/**
 * Language checks (spec B01):
 *  - every language key of every LocalizedText must be declared in `languages`
 *    (LANGUAGE_NOT_DECLARED);
 *  - `catalog.defaultLanguage` must be one of `languages`;
 *  - participant-facing texts missing in a declared language are reported per
 *    language (MISSING_TRANSLATION, warning). Nothing is translated automatically;
 *    export in an affected language is blocked later. Administrative texts may fall
 *    back to the default language, so they are not reported.
 */

/** Keys whose object value is a LocalizedText (strings with the same key are plain text, e.g. Source.title). */
const LOCALIZED_KEYS = new Set([
  "title", "description", "label", "attribution", "notes", "text", "instruction",
  "respondentHelp", "organizerHelp", "validationMessage", "requiredMessage", "exportLabel",
  "targetPopulation", "summary", "measurementExplanation", "selectionAdvice", "limitations",
  "administrationNotes", "interpretationNotes", "changeSummary", "introduction", "closingText",
  "privacyNotice", "helpResources", "warningText", "helpResourcesText", "parentalConsentText",
  "pseudonymizationNote", "population", "result", "min", "mid", "max",
]);

/** Keys whose content is never walked (free-form data). */
const OPAQUE_KEYS = new Set(["extensions", "data"]);

/** Participant-facing fields (a missing language blocks output in that language). */
const PARTICIPANT_KEYS = new Set([
  "text", "instruction", "respondentHelp", "validationMessage", "requiredMessage",
  "introduction", "closingText", "privacyNotice", "helpResources", "parentalConsentText",
  "warningText", "helpResourcesText", "min", "mid", "max",
]);

interface Found {
  path: string;
  value: Record<string, string>;
  participant: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function isLocalizedShape(v: unknown): v is Record<string, string> {
  return isObject(v) && Object.values(v).every((x) => typeof x === "string");
}

export function collectLocalized(doc: unknown): Found[] {
  const found: Found[] = [];
  const walk = (node: unknown, path: string, key: string | undefined, participantCtx: boolean) => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, path + pointer(i), key, participantCtx));
      return;
    }
    if (!isObject(node)) return;
    if (key && LOCALIZED_KEYS.has(key) && isLocalizedShape(node)) {
      // An option label, item text etc. is participant-facing; participant-ness of `label`
      // depends on the parent (option labels yes, construct labels no).
      found.push({ path, value: node, participant: PARTICIPANT_KEYS.has(key) || (key === "label" && participantCtx) || (key === "title" && participantCtx) });
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (OPAQUE_KEYS.has(k)) continue;
      if (k === "exportHints") {
        // platform id -> { variableName, label, notes }
        if (isObject(v)) for (const [pid, entry] of Object.entries(v)) walk(entry, path + pointer(k, pid), undefined, false);
        continue;
      }
      const childParticipant =
        participantCtx ||
        k === "options" ||
        k === "sections" ||
        k === "questionnaire" ||
        k === "consent" ||
        k === "unit" ||
        k === "labels";
      walk(v, path + pointer(k), k, childParticipant);
    }
  };
  walk(doc, "", undefined, false);
  return found;
}

export function checkLanguages(c: Catalog): Diagnostic[] {
  const out: Diagnostic[] = [];
  const declared = new Set(c.languages);

  if (!declared.has(c.catalog.defaultLanguage)) {
    out.push(
      diag("content", "error", "DEFAULT_LANGUAGE_NOT_LISTED", `catalog.defaultLanguage "${c.catalog.defaultLanguage}" is not listed in languages.`, {
        jsonPath: "/catalog/defaultLanguage",
      }),
    );
  }

  const found = collectLocalized(c);
  const undeclared = new Map<string, { count: number; first: string }>();
  const missing = new Map<string, { count: number; first: string }>();

  for (const f of found) {
    for (const lang of Object.keys(f.value)) {
      if (!declared.has(lang)) {
        const e = undeclared.get(lang);
        if (e) e.count++;
        else undeclared.set(lang, { count: 1, first: f.path + pointer(lang) });
      }
    }
    if (f.participant) {
      for (const lang of declared) {
        if (!(lang in f.value)) {
          const e = missing.get(lang);
          if (e) e.count++;
          else missing.set(lang, { count: 1, first: f.path });
        }
      }
    }
  }

  for (const [lang, e] of undeclared) {
    out.push(
      diag("content", "error", "LANGUAGE_NOT_DECLARED", `Language "${lang}" is used in ${e.count} text(s) but not listed in languages.`, { jsonPath: e.first }),
    );
  }
  for (const [lang, e] of missing) {
    out.push(
      diag("content", "warning", "MISSING_TRANSLATION", `${e.count} participant-facing text(s) have no "${lang}" version (first at ${e.first}). Output in this language is blocked until they are provided.`, {
        jsonPath: e.first,
      }),
    );
  }
  return out;
}
