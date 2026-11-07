import { describe, expect, it } from "vitest";
import { MIGRATABLE_SCHEMA_VERSIONS, SUPPORTED_SCHEMA_VERSIONS } from "../../src/version";

describe("version constants", () => {
  it("supports exactly schema 0.4.0 without migration", () => {
    expect(SUPPORTED_SCHEMA_VERSIONS).toEqual(["0.4.0"]);
  });
  it("offers explicit migration only from 0.3.0", () => {
    expect(MIGRATABLE_SCHEMA_VERSIONS).toEqual(["0.3.0"]);
  });
  it("never lists a version as both supported and migratable", () => {
    const supported = new Set<string>(SUPPORTED_SCHEMA_VERSIONS);
    for (const v of MIGRATABLE_SCHEMA_VERSIONS) expect(supported.has(v)).toBe(false);
  });
});
