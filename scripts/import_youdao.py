#!/usr/bin/env python3
"""把有道词典离线词书(kajweb/dict 的 JSONL, 一行一词)转成本 skill 的词库 JSON.
用法: import_youdao.py <book.json> --id ielts --name "雅思核心词汇" --course ielts --order 1 [--out <decks dir>]
字段: t 单词, z 释义(词性. 中文；...), ph 美音(无则英音), ex/exz 例句及翻译, n 序号(按 100 分段)."""
import argparse, json, os, sys
from pathlib import Path
ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("--id", required=True); ap.add_argument("--name", required=True)
ap.add_argument("--course", required=True); ap.add_argument("--order", type=int, default=0)
ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "content"))
a = ap.parse_args()
items, seen = [], set()
for line in open(a.src, encoding="utf-8"):
    line = line.strip()
    if not line: continue
    try: w = json.loads(line)
    except Exception: continue
    head = (w.get("headWord") or "").strip()
    if not head or head.lower() in seen: continue
    c = w.get("content", {}).get("word", {}).get("content", {})
    trans = c.get("trans") or []
    z = "；".join(f"{t.get('pos')+'. ' if t.get('pos') else ''}{(t.get('tranCn') or '').strip()}" for t in trans if t.get("tranCn"))
    it = {"t": head, "z": z, "n": len(items) + 1}
    ph = c.get("usphone") or c.get("ukphone")
    if ph: it["ph"] = ph
    ss = (c.get("sentence") or {}).get("sentences") or []
    if ss and ss[0].get("sContent"):
        it["ex"] = ss[0]["sContent"].strip(); it["exz"] = (ss[0].get("sCn") or "").strip()
    seen.add(head.lower()); items.append(it)
out = Path(a.out) / a.course; out.mkdir(parents=True, exist_ok=True)
deck = {"id": a.id, "name": a.name, "course": a.course, "order": a.order, "filter": {"name": "分段", "kind": "chunk100"}, "items": items}
p = out / f"{a.id}.json"
if p.exists(): p.rename(p.with_suffix(".json.bak"))
p.write_text(json.dumps(deck, ensure_ascii=False), encoding="utf-8")
print(f"{p}: {len(items)} 条")
