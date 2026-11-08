/**
 * Rights and action matrix (spec B05, C03).
 *
 * This is a PRODUCT POLICY about declared rights, not a legal statement. The parser proves nothing about real
 * permissions; it only refuses to act where the catalog does not declare, and a reviewer has confirmed, what the
 * action needs. Without a confirmed "permitted" the text stays locked and exports stay blocked: unknown is never
 * treated as allowed.
 *
 * Rights are resolved per affected item: Item.rightsRef, else the item's instrument rightsRef, else "unknown /
 * unreviewed". An error in a permission an action does not need never blocks that action (modification=prohibited
 * is compatible with permitted unchanged use). Catalog status adds rules: only "released" catalogs get a native
 * export, "draft" output carries a watermark, "withdrawn" output a notice.
 *
 * The output layer asks evaluateAction (via output/adapterBase) before it writes anything. Depends on core only
 * and on selection.ts for the questionnaire order.
 */

import { Diagnostic, diag } from "../core/diagnostics";
import type { Catalog, Item, LocalizedText, RightsProfile } from "../core/types";
import { orderedSelection, Selection } from "./selection";

/**
 * What the application wants to do with item texts: show them, save a project (references only), save a check report, write a
 * codebook with texts, export natively, or write a labelled development test export.
 */
export type Action =
  | "displayItems"
  | "saveProject"
  | "saveCheckReport"
  | "codebookWithTexts"
  | "nativeExport"
  | "devTestExport";

type PermissionName = keyof RightsProfile["permissions"];

/** Permissions every item needs for an action (all must be "permitted" and the profile "reviewed"). */
const NEEDS: Record<Action, readonly PermissionName[] | null> = {
  displayItems: ["electronicDisplay"],
  saveProject: null, // stores references only, no item text
  saveCheckReport: null, // technical IDs and findings only, no protected text
  codebookWithTexts: ["export", "redistribution", "electronicDisplay"],
  nativeExport: ["export", "redistribution", "electronicAdministration"],
  devTestExport: ["export", "redistribution", "electronicAdministration"], // never bypasses a prohibition
};

/** Rights that apply to one item and where they come from (item profile, instrument profile or nothing). */
export interface EffectiveRights {
  source: "item" | "instrument" | "none";
  profileId?: string;
  reviewStatus: RightsProfile["reviewStatus"];
  permissions: RightsProfile["permissions"];
  attribution?: LocalizedText;
}

const UNKNOWN: EffectiveRights = {
  source: "none",
  reviewStatus: "unreviewed",
  permissions: {
    redistribution: "unknown",
    electronicDisplay: "unknown",
    electronicAdministration: "unknown",
    modification: "unknown",
    export: "unknown",
  },
};

/** Item.rightsRef, else Instrument.rightsRef, else unknown/unreviewed (B05). */
export function effectiveRights(c: Catalog, item: Item): EffectiveRights {
  const pick = (id: string | undefined, source: "item" | "instrument"): EffectiveRights | undefined => {
    const p = id ? c.rights.find((r) => r.id === id) : undefined;
    return p
      ? {
          source,
          profileId: p.id,
          reviewStatus: p.reviewStatus,
          permissions: p.permissions,
          ...(p.attribution ? { attribution: p.attribution } : {}),
        }
      : undefined;
  };
  const instrument = item.instrumentRef ? c.instruments.find((i) => i.id === item.instrumentRef) : undefined;
  return pick(item.rightsRef, "item") ?? pick(instrument?.rightsRef, "instrument") ?? UNKNOWN;
}

/** Why an item does not pass: profile not reviewed, or a needed permission unknown or prohibited. */
export type BlockReason = "UNREVIEWED" | "PERMISSION_UNKNOWN" | "PERMISSION_PROHIBITED";

/** One blocked item with all its reasons. */
export interface ItemBlock {
  itemId: string;
  reasons: Array<{ reason: BlockReason; permission?: PermissionName; declaredPermitted?: boolean }>;
}

/**
 * Decision for one action on a selection. Display and codebook only withhold the texts of blocked items (see `allowedItemIds`);
 * an export is blocked as a whole as soon as one selected item or the catalog status blocks it.
 */
export interface ActionDecision {
  action: Action;
  /** True if the action may run completely: catalog status fine and no selected item blocked. */
  allowed: boolean;
  /** Catalog-level reason (status policy), if any. */
  catalogBlocked: boolean;
  /** Items whose rights do not cover the action (only items in the selection). */
  blockedItems: ItemBlock[];
  /** Items the action may use. For displayItems/codebook: items whose text may be shown. */
  allowedItemIds: string[];
  flags: {
    /** Output must be labelled as a draft ("not released for productive use"). */
    draftWatermark: boolean;
    /** Output must carry a clear withdrawal marking. */
    withdrawnNotice: boolean;
    /** Output must be labelled as a development test artifact. */
    testArtifact: boolean;
  };
  diagnostics: Diagnostic[];
}

/** Options for evaluateAction. */
export interface EvaluateOptions {
  /** Items to evaluate. Defaults to the whole catalog. */
  selection?: Selection;
}

const PLURAL = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Decide whether `action` may run for the selection (whole catalog if omitted). Never throws and never changes anything. Findings
 * are aggregated per distinct reason, not per item. Severity is a warning for displayItems (text locked) and an error for the rest.
 */
export function evaluateAction(c: Catalog, action: Action, options: EvaluateOptions = {}): ActionDecision {
  const status = c.catalog.status;
  const ids = options.selection ? orderedSelection(c, options.selection) : c.items.map((i) => i.id);
  const items = new Map(c.items.map((i) => [i.id, i]));
  const needs = NEEDS[action];
  const ds: Diagnostic[] = [];
  const flags = { draftWatermark: false, withdrawnNotice: false, testArtifact: action === "devTestExport" };
  let catalogBlocked = false;

  // --- catalog status policy (C03, B03)
  if (status === "withdrawn") {
    flags.withdrawnNotice = true;
    if (action === "nativeExport" || action === "devTestExport") {
      catalogBlocked = true;
      ds.push(diag("rights", "error", "CATALOG_WITHDRAWN", `The catalog "${c.catalog.id}" has been withdrawn by its publisher. ${action === "devTestExport" ? "Test exports" : "Native exports"} are blocked.`));
    } else {
      ds.push(diag("rights", "warning", "CATALOG_WITHDRAWN", `The catalog "${c.catalog.id}" has been withdrawn by its publisher. Outputs must carry a clear withdrawal notice.`));
    }
  }
  if (action === "nativeExport" && status !== "released" && status !== "withdrawn") {
    catalogBlocked = true;
    ds.push(diag("rights", "error", "CATALOG_NOT_RELEASED", `Regular native export requires catalog status "released" but it is "${status}". Only a separately labelled development test export is possible.`));
  }
  if (status === "draft" && (action === "codebookWithTexts" || action === "devTestExport")) {
    flags.draftWatermark = true;
    ds.push(diag("rights", "info", "DRAFT_WATERMARK_REQUIRED", "Catalog status is draft: the output must say \"Draft – not released for productive use\"."));
  }
  if (action === "devTestExport" && status !== "withdrawn") {
    ds.push(diag("rights", "info", "TEST_ARTIFACT", "Development test export: must be labelled as a test artifact, kept apart from the school workflow and carries a release responsibility. It does not bypass any rights prohibition."));
  }

  // --- per item rights
  const blocked: ItemBlock[] = [];
  const allowedItemIds: string[] = [];
  for (const id of ids) {
    const item = items.get(id);
    if (!item) continue;
    if (!needs) {
      allowedItemIds.push(id);
      continue;
    }
    const rights = effectiveRights(c, item);
    const reasons: ItemBlock["reasons"] = [];
    const declaredPermitted = needs.every((p) => rights.permissions[p] === "permitted");
    if (rights.reviewStatus !== "reviewed") {
      reasons.push({ reason: "UNREVIEWED", declaredPermitted });
    }
    for (const p of needs) {
      const v = rights.permissions[p];
      if (v === "unknown") reasons.push({ reason: "PERMISSION_UNKNOWN", permission: p });
      else if (v === "prohibited") reasons.push({ reason: "PERMISSION_PROHIBITED", permission: p });
    }
    if (reasons.length > 0) blocked.push({ itemId: id, reasons });
    else allowedItemIds.push(id);
  }

  // --- aggregated diagnostics: one finding per distinct reason, not one per item
  const group = new Map<string, { count: number; first: string; code: string; message: string }>();
  for (const b of blocked) {
    for (const r of b.reasons) {
      const key = `${r.reason}|${r.permission ?? ""}|${r.declaredPermitted ?? ""}`;
      const g = group.get(key);
      if (g) {
        g.count++;
        continue;
      }
      const what =
        r.reason === "UNREVIEWED"
          ? r.declaredPermitted
            ? "its rights profile is not reviewed (the declared permissions are an unconfirmed statement, not a release)"
            : "its rights profile is not reviewed"
          : r.reason === "PERMISSION_UNKNOWN"
            ? `permission "${r.permission}" is unknown`
            : `permission "${r.permission}" is prohibited`;
      group.set(key, {
        count: 1,
        first: b.itemId,
        code: r.reason === "UNREVIEWED" ? "RIGHTS_UNREVIEWED" : r.reason === "PERMISSION_UNKNOWN" ? "RIGHTS_PERMISSION_UNKNOWN" : "RIGHTS_PERMISSION_PROHIBITED",
        message: what,
      });
    }
  }
  const severity = action === "displayItems" ? "warning" : "error";
  const effect =
    action === "displayItems"
      ? "the item text is locked, only ID and diagnosis are shown"
      : action === "codebookWithTexts"
        ? "the item text is left out of the codebook"
        : "the export is blocked";
  for (const g of group.values()) {
    ds.push(
      diag("rights", severity, g.code, `${g.count} selected ${PLURAL(g.count, "item", "items")} (first: "${g.first}"): ${g.message}; ${effect}.`, {
        itemRef: g.first,
      }),
    );
  }

  // "allowed" means the action may run completely. For display and codebook a blocked item
  // only withholds that item's text (see allowedItemIds); for exports one blocked item blocks the export.
  const allowed = !catalogBlocked && blocked.length === 0;

  return { action, allowed, catalogBlocked, blockedItems: blocked, allowedItemIds, flags, diagnostics: ds };
}

/** Attribution texts the selected items require. They may not simply be dropped (B21). */
export function requiredAttributions(c: Catalog, selection: Selection): Array<{ profileId: string; attribution: LocalizedText }> {
  const seen = new Map<string, LocalizedText>();
  for (const id of orderedSelection(c, selection)) {
    const item = c.items.find((i) => i.id === id);
    if (!item) continue;
    const r = effectiveRights(c, item);
    if (r.profileId && r.attribution && !seen.has(r.profileId)) seen.set(r.profileId, r.attribution);
  }
  return [...seen].map(([profileId, attribution]) => ({ profileId, attribution }));
}

/** Convenience: may the text of this item be shown in the configurator? */
export function mayDisplay(decision: ActionDecision, itemId: string): boolean {
  return decision.allowedItemIds.includes(itemId);
}
