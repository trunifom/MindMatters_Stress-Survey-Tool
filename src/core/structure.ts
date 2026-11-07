import { Diagnostic, diag, pointer } from "./diagnostics";
import { leafConditions } from "./features";
import type { Catalog, Condition, Item } from "./types";

/**
 * Structure checks (stage "content"): questionnaire template, conditions and
 * modules. Spec B14, B15, B16.
 */

/** Position of every item in the template (section order, then item order). */
export function templateOrder(c: Catalog): Map<string, number> {
  const order = new Map<string, number>();
  let n = 0;
  for (const s of c.questionnaire.sections) {
    for (const id of s.itemRefs) {
      if (!order.has(id)) order.set(id, n);
      n++;
    }
  }
  return order;
}

export function checkTemplate(c: Catalog): Diagnostic[] {
  const out: Diagnostic[] = [];
  const known = new Set(c.items.map((i) => i.id));
  const seen = new Map<string, string>();
  c.questionnaire.sections.forEach((s, si) => {
    s.itemRefs.forEach((id, ii) => {
      const path = pointer("questionnaire", "sections", si, "itemRefs", ii);
      if (!known.has(id)) return; // reported as MISSING_ITEM
      const prev = seen.get(id);
      if (prev !== undefined) {
        out.push(
          diag("content", "error", "TEMPLATE_ITEM_DUPLICATE", `Item "${id}" appears more than once in the questionnaire template (first at ${prev}). Repeated use needs an occurrence model that this profile does not have.`, {
            jsonPath: path,
            itemRef: id,
          }),
        );
      } else {
        seen.set(id, path);
      }
    });
  });
  c.items.forEach((it, i) => {
    if (!seen.has(it.id)) {
      out.push(
        diag("content", "error", "TEMPLATE_ITEM_MISSING", `Item "${it.id}" is not part of the questionnaire template. Every item must appear exactly once.`, {
          jsonPath: pointer("items", i, "id"),
          itemRef: it.id,
        }),
      );
    }
  });
  return out;
}

const NUMERIC_KINDS = new Set(["integer", "decimal", "slider"]);

function operatorFits(op: Condition["operator"], kind: string): boolean {
  if (op === "equals" || op === "notEquals") return kind === "singleChoice";
  if (op === "contains" || op === "notContains") return kind === "multipleChoice";
  return NUMERIC_KINDS.has(kind); // greaterThan, greaterThanOrEqual, lessThan, lessThanOrEqual
}

export function checkConditions(c: Catalog): Diagnostic[] {
  const out: Diagnostic[] = [];
  const items = new Map<string, Item>(c.items.map((i) => [i.id, i]));
  const optionSets = new Map(c.optionSets.map((o) => [o.id, o]));
  const order = templateOrder(c);
  const edges = new Map<string, string[]>();

  c.items.forEach((it, i) => {
    const leaves = leafConditions(it.visibleWhen);
    leaves.forEach((cond) => {
      const path = pointer("items", i, "visibleWhen");
      const add = (code: string, message: string) =>
        out.push(diag("content", "error", code, message, { jsonPath: path, itemRef: it.id }));

      const trigger = items.get(cond.itemRef);
      if (!trigger) return; // reported as MISSING_ITEM
      edges.set(it.id, [...(edges.get(it.id) ?? []), trigger.id]);

      if (trigger.id === it.id) {
        add("CONDITION_SELF_REFERENCE", `Item "${it.id}" cannot depend on itself.`);
        return;
      }
      const pt = order.get(trigger.id);
      const pf = order.get(it.id);
      if (pt !== undefined && pf !== undefined && pt >= pf) {
        add("CONDITION_TRIGGER_NOT_BEFORE", `The trigger "${trigger.id}" must stand before the dependent item "${it.id}" in the questionnaire.`);
      }
      if (!operatorFits(cond.operator, trigger.response.kind)) {
        add("CONDITION_OPERATOR_TYPE", `Operator "${cond.operator}" cannot be used on a "${trigger.response.kind}" question ("${trigger.id}").`);
        return;
      }
      if (trigger.response.kind === "singleChoice" || trigger.response.kind === "multipleChoice") {
        const os = trigger.response.optionSetRef ? optionSets.get(trigger.response.optionSetRef) : undefined;
        if (os && !os.options.some((o) => o.code === cond.value)) {
          add("CONDITION_VALUE_INVALID", `Value "${cond.value}" is not an option code of "${os.id}" (trigger "${trigger.id}").`);
        }
      } else if (cond.value.trim() === "" || !Number.isFinite(Number(cond.value))) {
        add("CONDITION_VALUE_INVALID", `Value "${cond.value}" is not a number (trigger "${trigger.id}").`);
      }
    });
  });

  // Cycles among triggers (cannot occur when order is respected, but ordering is only checked for items in the template).
  const state = new Map<string, 1 | 2>();
  const reported = new Set<string>();
  const visit = (id: string, trail: string[]) => {
    state.set(id, 1);
    for (const next of edges.get(id) ?? []) {
      if (next === id) continue; // self reference has its own code
      if (state.get(next) === 1) {
        const cycle = [...trail.slice(trail.indexOf(next)), next];
        const key = [...new Set(cycle)].sort().join("|");
        if (!reported.has(key)) {
          reported.add(key);
          out.push(diag("content", "error", "CONDITION_CYCLE", `Visibility conditions form a cycle: ${cycle.join(" -> ")}.`, { itemRef: next }));
        }
      } else if (!state.has(next)) {
        visit(next, [...trail, next]);
      }
    }
    state.set(id, 2);
  };
  for (const id of edges.keys()) if (!state.has(id)) visit(id, [id]);
  return out;
}

export function checkModules(c: Catalog): Diagnostic[] {
  const out: Diagnostic[] = [];
  const items = new Map<string, Item>(c.items.map((i) => [i.id, i]));
  const scales = new Map(c.scales.map((s) => [s.id, s]));
  const owner = new Map<string, string>();

  c.modules.forEach((m, mi) => {
    const base = (...p: Array<string | number>) => pointer("modules", mi, ...p);

    m.itemRefs.forEach((id, ii) => {
      const prev = owner.get(id);
      if (prev !== undefined && prev !== m.id) {
        out.push(diag("content", "error", "ITEM_IN_MULTIPLE_MODULES", `Item "${id}" belongs to modules "${prev}" and "${m.id}". An item may belong to at most one module.`, {
          jsonPath: base("itemRefs", ii),
          itemRef: id,
          moduleRef: m.id,
        }));
      } else if (prev === undefined) {
        owner.set(id, m.id);
      }
    });

    m.scaleRefs?.forEach((sid, si) => {
      const scale = scales.get(sid);
      if (!scale) return; // MISSING_SCALE
      const outside = scale.itemRefs.filter((id) => !m.itemRefs.includes(id));
      if (outside.length > 0) {
        out.push(diag("content", "error", "MODULE_SCALE_NOT_CONTAINED", `Scale "${sid}" is listed in module "${m.id}" but ${outside.length} of its items are not (e.g. "${outside[0]}").`, {
          jsonPath: base("scaleRefs", si),
          moduleRef: m.id,
          scaleRef: sid,
        }));
      }
    });

    if (m.selectionMode !== "allOrNothing") return;
    m.itemRefs.forEach((id, ii) => {
      const it = items.get(id);
      if (!it) return;
      if (it.defaultSelected !== m.defaultSelected) {
        out.push(diag("content", "error", "MODULE_DEFAULT_MISMATCH", `Item "${id}" has defaultSelected=${it.defaultSelected} but its allOrNothing module "${m.id}" has ${m.defaultSelected}.`, {
          jsonPath: base("itemRefs", ii),
          itemRef: id,
          moduleRef: m.id,
        }));
      }
      if (!m.inclusionRequired && it.inclusionRequired) {
        out.push(diag("content", "error", "MODULE_OPTIONAL_HAS_REQUIRED_ITEM", `Item "${id}" is mandatory but its module "${m.id}" is optional. An optional allOrNothing module cannot contain mandatory items.`, {
          jsonPath: base("itemRefs", ii),
          itemRef: id,
          moduleRef: m.id,
        }));
      }
    });
  });
  return out;
}
