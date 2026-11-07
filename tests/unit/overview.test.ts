import { describe, expect, it } from "vitest";
import { documentedDuration, scaleOverview } from "../../src/model/selection";
import type { Catalog } from "../../src/core/types";
import { clone, example040, fixture040 } from "./helpers";

const rich = (): any => clone(example040());
const all = (c: Catalog): Set<string> => new Set(c.items.map((i) => i.id));

describe("documented administration time (B6)", () => {
  it("counts a completely selected instrument with a documented time", () => {
    const c = rich();
    const d = documentedDuration(c, all(c));
    expect(d.instruments).toEqual(["form_demo"]);
    expect([d.minMinutes, d.maxMinutes]).toEqual([2, 4]);
  });

  it("counts nothing when the instrument is only partly selected: the time of a part is not known", () => {
    const c = rich();
    const sel = all(c);
    sel.delete("demo_04");
    const d = documentedDuration(c, sel);
    expect(d.instruments).toEqual([]);
    expect([d.minMinutes, d.maxMinutes]).toEqual([0, 0]);
  });

  it("reports items without a documented time as unknown, not as zero, and ignores text blocks", () => {
    const c = rich();
    const d = documentedDuration(c, all(c));
    // slider, ranking, wants_help, contact_email have no instrument; the two notes do not count
    expect(d.unknownItems).toBe(4);
  });

  it("never estimates: a catalog without administrationTime gives no time", () => {
    const c: any = fixture040("10_Katalog_Klein_Gemischt.json");
    const d = documentedDuration(c, all(c));
    expect(d.instruments).toEqual([]);
    expect(d.maxMinutes).toBe(0);
  });
});

describe("overview by scale", () => {
  it("classifies each scale as complete, partial or none and carries the policy", () => {
    const c: any = fixture040("20_Katalog_Vollstaendige_Skalen.json");
    const scale = c.scales[0];
    const none = scaleOverview(c, new Set()).find((x) => x.id === scale.id)!;
    expect([none.selected, none.state]).toEqual([0, "none"]);
    const full = scaleOverview(c, new Set(scale.itemRefs)).find((x) => x.id === scale.id)!;
    expect([full.selected, full.total, full.state]).toEqual([scale.itemRefs.length, scale.itemRefs.length, "complete"]);
    expect(full.policy).toBe(scale.selectionPolicy);
    if (scale.itemRefs.length > 1) {
      const part = scaleOverview(c, new Set([scale.itemRefs[0]])).find((x) => x.id === scale.id)!;
      expect(part.state).toBe("partial");
    }
  });
});
