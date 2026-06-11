# IELTS Vocab Gym

**A vanilla JS single-page vocabulary trainer** — dictation, multiple choice, hard mode letter-by-letter. No build step, no server, no frameworks. Open `index.html` and start.

## Features

### Practice Modes
- **Dictation (Standard)** — Hear a word, type the spelling, press Enter. Instant green/red feedback ring with full word card reveal.
- **Dictation (Hard)** — Letter-by-letter slot grid. One wrong letter = auto-flagged. Responsive slot sizing for short/medium/long words.
- **Multiple Choice** — Two sub-modes: *Listen & Pick Meaning* (audio button → 4 definitions) or *See Word & Pick Meaning* (target word → 4 definitions). Distractors via POS-matched Levenshtein similarity.

### Dictionary & Enrichment
- **103,975 words** — English-Chinese with UK+US IPA phonetics, COCA frequency ranks, ranked search.
- **52,801 words with ECDICT enrichment**:
  - **Exam tags** — IELTS, TOEFL, GRE, CET-4/6, GaoKao, ZhongKao, KaoYan (11,871 tagged, 4,170 IELTS)
  - **Collins star rating** — 1–5 importance scale (10,400 words)
  - **Oxford 3000** — Essential word badge (2,747 words)
  - **English WordNet definitions** — POS-highlighted formatting (46,130 words)
  - **BNC frequency ranks** + **POS distribution percentages**
- **Word forms** — 50,401 inflected forms + 67,007 lemma map entries
- **Root decomposition** — 30,728 prefix/root/suffix breakdowns from MorphoLex (peer-reviewed morphological database), 6,627 morphemes with 76% meaning coverage
- **Synonyms & Antonyms** — 158,893 synonym pairs + 5,255 antonym pairs across 39,209 words, from WordNet 3.0 + ECDICT
- **141,714 bilingual example sentences** — Playable via F2

### SM-2 Spaced Repetition
- **4-level proficiency lifecycle**: `unlearned → learning → reviewing → mastered`
- **SM-2 algorithm** — Quality grading per mode (0–5), interval × easeFactor, nextReview scheduling. EF updates only when quality ≥ 3 (correct SM-2 spec).
- **SRS review queue** — Mix SRS due words with filter words via ratio slider (0–100%)
- **Dashboard panel** — Due today, due this week, total in rotation, average retention
- **Automatic SRS data boost** — Session-derived proficiency increases SRS data without locking `manualProficiency`
- **Re-review loop** — SM-2 quality=4 items re-presented for reinforcement (max 2 rounds)

### Session System
- **Configurable queue** — Filter by proficiency (All / Unlearned / Learning+Reviewing / Low Accuracy), set session size, order (sequential / shuffled), per-word timer
- **Navigation** — Prev/Next through answer history with full state restoration, jump-to-current word
- **Layout toggle** — Vertical / Horizontal-right / Horizontal-left for dictation card + word card side-by-side
- **Streak tracking** — Live correct streak counter with max-streak recording
- **In-session proficiency cycling** — Backtick (`) toggles: system → learning → reviewing → mastered → system…
- **Manual override reset** — Reset button on proficiency badge to clear per-word manual label

### Progress & Profiles
- **IndexedDB persistence** — `VocabGymDB` v1: profiles, wordProgress, lists, settings, srsData stores
- **Multiple profiles** — Create, rename, switch, delete, merge. Each profile has fully isolated progress
- **Merge profiles** — Best-stats merge (mastered > reviewing > learning > unlearned; higher EF×reps wins for SRS)
- **Import/Export** — v3.0 compressed format with run-length encoded SRS data. Base64-encoded sharing
- **Automatic localStorage migration** — One-time migration on first launch, preserves old data read-only

### UI
- **Dark theme** — Zinc palette with teal (`#14b8a6`) accents. Responsive, keyboard-driven
- **Dictionary search** — 4-strategy ranked: prefix → contains → fuzzy (Levenshtein ≤ 2) → Chinese definition. `Ctrl+K` shortcut
- **Word card overlay** — Exam badges (color-coded), Collins stars, Oxford 3000, root decomposition with mnemonics, word forms, similar words, synonyms (emerald pills), antonyms (rose pills), example sentences (click to speak)
- **Vocabulary ledger** — Sortable/filterable table with status, accuracy, attempt counts, manual proficiency override
- **Dashboard stats** — SVG mastery ring, 4-bar proficiency breakdown, SRS panel, book card grid
- **Profile switcher** — Header dropdown + manage modal (rename, delete, export, merge)
- **TTS settings** — Youdao dictvoice (UK/US) or Web Speech API with voice, rate, and accent selection

## Quick Start

1. Clone the repo
2. Open `index.html` in any modern browser

No `npm install`, no build tools, no server. Dependencies load from CDN (Tailwind CSS Play CDN, SheetJS for Excel import).

## Usage

### First Launch
The **IELTS vocabulary book** (5,382 words) is auto-imported and selected. Click **Start Session** to begin.

### Practice Flow
1. Select mode (Dictation or Multiple Choice) and sub-mode on the dashboard
2. Configure queue filter, session size, order, timer, and SRS ratio
3. Click **Start Session**
4. Answer each word — instant feedback with full word card reveal, proficiency badge update
5. Navigate with Prev/Next or press Enter to advance
6. After the session, review the results breakdown with before/after proficiency labels
7. Return to dashboard — all stats and SRS data are updated

### Keyboard Shortcuts

| Key | Context | Action |
|-----|---------|--------|
| `Enter` | Session | Submit answer / advance to next word |
| `Backspace` | Hard mode | Erase last letter |
| `` ` `` | Session | Cycle proficiency (system → learning → reviewing → mastered) |
| `Ctrl + Space` | Session | Replay word audio |
| `F2` | Dictation | Play example sentence |
| `1-4` | Multiple Choice | Select option 1–4 |
| `Ctrl + K` | Dashboard | Focus dictionary search |
| `Escape` | Any | Close modal / overlay |
| `←` / `→` | Reviewing | Go to previous / next answered word |

## Data Pipeline

### Source Datasets
| Source | Used For |
|--------|----------|
| [english-vocabulary-master](https://github.com/zhenghaoyang24/english-vocab) | 103K words, phonetics, Chinese definitions, COCA frequency |
| ECDICT ([skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)) | Exam tags, Collins/Oxford, English definitions, POS %, word forms, root/affix definitions, synonym groups |
| [Morphemes JSON](https://github.com/colingoldberg/morphemes) | Morpheme forms, meanings, origins (2,435 groups) |
| [MorphoLex-en](https://github.com/hugomailhot/MorphoLex-en) | Peer-reviewed word decompositions (62,471 words) |
| [WordNet 3.0](https://wordnet.princeton.edu/) | Synonym synsets + antonym pairs |
| `tb_voc_examples.json` | 141K bilingual example sentences |
| `tb_voc_book.json` | Pre-built word books |

### Build Scripts

```bash
# Regenerate dictionary, sentences, and IELTS book from english-vocabulary-master
node scripts/generate-dictionary.js

# Extract enrichment data from ECDICT SQLite → tmp-ecdict/ecdict-matched.json
python scripts/build/extract_ecdict.py

# Build enriched exchange-data.js (word forms, tags, collins, oxford, definitions, POS)
node scripts/build/build-ecdict-exchange.js

# Build root decomposition data (MorphoLex + unified dictionary → root-data.js + root-word-data.js)
node scripts/build/build-roots.js

# Build synonym/antonym data (WordNet + ECDICT → synonym-antonym-data.js)
node scripts/build/build-synonyms.js
```

## Architecture

```
IIFE modules under window.VocabGym namespace
  │
  ├─ Data (read-only globals)
  │   DICTIONARY_DATA  SENTENCE_DATA  EXCHANGE_DATA  ROOT_DATA  ROOT_DECOMPOSITIONS  SYNONYM_ANTONYM_DATA
  │
  ├─ Persistence (db.js)
  │   IndexedDB → in-memory caches (_progressCache, _srsCache, _listCache)
  │   sync reads from cache, async writes to DB (fire-and-forget or awaited)
  │
  ├─ State (core.js)
  │   centralDictionary (search, lookup, enrichment, synonyms/antonyms)
  │   state (progress CRUD, proficiency derivation, list management)
  │
  ├─ Session (session-core.js)
  │   Mode-agnostic framework: queue building, lifecycle, navigation, proficiency tracking
  │   Mode registration + delegation (initModeUI, activateWord, handleKeydown, revealAnswer)
  │   Session-scoped proficiency: _sessionSystemProf / _sessionDerivedProf / _sessionManualProf
  │
  ├─ Modes (ui-dictation.js, ui-multiple-choice.js)
  │   Registered handlers: dictation (standard + hard), multipleChoice (audio + definition)
  │
  ├─ UI (ui-dashboard, ui-wordcard, ui-search, ui-ledger, ui-profiles)
  │   Dashboard stats, word card overlay (with synonyms/antonyms), dictionary search, ledger table, profile management
  │
  └─ Services (srs.js, speech.js, share.js, sw-register.js)
      SM-2 engine, TTS (Web Speech + Youdao), import/export, PWA
```

## File Structure

```
IELTS Vocab Gym/
├── index.html                   # Main SPA shell
├── app.css                      # Custom styles (glass cards, animations, dark scrollbars)
├── README.md
├── relay.md                     # AI-facing architecture documentation
├── manifest.json                # PWA manifest
├── sw.js                        # Service worker (cache-first + network-first)
├── tmp-ecdict/
│   ├── stardict.db              # 812MB — ECDICT SQLite (3.4M rows)
│   └── ecdict-matched.json      # 13MB — Extracted enrichment data
├── tmp-roots/
│   ├── unified-roots.json       # 974KB — 3,976 morpheme entries with meanings
│   ├── morpholex-decomp.json    # MorphoLex decompositions (62K words)
│   ├── en_thesaurus.jsonl       # 117K WordNet synonym entries
│   └── antonym-wordnet.json     # 6.6K WordNet antonym entries
├── js/
│   ├── dictionary.js            # 15MB — 103,975 words
│   ├── sentences.js             # 20MB — 141,714 bilingual examples
│   ├── exchange-data.js         # 11MB — Word forms, tags, collins/oxford, definitions
│   ├── root-data.js             # 356KB — 6,627 prefix/root/suffix definitions (76% with meanings)
│   ├── root-word-data.js        # 5.8MB — 30,728 MorphoLex decompositions
│   ├── synonym-antonym-data.js  # 9.3MB — 39,209 words with synonyms + antonyms
│   ├── ielts-vocab-data.js      # 32KB — Built-in IELTS word book
│   ├── dictionary_mini.json     # 194KB — Compact word-ID mapping
│   ├── vocab-gym.js             # Bootstrap, mode selection, keyboard routing
│   ├── core.js                  # centralDictionary, state, enrichment, SFX
│   ├── db.js                    # IndexedDB wrapper, caches, migration
│   ├── session-core.js          # Session framework: lifecycle, nav, proficiency
│   ├── srs.js                   # SM-2 algorithm, grading, SRS dashboard panel
│   ├── speech.js                # Web Speech + Youdao dictvoice TTS
│   ├── ui-dashboard.js          # Dashboard, book cards, file upload, stats
│   ├── ui-dictation.js          # Dictation mode handler
│   ├── ui-multiple-choice.js    # Multiple choice mode handler
│   ├── ui-wordcard.js           # Full word card with enrichment + synonyms/antonyms
│   ├── ui-search.js             # Dictionary lookup dropdown
│   ├── ui-ledger.js             # Sortable vocabulary ledger
│   ├── ui-profiles.js           # Profile management UI
│   ├── share.js                 # Progress import/export v3.0
│   └── sw-register.js           # Service worker registration
├── scripts/
│   ├── generate-dictionary.js   # Main dictionary generation pipeline
│   ├── token-stats.js           # Claude conversation token usage extractor
│   └── build/
│       ├── extract_ecdict.py    # ECDICT SQLite → JSON extraction
│       ├── build-ecdict-exchange.js  # JSON → exchange-data.js enrichment
│       ├── build-roots.js       # MorphoLex + unified dict → root data
│       └── build-synonyms.js    # WordNet + ECDICT → synonym/antonym data
├── books/                       # Source Excel vocabulary books
├── icons/                       # PWA icons (192px, 512px)
└── data/                        # Legacy data sources
```

## Browser Support

Chrome, Edge, Firefox, Safari — any modern browser with Web Speech API. PWA features require HTTPS or localhost.

## License

MIT. Dictionary data from [english-vocabulary-master](https://github.com/zhenghaoyang24/english-vocab). ECDICT data from [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT). Morpheme data from [colingoldberg/morphemes](https://github.com/colingoldberg/morphemes). MorphoLex from [hugomailhot/MorphoLex-en](https://github.com/hugomailhot/MorphoLex-en). WordNet 3.0 from Princeton University. Wiktionary content is [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
