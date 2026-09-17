# Contributing

## Adding a deck to the built-in catalog
1. Put a JSON file in `content/<course>/<deck-id>.json`:
   ```json
   {"id":"my-deck","name":"My deck","course":"spoken","order":40,"kind":"sentence",
    "items":[{"t":"Can I get a receipt?","z":"能给我一张小票吗？","n":1}]}
   ```
   `t` is the only required field. Optional: `z` (translation), `ph` (phonetics), `ex`/`exz` (example + translation), `chunks` (sense groups separated by `/`), `tag`, `ref`. `kind` is `word` or `sentence`. `filter` supports `sublist` (by `g`), `pos` (by `p`), `chunk100` (by `n`).
2. New course? Add it to `content/courses.json`.
3. Run `python3 scripts/validate-content.py` (must report 0 errors), then `python3 serve.py` and check it in the browser.
4. Open a pull request. Only submit content you have the right to share (see `CONTENT-LICENSE.md`).

Two rules that protect everyone's saved progress (it is stored as `<deck id>:<item index>`):
- **Never rename a published deck `id`.**
- **Published decks are append-only** — add new items at the end; don't reorder or delete existing ones.

Using an AI assistant? Point it at [`.claude/skills/add-deck/SKILL.md`](.claude/skills/add-deck/SKILL.md).

## Code
- The page is plain HTML/CSS/JS in `public/` — no build step, no framework.
- Optional Cloudflare backend (accounts + cloud sync) lives in `src/`; `npm run typecheck` before submitting.
