---
name: add-deck
description: Add a word list or sentence deck to this Learn English project from whatever the user has — a file (txt / csv / tsv / json word list / Youdao word book / PTE 机经 text), pasted text, or a topic to write sentences for. Use when the user says things like "add a deck", "把这个文件做成词库", "加一个词库 / 课程", "导入这批单词 / 句子", "generate sentences about X for practice".
---

# Add a deck

You are working inside the Learn English repo. A *deck* is one JSON file; the app picks it up automatically — no code changes are needed to add content.

## 1. Find out three things (ask only what you cannot infer)
- **Source**: a file path, pasted text, a URL, or "write N sentences about <topic>".
- **Words or sentences?** → `kind: "word"` or `"sentence"`.
- **Public or private?** If the material is copyrighted, paid, or personal (exam 机经, textbook lists, class notes), it is **private**: put it in `content/private/` (git-ignored, and `.private` keeps it out of public builds). Only material the user may redistribute goes in a public course folder.

## 2. Where it goes
```
content/<course-id>/<deck-id>.json        one deck per file
content/courses.json                      [{ "id", "name", "desc", "order" }] — add a row for a new course
content/private/.private                  marker file; create it if you create content/private/
```
Existing public courses: `pte`, `ielts`, `toefl`, `gre`, `spoken`. Prefer adding to an existing course; create a new one only if nothing fits.

## 3. Deck format
```json
{
  "id": "sp-library",
  "name": "图书馆",
  "course": "spoken",
  "order": 40,
  "kind": "sentence",
  "items": [
    { "t": "Can I renew this book online?", "z": "这本书可以在网上续借吗？", "n": 1 },
    { "t": "Is there a quiet study room I can book?", "z": "有可以预约的安静自习室吗？", "n": 2 }
  ]
}
```
| Field | Rule |
|---|---|
| `id` | Required. Lowercase letters, digits, hyphens. **Unique across the whole repo** and equal to the file name. It is the key of users' saved progress — never rename a published id. |
| `name` | Label shown on the tab (Chinese is fine). |
| `course` | Must equal the folder name. |
| `order` | Position inside the course; use max existing + 1. |
| `kind` | `word` or `sentence`. |
| `filter` | Optional grouping: `{"name":"分段","kind":"chunk100"}` (needs `n`), `{"name":"分表","kind":"sublist"}` (needs `g`), `{"name":"词性","kind":"pos"}` (needs `p`: adj+n, v+n, adv+adj, adv+vpp, n+n). Use `chunk100` for decks over ~200 items. |
| `items[].t` | Required. The exact English text to type. Words in brackets are optional when typing: `encourage (the) development (of)`. |
| `items[].z` | Chinese meaning / translation. Translate it yourself if the source has none. |
| `items[].n` | 1-based running number. |
| `items[].ph` | Phonetics, only if the source provides them — do not invent IPA. |
| `items[].ex`, `exz` | Example sentence and its translation (shown after answering). |
| `items[].chunks` | Sense groups separated by ` / ` (used by the listen-and-read mode). |
| `items[].tag`, `ref` | Short label and source number, e.g. `"RS"`, `"41200"`. |

**Append-only rule:** progress is stored by item index. In a published deck, add new items at the end; do not reorder or delete existing ones.

## 4. Converting common sources
- **Two-column text / CSV / TSV** (`word<TAB>meaning`): first column → `t`, rest → `z`.
- **JSON word list** (`[{"name","trans":[...],"usphone","ukphone"}]`): `name`→`t`, `trans` joined with `；`→`z`, `usphone` (fallback `ukphone`)→`ph`.
- **Youdao word book JSONL** (from kajweb/dict): `python3 scripts/import_youdao.py <book.json> --id <id> --name "<name>" --course <course>`
- **PTE 机经 text** (number line, sentence, `意群划分及翻译:`, chunk line, translation): `python3 scripts/import_jijing.py <file.txt> --id <id> --name "<name>"` — writes to `content/private/` by default.
- **Anything else** (PDF text, notes, a web page): extract the items yourself, clean them (trim, de-duplicate, fix obvious OCR errors, keep original spelling variants), then write the JSON directly.
- **Writing new sentences on request**: natural, current, everyday usage; 8–18 words; one idea per sentence; 20 per deck is a good size; give each a faithful Chinese translation. Do not copy sentences from copyrighted books.

Write the file as UTF-8, `ensure_ascii=false`, one item per line is fine.

## 5. Check your work — always
```bash
python3 scripts/validate-content.py            # must end with "0 errors"
python3 serve.py                               # http://127.0.0.1:8766 → open the course, confirm the deck shows and one item can be typed
```
Fix every ERROR the validator prints. Warnings are advisory.

## 6. If the user wants to contribute it upstream
- Public material only. Add a row to the table in `CONTENT-LICENSE.md` (deck, source, terms).
- Commit the deck (+ `courses.json` / `CONTENT-LICENSE.md` if changed) and open a pull request. Never commit anything under `content/private/`.

## Report back
Tell the user: file path, course, number of items, anything you had to guess (translations you wrote, items you dropped as duplicates or unreadable), and how to open it in the app.
