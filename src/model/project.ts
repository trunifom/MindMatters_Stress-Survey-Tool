import { Diagnostic, diag } from "../core/diagnostics";
import type { Catalog, Customization, Project } from "../core/types";
import { normalizeCustomization } from "./customize";
import { checkSelection, orderedSelection, Selection } from "./selection";

/**
 * Creating and serializing project files (spec A11, B18, C03, C10).
 *
 * A project stores references only: exact catalog id and version, the
 * questionnaire id, the language and the selected item ids. It never contains
 * item texts of the catalog or rule overrides. The only texts it may carry are the
 * school's own: adapted questionnaire texts and added text blocks (`customization`).
 */

export interface CreateProjectOptions {
  /** Defaults to the catalog's default language. Must be a catalog language. */
  language?: string;
  targetPlatform?: string;
  /** Local label of the school; stays in the file, is never part of a file name. */
  schoolLabel?: string;
  /** Internal notes; local only, never published by the tool. */
  internalNotes?: string;
  /** Adapted texts and own text blocks (already applied to the catalog passed to createProject). */
  customization?: Customization;
  /** Injected for deterministic output (tests); defaults to the current time. */
  now?: Date;
}

export interface CreateProjectResult {
  /** Undefined only if the project cannot be expressed (unknown language). */
  project?: Project;
  /**
   * Selection findings (context "project"). Saving is allowed despite
   * export-related errors: the conflicts are documented here, not hidden
   * and not repaired.
   */
  diagnostics: Diagnostic[];
}

const clean = (s: string | undefined): string | undefined => {
  const t = s?.trim();
  return t ? t : undefined;
};

export function createProject(c: Catalog, selected: Selection, options: CreateProjectOptions = {}): CreateProjectResult {
  const language = options.language ?? c.catalog.defaultLanguage;
  if (!c.languages.includes(language)) {
    return {
      diagnostics: [
        diag("selection", "error", "PROJECT_LANGUAGE_UNKNOWN", `Language "${language}" is not a language of the catalog (${c.languages.join(", ")}).`, {
          context: "project",
        }),
      ],
    };
  }

  const platform = clean(options.targetPlatform);
  const school = clean(options.schoolLabel);
  const notes = clean(options.internalNotes);
  const custom = normalizeCustomization(options.customization);

  // Fixed key order: stable, diff-friendly files.
  const project: Project = {
    schemaVersion: "0.4.0",
    documentType: "questionnaireProject",
    catalogRef: { id: c.catalog.id, version: c.catalog.version },
    questionnaireRef: c.questionnaire.id,
    selectedItemIds: orderedSelection(c, selected),
    language,
    ...(platform ? { targetPlatform: platform } : {}),
    ...(school ? { schoolLabel: school } : {}),
    ...(notes ? { internalNotes: notes } : {}),
    ...(custom ? { customization: custom } : {}),
    savedAt: (options.now ?? new Date()).toISOString(),
  };
  return { project, diagnostics: checkSelection(c, selected, "project") };
}

/** Deterministic JSON text of a project (2-space indent, trailing newline). */
export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2) + "\n";
}

/**
 * Suggested download name. Built only from catalog id and version: school labels
 * and notes never end up in a file name unasked (C10).
 */
export function projectFileName(c: Catalog): string {
  return `${c.catalog.id}_${c.catalog.version}_project.json`;
}
