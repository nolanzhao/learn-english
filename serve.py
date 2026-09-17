#!/usr/bin/env python3
"""Zero-dependency local server (Python 3.8+ standard library only).

    python3 serve.py            # http://127.0.0.1:8766

Builds public/content/ from ./content (courses.json + <course>/<deck>.json), serves ./public,
and answers the two API calls the page makes so it runs in guest mode (progress stays in the browser).
Course folders containing a `.private` file are still served locally but never enter a public build.
"""
import argparse, hashlib, json, os, shutil, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"


def build_content(src: Path, include_private: bool):
    out = PUBLIC / "content"
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True)
    courses = []
    if (src / "courses.json").exists():
        try: courses = json.loads((src / "courses.json").read_text("utf-8"))
        except Exception as e: print(f"[skip] courses.json: {e}", file=sys.stderr)
    known = {c["id"] for c in courses}
    decks, seen = [], set()
    for d in sorted(p for p in src.iterdir() if p.is_dir()):
        if (d / ".private").exists() and not include_private:
            print(f"skip private course: {d.name}"); continue
        if d.name not in known: courses.append({"id": d.name, "name": d.name, "order": 999}); known.add(d.name)
        for f in sorted(d.glob("*.json")):
            try: deck = json.loads(f.read_text("utf-8"))
            except Exception as e: print(f"[skip] {d.name}/{f.name}: {e}", file=sys.stderr); continue
            deck.setdefault("id", f.stem); deck.setdefault("course", d.name)
            if deck["id"] in seen: print(f"[skip] duplicate id {deck['id']} ({d.name}/{f.name})"); continue
            seen.add(deck["id"])
            items = deck.get("items") or []
            body = json.dumps({"id": deck["id"], "items": items}, ensure_ascii=False)
            h = hashlib.sha1(body.encode("utf-8")).hexdigest()[:8]
            (out / deck["course"]).mkdir(exist_ok=True)
            (out / deck["course"] / f"{deck['id']}.json").write_text(body, "utf-8")
            decks.append({"id": deck["id"], "course": deck["course"], "name": deck.get("name", deck["id"]), "order": deck.get("order", 999),
                          "kind": deck.get("kind", "word"), "filter": deck.get("filter"), "count": len(items), "v": h,
                          "url": f"/content/{deck['course']}/{deck['id']}.json?v={h}"})
    courses = [c for c in courses if any(x["course"] == c["id"] for x in decks)]
    courses.sort(key=lambda c: (c.get("order", 999), c["id"]))
    decks.sort(key=lambda x: (x["course"], x["order"], x["id"]))
    (out / "catalog.json").write_text(json.dumps({"courses": courses, "decks": decks}, ensure_ascii=False), "utf-8")
    print(f"catalog: {len(courses)} courses, {len(decks)} decks, {sum(x['count'] for x in decks)} items")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=str(PUBLIC), **kw)
    def log_message(self, fmt, *args):
        if not str(args[0]).startswith(("GET /content/", "GET /api/")): super().log_message(fmt, *args)
    def _json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache"); super().end_headers()
    def do_GET(self):
        if self.path.startswith("/api/me"): return self._json({"user": None})
        if self.path.startswith("/api/auth-config"): return self._json({"providers": [], "email": False, "appName": "Learn English"})
        if self.path.startswith("/api/"): return self._json({"error": "not available in local mode"}, 404)
        if self.path == "/": self.path = "/index.html"
        return super().do_GET()
    def do_PUT(self): self._json({"error": "not available in local mode"}, 404)
    def do_POST(self): self._json({"error": "not available in local mode"}, 404)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8766)
    ap.add_argument("--content", default=str(ROOT / "content"), help="deck source folder (default ./content)")
    ap.add_argument("--no-build", action="store_true", help="serve existing public/content without rebuilding")
    a = ap.parse_args()
    if not a.no_build: build_content(Path(a.content).expanduser(), include_private=True)
    print(f"→ http://127.0.0.1:{a.port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()
