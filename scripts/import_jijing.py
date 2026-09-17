#!/usr/bin/env python3
"""把 PTE 机经文本(编号 + 句子 + 意群划分 + 翻译)转成私有词库 JSON.
格式示例:
    136. 41200 RS
    The investigation aims to find the stand of the problem.
    意群划分及翻译:
    The investigation/ aims to find/ the stand of / the problem.
    调查的目的是找出问题的症结所在。
用法: import_jijing.py <文本文件...> --id rs-jijing --name "RS 机经" [--course private] [--order 1]
输出到 $DATA/decks/<course>/<id>.json; course 目录带 .private 标记时不会进入公开站点."""
import argparse, json, os, re, sys
from pathlib import Path
ap = argparse.ArgumentParser()
ap.add_argument("files", nargs="+"); ap.add_argument("--id", required=True); ap.add_argument("--name", required=True)
ap.add_argument("--course", default="private"); ap.add_argument("--order", type=int, default=0)
ap.add_argument("--data", default=str(Path(__file__).resolve().parent.parent / "content"))
a = ap.parse_args()
HEAD = re.compile(r"^(\d+)\.\s*(\d+)?\s*([A-Za-z]{2,4})?\s*$")
CJK = re.compile(r"[一-鿿]")
def parse(text):
    lines = [l.strip() for l in text.replace("﻿", "").splitlines()]
    items, i = [], 0
    while i < len(lines):
        m = HEAD.match(lines[i])
        if not m: i += 1; continue
        j = i + 1
        while j < len(lines) and not lines[j]: j += 1
        t = lines[j] if j < len(lines) else ""
        if not t or HEAD.match(t): i = j; continue
        chunks, z, k = "", "", j + 1
        while k < len(lines) and not HEAD.match(lines[k]):
            l = lines[k]
            if not l or "意群划分" in l: k += 1; continue
            if not chunks and "/" in l and re.search(r"[A-Za-z]", l):
                cm = re.match(r"^(.*?[.!?'\"”)]?)\s*([一-鿿].*)?$", l)
                chunks = (cm.group(1) if cm else l).strip()
                if cm and cm.group(2): z = cm.group(2).strip()
            elif CJK.search(l): z = (z + " " + l).strip() if z else l
            k += 1
        it = {"t": t, "z": z, "n": len(items) + 1}
        if chunks: it["chunks"] = chunks
        if m.group(3): it["tag"] = m.group(3).upper()
        if m.group(2): it["ref"] = m.group(2)
        items.append(it); i = k
    return items
items = []
for f in a.files: items += parse(Path(f).read_text(encoding="utf-8"))
for n, it in enumerate(items, 1): it["n"] = n
out = Path(a.data) / a.course; out.mkdir(parents=True, exist_ok=True)
if a.course == "private": (out / ".private").touch()
p = out / f"{a.id}.json"
if p.exists(): p.rename(p.with_suffix(".json.bak"))
p.write_text(json.dumps({"id": a.id, "name": a.name, "course": a.course, "order": a.order, "kind": "sentence", "items": items}, ensure_ascii=False, indent=0), encoding="utf-8")
print(f"{p}: {len(items)} 条; 无翻译 {sum(1 for x in items if not x['z'])} 条, 无意群 {sum(1 for x in items if 'chunks' not in x)} 条")
