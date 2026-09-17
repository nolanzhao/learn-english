# Learn English — type it, spell it, hear it

**Live: https://learn-english.nolanzhao.workers.dev**

A keyboard-first English trainer. Every item (a word, a collocation, a sentence) can be practised three ways:

| Mode | What you do |
|---|---|
| 看题打字 Type | The text is shown in light grey; type it letter by letter, mistakes turn red |
| 看中文拼写 Spell | Only the Chinese meaning (and phonetics) is shown; spell the English |
| 听写 Dictation | Hear it, type it |

Progress (mastered / weak / streaks, favourites, daily counts, where you stopped) is kept per item and you resume exactly where you left off. Unpractised items come first; optional words in brackets, e.g. `encourage (the) development (of)`, are accepted either way.

Built-in content: PTE (AWL word families, ACL collocations, WFD high-frequency words), IELTS / TOEFL / GRE core vocabulary with phonetics and example sentences, and 780 everyday American English sentences in 39 scenes. See `CONTENT-LICENSE.md` for sources.

## Run it locally (no dependencies)
```bash
git clone https://github.com/nolanzhao/learn-english
cd learn-english
python3 serve.py          # http://127.0.0.1:8766
```
Python 3.8+ standard library only. Progress stays in your browser.

## Add your own decks — let an AI assistant do it
Open this repo in Claude Code, Cursor, Codex or any coding assistant and say what you have:

> 把 ~/Downloads/words.txt 做成一个词库，放到雅思课程里
> Turn this CSV of words and meanings into a deck · Write 20 sentences about renting an apartment

The assistant follows **[`.claude/skills/add-deck/SKILL.md`](.claude/skills/add-deck/SKILL.md)** — deck format, where files go, converters for common sources, and a validator to check the result. Claude Code picks the skill up automatically; for other tools, tell them to read that file first.

Doing it by hand? See [`CONTRIBUTING.md`](CONTRIBUTING.md). Copyrighted or personal material belongs in `content/private/` (git-ignored, never published).

## Shortcuts
Enter submit · Esc skip · Tab / ⌘S favourite · ⌘← ⌘→ previous / next item · ⌘B sidebar · ⌘. focus mode

## Optional: accounts and cloud sync
The same front-end can run on a Cloudflare Worker with D1 for email (magic link + code) / Google / Microsoft / GitHub login and cross-device progress sync. Login only appears when a method is configured. See `docs/DEPLOY.md`.

## Stack
Plain HTML/CSS/JS, no framework, no build step for the page. Backend (optional): Hono + Better Auth + Drizzle on Cloudflare Workers/D1.

## License
Code: MIT. Content: see `CONTENT-LICENSE.md`.
