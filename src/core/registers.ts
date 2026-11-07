import { Diagnostic, diag, pointer } from "./diagnostics";
import { leafConditions } from "./features";
import type { Catalog, SourceLink } from "./types";

/**
 * Register checks (stage "reference"): unique IDs, unique variable names, every
 * reference resolves to the register named by the field, acyclic constructs and
 * date order. JSON Schema cannot express any of this.
 *
 * Missing targets are bundled: one finding per distinct (kind, id) with the number
 * of occurrences, instead of a cascade of follow-up errors (spec C02).
 */

type RefKind =
  | "SOURCE"
  | "RIGHTS_PROFILE"
  | "CONSTRUCT"
  | "INSTRUMENT"
  | "OPTION_SET"
  | "ITEM"
  | "SCALE"
  | "SCORE_DEFINITION";

const LABEL: Record<RefKind, string> = {
  SOURCE: "source",
  RIGHTS_PROFILE: "rights profile",
  CONSTRUCT: "construct",
  INSTRUMENT: "instrument",
  OPTION_SET: "option set",
  ITEM: "item",
  SCALE: "scale",
  SCORE_DEFINITION: "score definition",
};

export function checkRegisters(c: Catalog): Diagnostic[] {
  const out: Diagnostic[] = [];
  out.push(...duplicateIds(c));
  out.push(...duplicateVariableNames(c));
  out.push(...references(c));
  out.push(...constructCycles(c));
  out.push(...dateOrder(c));
  return out;
}

// ---------------------------------------------------------------------------

function duplicateIds(c: Catalog): Diagnostic[] {
  const out: Diagnostic[] = [];
  const registers: Array<[string, Array<{ id: string }>]> = [
    ["sources", c.sources],
    ["rights", c.rights],
    ["constructs", c.constructs],
    ["instruments", c.instruments],
    ["optionSets", c.optionSets],
    ["items", c.items],
    ["scales", c.scales],
    ["modules", c.modules],
    ["scoringDefinitions", c.scoringDefinitions ?? []],
    ["evidence", c.evidence ?? []],
    ["questionnaire/sections", c.questionnaire.sections],
    ["questionnaire/hiddenFields", c.questionnaire.hiddenFields ?? []],
  ];
  for (const [name, list] of registers) {
    const first = new Map<string, number>();
    list.forEach((entry, i) => {
      const prev = first.get(entry.id);
      if (prev === undefined) {
        first.set(entry.id, i);
        return;
      }
      const base = name.split("/").reduce((p, s) => p + pointer(s), "");
      out.push(
        diag("reference", "error", "DUPLICATE_ID", `ID "${entry.id}" occurs more than once in ${name} (first at index ${prev}).`, {
          jsonPath: base + pointer(i, "id"),
          ...(name === "items" ? { itemRef: entry.id } : {}),
        }),
      );
    });
  }
  for (const os of c.optionSets) {
    const seen = new Set<string>();
    os.options.forEach((o, i) => {
      if (seen.has(o.code)) {
        out.push(
          diag("reference", "error", "DUPLICATE_OPTION_CODE", `Option code "${o.code}" occurs more than once in option set "${os.id}".`, {
            jsonPath: pointer("optionSets", c.optionSets.indexOf(os), "options", i, "code"),
          }),
        );
      }
      seen.add(o.code);
    });
  }
  return out;
}

function duplicateVariableNames(c: Catalog): Diagnostic[] {
  const out: Diagnostic[] = [];
  const first = new Map<string, string>();
  const note = (name: string, where: string, path: string, itemRef?: string) => {
    const prev = first.get(name);
    if (prev === undefined) {
      first.set(name, where);
      return;
    }
    out.push(
      diag("reference", "error", "DUPLICATE_VARIABLE_NAME", `Variable name "${name}" is already used by ${prev}. Variable names must be unique catalog-wide.`, {
        jsonPath: path,
        ...(itemRef ? { itemRef } : {}),
      }),
    );
  };
  c.items.forEach((it, i) => note(it.variableName, `item "${it.id}"`, pointer("items", i, "variableName"), it.id));
  (c.questionnaire.hiddenFields ?? []).forEach((h, i) =>
    note(h.variableName, `hidden field "${h.id}"`, pointer("questionnaire", "hiddenFields", i, "variableName")),
  );
  return out;
}

// ---------------------------------------------------------------------------

function references(c: Catalog): Diagnostic[] {
  const sets: Record<RefKind, Set<string>> = {
    SOURCE: new Set(c.sources.map((x) => x.id)),
    RIGHTS_PROFILE: new Set(c.rights.map((x) => x.id)),
    CONSTRUCT: new Set(c.constructs.map((x) => x.id)),
    INSTRUMENT: new Set(c.instruments.map((x) => x.id)),
    OPTION_SET: new Set(c.optionSets.map((x) => x.id)),
    ITEM: new Set(c.items.map((x) => x.id)),
    SCALE: new Set(c.scales.map((x) => x.id)),
    SCORE_DEFINITION: new Set((c.scoringDefinitions ?? []).map((x) => x.id)),
  };

  const missing = new Map<string, { kind: RefKind; id: string; paths: string[]; itemRef?: string }>();
  const check = (kind: RefKind, id: string, path: string, itemRef?: string) => {
    if (sets[kind].has(id)) return;
    const key = `${kind}|${id}`;
    const entry = missing.get(key);
    if (entry) entry.paths.push(path);
    else missing.set(key, { kind, id, paths: [path], ...(itemRef ? { itemRef } : {}) });
  };
  const links = (list: SourceLink[] | undefined, base: string) =>
    list?.forEach((l, i) => check("SOURCE", l.sourceRef, base + pointer(i, "sourceRef")));

  c.rights.forEach((r, i) => r.evidenceSourceRef && check("SOURCE", r.evidenceSourceRef, pointer("rights", i, "evidenceSourceRef")));

  c.constructs.forEach((x, i) => {
    if (x.parentRef) check("CONSTRUCT", x.parentRef, pointer("constructs", i, "parentRef"));
    links(x.sourceLinks, pointer("constructs", i, "sourceLinks"));
  });

  c.instruments.forEach((x, i) => {
    if (x.rightsRef) check("RIGHTS_PROFILE", x.rightsRef, pointer("instruments", i, "rightsRef"));
    links(x.sourceLinks, pointer("instruments", i, "sourceLinks"));
    links(x.translation?.sourceLinks, pointer("instruments", i, "translation", "sourceLinks"));
    links(x.administrationTime?.sourceLinks, pointer("instruments", i, "administrationTime", "sourceLinks"));
  });

  c.items.forEach((it, i) => {
    const base = (...p: Array<string | number>) => pointer("items", i, ...p);
    if (it.rightsRef) check("RIGHTS_PROFILE", it.rightsRef, base("rightsRef"), it.id);
    if (it.instrumentRef) check("INSTRUMENT", it.instrumentRef, base("instrumentRef"), it.id);
    it.constructRefs.forEach((r, j) => check("CONSTRUCT", r, base("constructRefs", j), it.id));
    links(it.sourceLinks, base("sourceLinks"));
    if (it.response.optionSetRef) check("OPTION_SET", it.response.optionSetRef, base("response", "optionSetRef"), it.id);
    for (const leaf of leafConditions(it.visibleWhen)) check("ITEM", leaf.itemRef, base("visibleWhen"), it.id);
  });

  c.scales.forEach((s, i) => {
    const base = (...p: Array<string | number>) => pointer("scales", i, ...p);
    s.itemRefs.forEach((r, j) => check("ITEM", r, base("itemRefs", j)));
    s.constructRefs.forEach((r, j) => check("CONSTRUCT", r, base("constructRefs", j)));
    if (s.instrumentRef) check("INSTRUMENT", s.instrumentRef, base("instrumentRef"));
    s.scoreDefinitionRefs?.forEach((r, j) => check("SCORE_DEFINITION", r, base("scoreDefinitionRefs", j)));
    links(s.sourceLinks, base("sourceLinks"));
  });

  c.modules.forEach((m, i) => {
    m.itemRefs.forEach((r, j) => check("ITEM", r, pointer("modules", i, "itemRefs", j)));
    m.scaleRefs?.forEach((r, j) => check("SCALE", r, pointer("modules", i, "scaleRefs", j)));
  });

  c.questionnaire.sections.forEach((s, i) =>
    s.itemRefs.forEach((r, j) => check("ITEM", r, pointer("questionnaire", "sections", i, "itemRefs", j))),
  );

  (c.scoringDefinitions ?? []).forEach((d, i) => {
    const base = (...p: Array<string | number>) => pointer("scoringDefinitions", i, ...p);
    d.itemRefs.forEach((r, j) => check("ITEM", r, base("itemRefs", j)));
    d.itemMappings.forEach((m, j) => check("ITEM", m.itemRef, base("itemMappings", j, "itemRef")));
    if (d.scaleRef) check("SCALE", d.scaleRef, base("scaleRef"));
    links(d.sourceLinks, base("sourceLinks"));
  });

  (c.evidence ?? []).forEach((e, i) => {
    check(e.targetType === "instrument" ? "INSTRUMENT" : "SCALE", e.targetRef, pointer("evidence", i, "targetRef"));
    links(e.sourceLinks, pointer("evidence", i, "sourceLinks"));
  });

  return [...missing.values()].map((m) =>
    diag(
      "reference",
      "error",
      `MISSING_${m.kind}`,
      `Reference to unknown ${LABEL[m.kind]} "${m.id}"${m.paths.length > 1 ? ` (${m.paths.length} occurrences)` : ""}.`,
      { jsonPath: m.paths[0] as string, ...(m.itemRef ? { itemRef: m.itemRef } : {}) },
    ),
  );
}

// ---------------------------------------------------------------------------

function constructCycles(c: Catalog): Diagnostic[] {
  const parent = new Map(c.constructs.map((x) => [x.id, x.parentRef]));
  const out: Diagnostic[] = [];
  const reported = new Set<string>();
  c.constructs.forEach((x, i) => {
    const path: string[] = [];
    let cur: string | undefined = x.id;
    while (cur !== undefined && parent.has(cur)) {
      if (path.includes(cur)) {
        const cycle = path.slice(path.indexOf(cur));
        const key = [...cycle].sort().join("|");
        if (!reported.has(key)) {
          reported.add(key);
          out.push(
            diag("reference", "error", "CONSTRUCT_CYCLE", `Construct hierarchy contains a cycle: ${[...cycle, cur].join(" -> ")}.`, {
              jsonPath: pointer("constructs", i, "parentRef"),
            }),
          );
        }
        return;
      }
      path.push(cur);
      cur = parent.get(cur);
    }
  });
  return out;
}

function dateOrder(c: Catalog): Diagnostic[] {
  const { createdAt, updatedAt } = c.catalog;
  if (createdAt && updatedAt && Date.parse(updatedAt) < Date.parse(createdAt)) {
    return [diag("content", "error", "DATE_ORDER_INVALID", "catalog.updatedAt must not be earlier than catalog.createdAt.", { jsonPath: "/catalog/updatedAt" })];
  }
  return [];
}
