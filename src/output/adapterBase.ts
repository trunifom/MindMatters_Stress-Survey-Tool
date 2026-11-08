import { Diagnostic, diag } from "../core/diagnostics";
import { exactText } from "../core/localized";
import type { Catalog, Item, LocalizedText, OptionSet } from "../core/types";
import { ActionDecision, evaluateAction } from "../model/rights";
import { checkSelection, orderedSelection, Selection } from "../model/selection";
import { AdapterResult, MappingCollector } from "./mapping";

/**
 * Shared start of every adapter built after LimeSurvey and Qualtrics: rights gate, selection check,
 * language check, error helper and exact-language text lookup. The LimeSurvey and Qualtrics adapters
 * predate it and still carry their own copy of this logic (listed in docs/IDEEN.md).
 */

export interface AdapterSpec {
  platform: string;
  /** File extension without dot. */
  ext: string;
  mime: string;
  assumptions: readonly string[];
  /** Added to the file name before the extension. */
  suffix?: string;
}

export interface AdapterOptions {
  language: string;
  mode: "native" | "test";
}

export interface AdapterContext {
  c: Catalog;
  lang: string;
  test: boolean;
  decision: ActionDecision;
  diagnostics: Diagnostic[];
  mapping: MappingCollector;
  items: Map<string, Item>;
  optionSets: Map<string, OptionSet>;
  selected: Set<string>;
  /** Result to return immediately when a gate failed. */
  early?: AdapterResult;
  err(code: string, message: string, extra?: Partial<Diagnostic>): void;
  /** Exact-language text; reports EXPORT_TEXT_MISSING and returns "" when absent. Never falls back. */
  need(lt: LocalizedText | undefined, what: string, itemRef?: string): string;
  result(ok: boolean, content?: string): AdapterResult;
  /** "[TEST ...]" or "[DRAFT]" prefix for titles, empty for a released regular export. */
  titleLabel(): string;
}

const LABELS = {
  de: { test: "[TEST – nicht für die Durchführung]", draft: "[ENTWURF]" },
  en: { test: "[TEST – not for productive use]", draft: "[DRAFT]" },
} as const;

/** C0 control characters (except tab, line feed, carriage return), DEL-free, noncharacters U+FFFE/U+FFFF and lone surrogates: no target format carries them faithfully. */
const BAD_CHARS = new RegExp("[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]");
export const hasUnexportableChars = (s: string): boolean => BAD_CHARS.test(s);

export function openAdapter(c: Catalog, selection: Selection, options: AdapterOptions, spec: AdapterSpec): AdapterContext {
  const lang = options.language;
  const test = options.mode === "test";
  const decision = evaluateAction(c, test ? "devTestExport" : "nativeExport", { selection });
  const diagnostics: Diagnostic[] = [...decision.diagnostics.filter((d) => d.severity !== "info" || d.code === "TEST_ARTIFACT" || d.code === "DRAFT_WATERMARK_REQUIRED")];
  const mapping = new MappingCollector();
  const fileName = `${c.catalog.id}_${c.catalog.version}_${spec.platform}${test ? "_TEST" : ""}${spec.suffix ?? ""}.${spec.ext}`;
  const result = (ok: boolean, content?: string): AdapterResult => ({
    platform: spec.platform,
    ok,
    ...(content !== undefined && ok ? { content } : {}),
    fileName,
    mimeType: spec.mime,
    diagnostics,
    mapping: mapping.entries(),
    assumptions: [...spec.assumptions],
    decision,
    testArtifact: test,
  });
  const err = (code: string, message: string, extra: Partial<Diagnostic> = {}): void => {
    diagnostics.push(diag("export", "error", code, message, { targetPlatform: spec.platform, ...extra }));
  };
  const ctx: AdapterContext = {
    c,
    lang,
    test,
    decision,
    diagnostics,
    mapping,
    items: new Map(c.items.map((i) => [i.id, i])),
    optionSets: new Map(c.optionSets.map((o) => [o.id, o])),
    selected: new Set(orderedSelection(c, selection)),
    err,
    result,
    need(lt, what, itemRef) {
      const t = exactText(lt, lang);
      if (t === undefined) {
        err("EXPORT_TEXT_MISSING", `${what} has no text in "${lang}". An export is never filled with another language.`, itemRef ? { itemRef } : {});
        return "";
      }
      if (hasUnexportableChars(t)) {
        err("EXPORT_TEXT_CHARACTER_INVALID", `${what} contains a control character (for example NUL) or a lone surrogate, which no target format carries faithfully.`, itemRef ? { itemRef } : {});
        return "";
      }
      return t;
    },
    titleLabel() {
      const l = lang.toLowerCase().startsWith("de") ? LABELS.de : LABELS.en;
      return test ? l.test : c.catalog.status === "draft" ? l.draft : "";
    },
  };
  if (!decision.allowed) {
    ctx.early = result(false);
    return ctx;
  }
  const selectionErrors = checkSelection(c, selection, "project").filter((d) => d.severity === "error");
  if (selectionErrors.length > 0) {
    diagnostics.push(...selectionErrors);
    err("EXPORT_SELECTION_INVALID", "The selection has unresolved conflicts; an export is only possible for a valid questionnaire.");
    ctx.early = result(false);
    return ctx;
  }
  if (!c.languages.includes(lang)) {
    err("EXPORT_LANGUAGE_UNKNOWN", `The language "${lang}" is not a language of the catalog.`);
    ctx.early = result(false);
    return ctx;
  }
  for (const id of ctx.selected) {
    const item = ctx.items.get(id);
    if (item?.sensitivity?.excludeFromExportByDefault) {
      diagnostics.push(diag("export", "info", "EXPORT_SENSITIVE_INCLUDED", `Item "${id}" is sensitive and excluded from exports by default; it is included because it was selected explicitly.`, { itemRef: id, targetPlatform: spec.platform }));
    }
  }
  return ctx;
}
