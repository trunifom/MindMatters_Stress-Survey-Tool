import type { Diagnostic } from "../core/diagnostics";
import type { Catalog } from "../core/types";
import { createProject, projectFileName, serializeProject } from "../model/project";
import { Selection } from "../model/selection";
import { buildCodebook } from "./codebook";
import { buildCheckReport, reportFileName, serializeReport } from "./report";
import { ADAPTERS } from "./registry";
import { buildZip, ZipEntry } from "./zip";

/**
 * Download package: one ZIP with the project file, the check report, the codebook, every export the rights
 * and the selection allow, and a README that says what is in it, how far each file can be trusted and why
 * the others are missing. Nothing is hidden: a blocked export appears in the README with its reasons.
 */

export interface PackageInput {
  catalog: Catalog;
  loadDiagnostics: Diagnostic[];
  selection: Selection;
  language: string;
  targetPlatform?: string;
  schoolLabel?: string;
  internalNotes?: string;
  /** Opt in: school label and notes go into the codebook (as in the single download). */
  codebookNotes?: boolean;
  now?: Date;
}

export interface PackageResult {
  fileName: string;
  bytes: Uint8Array;
  included: Array<{ file: string; kind: string; tier?: string; testArtifact?: boolean }>;
  skipped: Array<{ platform: string; label: string; reasons: string[] }>;
}

const TIER_TEXT = { adapter: "Adapter, an keiner echten Instanz getestet", prototype: "Prototyp, ungeprüft", table: "Tabelle für Menschen, kein Import" } as const;

export function buildPackage(input: PackageInput): PackageResult {
  const { catalog: c, selection, language } = input;
  const now = input.now ?? new Date();
  const entries: ZipEntry[] = [];
  const included: PackageResult["included"] = [];
  const skipped: PackageResult["skipped"] = [];
  const meta = {
    language,
    ...(input.targetPlatform ? { targetPlatform: input.targetPlatform } : {}),
    ...(input.schoolLabel ? { schoolLabel: input.schoolLabel } : {}),
    ...(input.internalNotes ? { internalNotes: input.internalNotes } : {}),
    now,
  };

  const { project } = createProject(c, selection, meta);
  if (project) {
    const f = projectFileName(c);
    entries.push({ name: f, data: serializeProject(project) });
    included.push({ file: f, kind: "Projektdatei (Auswahl, keine Fragetexte)" });
  }

  const report = buildCheckReport({ catalog: c, loadDiagnostics: input.loadDiagnostics, selection, language, ...(input.targetPlatform ? { targetPlatform: input.targetPlatform } : {}) });
  entries.push({ name: reportFileName(c), data: serializeReport(report) });
  included.push({ file: reportFileName(c), kind: `Prüfbericht (${report.validity === "valid" ? "gültig" : "nicht gültiger Fragebogen"})` });

  const notes = input.codebookNotes && (input.schoolLabel || input.internalNotes) ? { schoolNotes: { ...(input.schoolLabel ? { schoolLabel: input.schoolLabel } : {}), ...(input.internalNotes ? { internalNotes: input.internalNotes } : {}) } } : {};
  const codebook = buildCodebook(c, selection, { language, now, ...notes });
  const cbName = `${c.catalog.id}_${c.catalog.version}_codebook.${language}.md`;
  entries.push({ name: cbName, data: codebook.markdown });
  included.push({ file: cbName, kind: "Codebuch (Beschreibung, kein Import)" });

  for (const [platform, entry] of Object.entries(ADAPTERS)) {
    const native = entry.build(c, selection, { language, mode: "native" });
    const r = native.ok ? native : entry.build(c, selection, { language, mode: "test" });
    if (r.ok && r.content !== undefined) {
      entries.push({ name: `export/${r.fileName}`, data: r.content });
      included.push({ file: `export/${r.fileName}`, kind: entry.label, tier: TIER_TEXT[entry.tier], testArtifact: r.testArtifact });
    } else {
      const seen = new Set<string>();
      const reasons: string[] = [];
      for (const d of [...native.diagnostics, ...r.diagnostics]) {
        if (d.severity === "info") continue;
        const line = `${d.code}${d.itemRef ? ` (${d.itemRef})` : ""}`;
        if (!seen.has(line)) {
          seen.add(line);
          reasons.push(line);
        }
      }
      skipped.push({ platform, label: entry.label, reasons });
    }
  }

  const lines: string[] = [];
  lines.push(`MindMatters: Ausgabepaket`, "", `Katalog: ${c.catalog.id} ${c.catalog.version} (Status ${c.catalog.status}), Sprache ${language}, erstellt am ${now.toISOString().slice(0, 10)}`, `Items in der Auswahl: ${selection.size}`, "");
  if (c.catalog.status !== "released") lines.push("ACHTUNG: Der Katalog ist nicht freigegeben (Status " + c.catalog.status + "). Exporte sind Testexporte und als solche gekennzeichnet.", "");
  lines.push("Enthaltene Dateien:");
  for (const i of included) lines.push(`- ${i.file}: ${i.kind}${i.tier ? ` [${i.tier}]` : ""}${i.testArtifact ? " [TESTEXPORT]" : ""}`);
  lines.push("", "Nicht enthalten (mit Grund):");
  if (skipped.length === 0) lines.push("- nichts");
  for (const s of skipped) lines.push(`- ${s.label}: ${s.reasons.length > 0 ? s.reasons.join(", ") : "nicht möglich"}`);
  lines.push("", "Wichtig:", "- Kein Export wurde an einem echten Zielsystem getestet. Prüfen Sie jede importierte Umfrage mit Testantworten.", "- Das Codebuch beschreibt Codes und Wortlaut. Es ist kein Import.", "- Schulbezeichnung und interne Notizen stehen nur in der Projektdatei" + (input.codebookNotes ? " und, auf Ihre Wahl, im Codebuch." : "."), "- Es wurde nichts hochgeladen. Alles wurde in Ihrem Browser erzeugt.");
  entries.unshift({ name: "LIESMICH.txt", data: lines.join("\n") + "\n" });
  included.unshift({ file: "LIESMICH.txt", kind: "Inhaltsübersicht" });

  return { fileName: `${c.catalog.id}_${c.catalog.version}_paket.zip`, bytes: buildZip(entries, now), included, skipped };
}
