#!/usr/bin/env node
/* Pack decks into static content for the site:
   public/content/catalog.json (courses + deck metadata, no items) and public/content/<course>/<deck>.json (items).
   Usage: node scripts/build-content.mjs [source dir]   default: ./content (expects courses.json + <course>/<deck>.json)
   A course folder containing a `.private` file is skipped, so copyrighted material never reaches the public build. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
const src = process.argv[2] || new URL("../content/", import.meta.url).pathname;
const out = new URL("../public/content/", import.meta.url).pathname;
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
let courses = []; try { courses = JSON.parse(readFileSync(join(src, "courses.json"), "utf8")); } catch {}
const known = new Set(courses.map(c => c.id)); const decks = []; const seen = new Set();
for (const dir of readdirSync(src)) {
  const p = join(src, dir); if (!statSync(p).isDirectory()) continue;
  if (existsSync(join(p, ".private"))) { console.log(`skip private course: ${dir}`); continue; }   // 私有资料不进公开站点
  if (!known.add(dir) && !courses.some(c => c.id === dir)) courses.push({ id: dir, name: dir, order: 999 });
  for (const f of readdirSync(p).filter(f => f.endsWith(".json"))) {
    const d = JSON.parse(readFileSync(join(p, f), "utf8")); d.id ||= basename(f, ".json"); d.course ||= dir;
    if (seen.has(d.id)) { console.warn(`skip duplicate id ${d.id} (${dir}/${f})`); continue; } seen.add(d.id);
    const items = d.items || []; const body = JSON.stringify({ id: d.id, items });
    const hash = createHash("sha1").update(body).digest("hex").slice(0, 8);
    mkdirSync(join(out, d.course), { recursive: true }); writeFileSync(join(out, d.course, `${d.id}.json`), body);
    decks.push({ id: d.id, course: d.course, name: d.name || d.id, order: d.order ?? 999, kind: d.kind || "word", filter: d.filter || null, count: items.length, v: hash, url: `/content/${d.course}/${d.id}.json?v=${hash}` });
  }
}
courses = courses.filter(c => decks.some(d => d.course === c.id));   // 没有词库的课程(如私有课程)不进目录
courses.sort((a, b) => (a.order ?? 999) - (b.order ?? 999)); decks.sort((a, b) => a.course.localeCompare(b.course) || a.order - b.order);
writeFileSync(join(out, "catalog.json"), JSON.stringify({ courses, decks, builtAt: new Date().toISOString() }));
console.log(`catalog: ${courses.length} courses, ${decks.length} decks, ${decks.reduce((s, d) => s + d.count, 0)} items → ${out}`);
