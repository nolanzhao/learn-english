# Content licenses

The code in this repository is MIT-licensed (see `LICENSE`). The learning content under `content/` has its own terms:

| Deck | Source | Terms |
|---|---|---|
| `pte/awl.json` — Academic Word List (570 word families) | Averil Coxhead, Victoria University of Wellington | Free for educational use; cite the AWL |
| `pte/acl.json` — Academic Collocation List (2,469 entries) | Ackermann & Chen (2013), Pearson | Publicly released list; cite the ACL |
| `spoken/*.json` — 780 everyday American English sentences | Written for this project | CC BY 4.0 |

Chinese glosses on the AWL/ACL entries were added for this project and are CC BY 4.0.

| `ielts/ielts.json`, `toefl/toefl.json`, `gre/gre.json` — exam core vocabulary | Converted from the word books distributed with Youdao Dictionary (index: [kajweb/dict](https://github.com/kajweb/dict)) using `scripts/import_youdao.py` | Word selection, glosses and example sentences belong to their original publishers; included for personal study only, not covered by the MIT or CC licenses |
| `pte/wfd.json` — PTE Write-From-Dictation high-frequency words | Community-compiled list | Same as above |

If you are a rights holder and want any of this material removed, open an issue and it will be taken down.

PTE 机经 question banks and similar paid materials are not included. Use `scripts/import_jijing.py` to convert your own copy locally, or import it in the browser (Settings → 导入词库) — imported decks stay in your browser and are never uploaded.
