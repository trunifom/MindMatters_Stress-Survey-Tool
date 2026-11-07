"""Validate fixtures against the JSON Schemas (structure only) and run mutation tests.

Usage: python -I tests/conformance/validate_schema.py
Exit code 0 = every file/mutation behaved as expected.

0.3.0 fixtures in tests/fixtures/v0.3.0/ are validated against schema/0.3.0 as delivered, and,
after an explicit in-memory migration (schemaVersion bump; 0.4.0 is purely additive),
against schema/0.4.0.
"""
import copy
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent.parent.parent
DOCS = ROOT / "tests" / "fixtures" / "v0.3.0"
SCHEMAS = ROOT / "schema"


def load_strict(path):
    """json.load that rejects duplicate object keys (spec B01 / C01)."""
    def hook(pairs):
        keys = [k for k, _ in pairs]
        dup = {k for k in keys if keys.count(k) > 1}
        if dup:
            raise ValueError(f"duplicate keys {sorted(dup)} in {path.name}")
        return dict(pairs)
    with open(path, encoding="utf-8") as f:
        return json.load(f, object_pairs_hook=hook)


def validator(version, name):
    schema = load_strict(SCHEMAS / version / name)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def errors(v, doc):
    return sorted(v.iter_errors(doc), key=lambda e: list(e.absolute_path))


def migrate_0_3_to_0_4(doc):
    doc = copy.deepcopy(doc)
    assert doc["schemaVersion"] == "0.3.0"
    doc["schemaVersion"] = "0.4.0"
    return doc


FIXTURES = [  # (file, kind, must_be_valid_by_schema)
    ("10_Katalog_Klein_Gemischt.json", "catalog", True),
    ("11_Projekt_Klein_Gemischt.json", "project", True),
    ("20_Katalog_Vollstaendige_Skalen.json", "catalog", True),
    ("21_Projekt_Vollstaendige_Skalen.json", "project", True),
    ("30_Katalog_Zweisprachig.json", "catalog", True),
    ("31_Projekt_Zweisprachig.json", "project", True),
    ("40_Katalog_Antworttypen_Logik.json", "catalog", True),
    ("41_Projekt_Antworttypen_Logik.json", "project", True),
    # 90 is a schema error (boolean as text). 91/92 are semantic errors
    # (unknown reference / dependency) and are schema-valid by design.
    ("90_Fehler_Boolean_Als_Text.json", "catalog", False),
    ("91_Fehler_Fehlende_Antwortliste.json", "catalog", True),
    ("92_Fehler_Projekt_Ohne_Ausloeser.json", "project", True),
]


def item(doc, item_id):
    return next(i for i in doc["items"] if i["id"] == item_id)


def mutations(rich):
    """Each mutation must make the 0.4.0 rich example INVALID."""
    def m(fn):
        d = copy.deepcopy(rich)
        fn(d)
        return d
    return {
        "unknown core field": m(lambda d: d["catalog"].update(bogus=1)),
        "bad schemaVersion": m(lambda d: d.update(schemaVersion="0.3.0")),
        "id with uppercase": m(lambda d: item(d, "demo_01").update(id="Demo_01")),
        "null value": m(lambda d: item(d, "demo_01").update(origin=None)),
        "empty localized text": m(lambda d: item(d, "demo_01")["text"].update(en="")),
        "bad language key": m(lambda d: item(d, "demo_01")["text"].update({"x": "y"})),
        "unknown response kind": m(lambda d: item(d, "demo_01").update(response={"kind": "ranking2"})),
        "slider without maximum": m(lambda d: item(d, "mood_slider")["response"].pop("maximum")),
        "slider step zero": m(lambda d: item(d, "mood_slider")["response"].update(step=0)),
        "ranking with extra field": m(lambda d: item(d, "rank_topics")["response"].update(minimum=1)),
        "required note": m(lambda d: item(d, "intro_note").update(answerRequired=True)),
        "inclusionRequired but not default": m(lambda d: item(d, "demo_01").update(defaultSelected=False)),
        "unknown text format": m(lambda d: item(d, "contact_email")["response"].update(format="regex")),
        "empty condition group": m(lambda d: item(d, "contact_email").update(visibleWhen={"all": []})),
        "single-entry condition group": m(lambda d: item(d, "contact_email").update(
            visibleWhen={"all": [{"itemRef": "wants_help", "operator": "equals", "value": "yes"}]})),
        "all+any together": m(lambda d: item(d, "contact_email")["visibleWhen"].update(
            any=item(d, "contact_email")["visibleWhen"]["all"])),
        "bad operator": m(lambda d: item(d, "contact_email")["visibleWhen"]["all"][0].update(operator="matches")),
        "sensitivity without level": m(lambda d: item(d, "demo_02")["sensitivity"].pop("level")),
        "sensitivity bad level": m(lambda d: item(d, "demo_02")["sensitivity"].update(level="low")),
        "exportHints bad platform key": m(lambda d: item(d, "demo_01")["exportHints"].update({"Lime Survey": {"notes": {"en": "x"}}})),
        "option exportHints without code": m(lambda d: d["optionSets"][0]["options"][-1]["exportHints"]["limesurvey"].pop("code")),
        "option exportHints bad code": m(lambda d: d["optionSets"][0]["options"][-1]["exportHints"]["limesurvey"].update(code="a b")),
        "exportHints empty entry": m(lambda d: item(d, "demo_01")["exportHints"].update(limesurvey={})),
        "administrationTime without source": m(lambda d: d["instruments"][0]["administrationTime"].pop("sourceLinks")),
        "hidden constant without value": m(lambda d: d["questionnaire"]["hiddenFields"][1].pop("constantValue")),
        "hidden urlParameter with constant": m(lambda d: d["questionnaire"]["hiddenFields"][0].update(constantValue="x")),
        "bad section layout": m(lambda d: d["questionnaire"]["sections"][1].update(layout="grid")),
        "bad delivery pageMode": m(lambda d: d["questionnaire"]["delivery"].update(pageMode="auto")),
        "consent without text": m(lambda d: d["questionnaire"]["consent"].pop("text")),
        "missing option without reason": m(lambda d: d["optionSets"][0]["options"][5].pop("missingReason")),
        "substantive option with reason": m(lambda d: d["optionSets"][0]["options"][0].update(missingReason="refused")),
        "behavior extension without featureId": m(lambda d: item(d, "demo_01").update(
            extensions={"org_x.thing": {"kind": "behavior", "version": "1", "data": {}}})),
        "metadata extension with featureId": m(lambda d: item(d, "demo_01").update(
            extensions={"org_x.thing": {"kind": "metadata", "version": "1", "data": {}, "featureId": "f"}})),
        "non-namespaced extension key": m(lambda d: item(d, "demo_01").update(
            extensions={"thing": {"kind": "metadata", "version": "1", "data": {}}})),
        "relative period without amount": m(lambda d: item(d, "demo_01").update(referencePeriod={"kind": "relative", "unit": "week"})),
        "current period with amount": m(lambda d: item(d, "demo_01").update(referencePeriod={"kind": "current", "amount": 1})),
        "bad note style": m(lambda d: item(d, "anon_note")["response"].update(style="headline")),
        "bad date": m(lambda d: d["catalog"].update(createdAt="2026-13-45")),
    }


def main():
    failed = 0

    def check(label, ok, detail=""):
        nonlocal failed
        failed += not ok
        print(f"{'OK  ' if ok else 'FAIL'} {label}{(': ' + detail) if detail else ''}")

    # --- 0.3.0 fixtures as delivered, and migrated against 0.4.0
    for version, migrate in (("0.3.0", lambda d: d), ("0.4.0", migrate_0_3_to_0_4)):
        v = {"catalog": validator(version, "catalog.schema.json"), "project": validator(version, "project.schema.json")}
        for fname, kind, expect_valid in FIXTURES:
            errs = errors(v[kind], migrate(load_strict(DOCS / fname)))
            ok = (not errs) == expect_valid
            detail = "valid" if not errs else f"{len(errs)} error(s): {errs[0].message[:70]}"
            check(f"[{version}] {fname}", ok, detail)

    # --- rich 0.4.0 example + mutation tests
    cat4 = validator("0.4.0", "catalog.schema.json")
    rich = load_strict(ROOT / "examples" / "catalog_rich_0_4_0.json")
    errs = errors(cat4, rich)
    check("[0.4.0] examples/catalog_rich_0_4_0.json", not errs,
          "valid" if not errs else "; ".join(e.message[:80] for e in errs[:3]))
    # 0.3.0 must reject the new fields (closed objects) -> proves versions are really distinct
    old = validator("0.3.0", "catalog.schema.json")
    check("[0.3.0] rejects 0.4.0 example", bool(errors(old, rich)))
    for name, doc in mutations(rich).items():
        check(f"mutation rejected: {name}", bool(errors(cat4, doc)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
