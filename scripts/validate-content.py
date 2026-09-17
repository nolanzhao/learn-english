#!/usr/bin/env python3
"""Validate every deck under ./content. Standard library only.

    python3 scripts/validate-content.py            # check all decks
    python3 scripts/validate-content.py content/spoken/sp-new.json   # check specific files (ids still checked globally)

Exit code 1 if any error is found. Warnings do not fail."""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "content"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
KINDS = {"word", "sentence"}
FILTERS = {"sublist", "pos", "chunk100"}
errors, warnings = [], []
def err(f, m): errors.append(f"ERROR  {f}: {m}")
def warn(f, m): warnings.append(f"warn   {f}: {m}")

only = {Path(a).resolve() for a in sys.argv[1:]}
courses = []
cj = ROOT / "courses.json"
if cj.exists():
    try: courses = json.loads(cj.read_text("utf-8"))
    except Exception as e: err("courses.json", f"invalid JSON: {e}")
course_ids = {c.get("id") for c in courses if isinstance(c, dict)}
seen = {}
for f in sorted(ROOT.glob("*/*.json")):
    rel = f.relative_to(ROOT.parent)
    try: d = json.loads(f.read_text("utf-8"))
    except Exception as e: err(rel, f"invalid JSON / not UTF-8: {e}"); continue
    did = d.get("id", f.stem)
    if did in seen: err(rel, f"id '{did}' already used by {seen[did]} (ids must be unique across the whole repo)")
    seen[did] = rel
    if only and f.resolve() not in only: continue
    if not ID_RE.match(str(did)): err(rel, f"id '{did}' must be lowercase letters/digits/hyphens")
    if did != f.stem: warn(rel, f"file name should match id ('{did}.json')")
    if d.get("course", f.parent.name) != f.parent.name: err(rel, f"course '{d.get('course')}' does not match folder '{f.parent.name}'")
    if f.parent.name not in course_ids and not (f.parent / ".private").exists(): warn(rel, f"course '{f.parent.name}' is not listed in content/courses.json (it will show up with its folder name)")
    if not d.get("name"): err(rel, "missing 'name'")
    if d.get("kind", "word") not in KINDS: err(rel, f"kind must be one of {sorted(KINDS)}")
    flt = d.get("filter")
    if flt is not None and (not isinstance(flt, dict) or flt.get("kind") not in FILTERS): err(rel, f"filter.kind must be one of {sorted(FILTERS)}")
    items = d.get("items")
    if not isinstance(items, list) or not items: err(rel, "'items' must be a non-empty array"); continue
    texts = set()
    for i, it in enumerate(items):
        if not isinstance(it, dict) or not isinstance(it.get("t"), str) or not it["t"].strip(): err(rel, f"items[{i}] needs a non-empty string 't'"); continue
        t = it["t"].strip().lower()
        if t in texts: warn(rel, f"items[{i}] duplicate text: {it['t'][:40]!r}")
        texts.add(t)
        if it["t"] != it["t"].strip(): warn(rel, f"items[{i}] has leading/trailing spaces")
        if "z" in it and not isinstance(it["z"], str): err(rel, f"items[{i}].z must be a string")
        if it["t"].count("(") != it["t"].count(")"): err(rel, f"items[{i}] unbalanced brackets (brackets mark optional words): {it['t'][:40]!r}")
    if len(items) > 10000: warn(rel, f"{len(items)} items — consider splitting by topic")
    if flt and flt.get("kind") == "chunk100" and any("n" not in it for it in items if isinstance(it, dict)): warn(rel, "filter chunk100 needs 'n' on every item")
    if flt and flt.get("kind") == "sublist" and any("g" not in it for it in items if isinstance(it, dict)): warn(rel, "filter sublist needs 'g' on every item")
for w in warnings: print(w)
for e in errors: print(e)
print(f"{len(seen)} decks checked · {len(errors)} errors · {len(warnings)} warnings")
sys.exit(1 if errors else 0)
