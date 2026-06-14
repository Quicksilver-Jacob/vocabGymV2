# IELTS Vocab Gym

**A vanilla JS single-page vocabulary trainer** — mixed-mode question-type system, dictation, multiple choice, collocation, synonyms, antonyms, derivational forms. No build step, no server, no frameworks. Open `index.html` and start.

Online: https://quicksilver-jacob.github.io/vocabGymV2/

## Features

### Mixed Mode — Universal Question-Type System

Dictation and Multiple Choice are now just **weight presets** of the unified Mixed Mode. Each word is tested via a randomly selected question type, weighted by user configuration.

**9 question types:**

| # | Type | Prompt |
|---|------|--------|
| 1 | Listen & Spell | Hear audio → type the word |
| 2 | Pick Meaning (audio) | Hear audio → choose definition from 4 options |
| 3 | Pick Meaning (visual) | See target word → choose definition from 4 options |
| 4 | Collocation | Gap-fill: choose correct collocate from 4 options |
| 5 | Phonetic Spelling | See IPA transcription → type the word |
| 6 | Synonym | See target word → choose synonym from 4 options |
| 7 | Antonym | See target word → choose antonym from 4 options |
| 8 | Derivational Form | Word family gap-fill: "base → derived" from 4 options |
| 9 | — | _(placeholder)_ |

**Three presets accessible from dashboard buttons:**
- **Dictation** → `spelling` weight 10, all others 0 (every word is Listen & Spell)
- **MC** → `mc_audio` + `mc_visual` weights 5 each (50/50 mix of audio and visual meaning selection)
- **Mix** → User-configured weight panel — toggle types and adjust weight sliders (1–10)

Weights persist in localStorage. Types that lack data for a word (e.g. no collocations available) are automatically skipped. Consecutive same-type repetition is avoided when multiple candidates exist.

### Keyboard Customization

Fully rebindable keyboard shortcuts via a visual keyboard modal. Click any key or "Customize" button to remap. Conflict detection with amber warnings. Reset individual bindings or all at once. Persisted per-profile in IndexedDB.

### Stats View

Daily and weekly learning analytics tab (alongside the vocabulary ledger):
- Bar chart — daily word count × accuracy color-coding (emerald/amber/rose), 7-day and 30-day views
- Weekly heatmap — per-day green intensity bars with accuracy breakdowns
- Daily goal — configurable target (1–500 words) with preset buttons and completion percentage
- Streak tracking — consecutive active days

### Collocation Data

23,194 collocation clusters across verb+noun, adj+noun, adv+verb, and phrasal verb patterns. Example sentences with neon purple collocation highlighting. Click a collocation chip to see the full example sentence in a floating popup.

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
- **Derivational Forms** — 39,698 derivational pairs across 48,512 words from MorphyNet (Wiktionary-derived, 98% precision), showing word-family relationships
- **Collocations** — 23,194 collocation clusters (verb+noun, adj+noun, adv+verb, phrasal verbs)
- **141,714 bilingual example sentences** — Playable via F2

### SM-2 Spaced Repetition

- **4-level proficiency lifecycle**: `unlearned → learning → reviewing → mastered`
- **SM-2 algorithm** — Quality grading per mode (0–5), interval × easeFactor, nextReview scheduling. EF updates only when quality ≥ 3 (correct SM-2 spec).
- **SRS review queue** — Mix SRS due words with filter words via ratio slider (0–100%)
- **Dashboard panel** — Due today, due this week, total in rotation, average retention
- **Session buffer isolation** — All mid-session mutations go to a delta map, committed in batch at session end. No IndexedDB writes during the session.

### Session System

- **Configurable queue** — Filter by proficiency (All / Unlearned / Learning+Reviewing / Low Accuracy), set session size, order (sequential / shuffled), per-word timer
- **Navigation** — Prev/Next through answer history with full state restoration, jump-to-current word
- **Layout toggle** — Vertical / Horizontal-right / Horizontal-left for session card + word card side-by-side
- **Streak tracking** — Live correct streak counter with max-streak recording
- **In-session proficiency cycling** — Backtick (`) toggles: system → learning → reviewing → mastered → system…
- **Neon glow effects** — Correct/Incorrect feedback badges with emerald/rose glow, continue button with teal glow, collocation highlights with purple glow

### Progress & Profiles

- **IndexedDB persistence** — `VocabGymDB` v1: profiles, wordProgress, lists, settings, srsData, dailyStats stores
- **Multiple profiles** — Create, rename, switch, delete, merge. Each profile has fully isolated progress
- **Merge profiles** — Best-stats merge (mastered > reviewing > learning > unlearned; higher EF×reps wins for SRS)
- **Import/Export** — v3.0 compressed format with run-length encoded SRS data. Base64-encoded sharing
- **Automatic localStorage migration** — One-time migration on first launch, preserves old data read-only

### UI

- **Dark theme** — Zinc palette with teal (`#14b8a6`) accents. Responsive, keyboard-driven
- **Dictionary search** — 4-strategy ranked search. `Ctrl+K` shortcut
- **Word card overlay** — Exam badges (color-coded), Collins stars, Oxford 3000, root decomposition with mnemonics, word forms, derivational forms (violet/sky pills), similar words, synonyms (emerald pills), antonyms (rose pills), collocations with example popups, example sentences (click to speak)
- **Vocabulary ledger** — Sortable/filterable table with status, accuracy, attempt counts, manual proficiency override
- **Dashboard stats** — SVG mastery ring, 4-bar proficiency breakdown, SRS panel, book card grid
- **Profile switcher** — Header dropdown + manage modal (rename, delete, export, merge)
- **TTS settings** — Youdao dictvoice (UK/US) or Web Speech API with voice, rate, and accent selection
- **Keyboard modal** — Visual keyboard layout with color-coded binding groups, click-to-rebind, conflict warnings

## Quick Start

1. Clone the repo
2. Open `index.html` in any modern browser

No `npm install`, no build tools, no server. Dependencies load from CDN (Tailwind CSS Play CDN, SheetJS for Excel import).

## Usage

### First Launch
The **IELTS vocabulary book** (5,382 words) is auto-imported and selected. Click **Start Session** to begin.

### Practice Flow
1. Select mode — Dictation, MC, or Mix — on the dashboard
2. For Mix mode, configure question type weights (toggle types, adjust sliders 1–10)
3. Configure queue filter, session size, order, timer, and SRS ratio
4. Click **Start Session**
5. Each word appears with a randomly selected question type based on weights
6. Answer — instant feedback with neon badge, full word card reveal, proficiency badge update
7. Navigate with Prev/Next or press Enter to advance
8. After the session, review the results breakdown with before/after proficiency labels
9. Return to dashboard — all stats and SRS data are updated

### Keyboard Shortcuts

| Key | Context | Action |
|-----|---------|--------|
| `Enter` | Session | Submit answer / advance to next word |
| `Backspace` | Hard mode | Erase last letter |
| `` ` `` | Session | Cycle proficiency (system → learning → reviewing → mastered) |
| `Ctrl + Space` | Session | Replay word audio |
| `F2` | Dictation | Play example sentence |
| `1-4` | Multiple Choice / Mixed | Select option 1–4 |
| `Ctrl + K` | Dashboard | Focus dictionary search |
| `Escape` | Any | Close modal / overlay |
| `←` / `→` | Reviewing | Go to previous / next answered word |

All shortcuts are rebindable via the Keyboard modal (access from dashboard).

## Architecture

```
IIFE modules under window.VocabGym namespace
  │
  ├─ Data (read-only globals)
  │   DICTIONARY_DATA  SENTENCE_DATA  EXCHANGE_DATA  ROOT_DATA  ROOT_DECOMPOSITIONS
  │   SYNONYM_ANTONYM_DATA  DERIVATIONAL_DATA  COLLOCATION_DATA
  │
  ├─ Persistence (db.js)
  │   IndexedDB → in-memory caches (_progressCache, _srsCache, _listCache, _dailyStatsCache)
  │   sync reads from cache, async writes to DB (fire-and-forget or awaited)
  │
  ├─ State (core.js)
  │   centralDictionary (search, lookup, enrichment, synonyms/antonyms, derivational forms)
  │   state (progress CRUD, proficiency derivation, list management, daily stats)
  │
  ├─ Session (session-core.js)
  │   Mode-agnostic framework: queue building, lifecycle, navigation, proficiency tracking
  │   Session buffer isolation — all mutations buffered, batch-committed at end
  │
  ├─ Mixed Mode (ui-mixed.js + question-types.js)
  │   Universal question-type system: 9 types, weighted random, presets (dictation/mc/mix)
  │   Question types: spelling, mc_audio, mc_visual, collocation, phonetic, synonym, antonym, derivational
  │
  ├─ Legacy Modes (ui-dictation.js, ui-multiple-choice.js)
  │   Kept as reference implementations; dashboards start Mixed Mode with presets
  │
  ├─ UI (ui-dashboard, ui-wordcard, ui-search, ui-ledger, ui-profiles, ui-keyboard, ui-stats)
  │   Dashboard stats, word card overlay, dictionary search, ledger, profile management,
  │   keyboard customization modal, learning stats view
  │
  └─ Services (srs.js, speech.js, share.js, sw-register.js)
      SM-2 engine, TTS (Web Speech + Youdao), import/export, PWA
```

## File Structure

```
IELTS Vocab Gym/
├── index.html                   # Main SPA shell
├── README.md
├── relay.md                     # AI-facing architecture documentation
├── manifest.json                # PWA manifest
├── sw.js                        # Service worker (cache-first + network-first)
├── js/
│   ├── dictionary.js            # 15MB — 103,975 words
│   ├── sentences.js             # 20MB — 141,714 bilingual examples
│   ├── exchange-data.js         # 11MB — Word forms, tags, collins/oxford, definitions
│   ├── root-data.js             # 356KB — 6,627 prefix/root/suffix definitions
│   ├── root-word-data.js        # 5.8MB — 30,728 MorphoLex decompositions
│   ├── synonym-antonym-data.js  # 9.3MB — 39,209 words with synonyms + antonyms
│   ├── derivational-data.js     # 4.1MB — 48,512 words with derivational forms
│   ├── collocation-data.js      # Collocation clusters + examples
│   ├── ielts-vocab-data.js      # 32KB — Built-in IELTS word book
│   ├── vocab-gym.js             # Bootstrap, mode selection, keyboard routing, weight config
│   ├── core.js                  # centralDictionary, state, enrichment, SFX
│   ├── db.js                    # IndexedDB wrapper, caches, migration, daily stats
│   ├── session-core.js          # Session framework: lifecycle, nav, buffer, proficiency
│   ├── srs.js                   # SM-2 algorithm, grading, SRS dashboard panel
│   ├── speech.js                # Web Speech + Youdao dictvoice TTS
│   ├── question-types.js        # 9 question type definitions (factory pattern)
│   ├── ui-mixed.js              # Mixed Mode: universal handler, weight presets, delegation
│   ├── ui-dictation.js          # Dictation mode handler (legacy, kept as reference)
│   ├── ui-multiple-choice.js    # Multiple choice mode handler (legacy, kept as reference)
│   ├── ui-wordcard.js           # Full word card with enrichment, collocations, synonym pills
│   ├── ui-dashboard.js          # Dashboard, book cards, file upload, stats
│   ├── ui-search.js             # Dictionary lookup dropdown
│   ├── ui-ledger.js             # Sortable vocabulary ledger
│   ├── ui-profiles.js           # Profile management UI
│   ├── ui-keyboard.js           # Keyboard customization modal
│   ├── ui-stats.js              # Learning stats view (charts, heatmap, streaks)
│   ├── share.js                 # Progress import/export v3.0
│   └── sw-register.js           # Service worker registration
├── books/                       # Source Excel vocabulary books
├── icons/                       # PWA icons (192px, 512px)
└── data/                        # Legacy data sources
```

## Data Pipeline

See [relay.md](relay.md) for full data pipeline documentation, build scripts, source datasets, and IndexedDB schema details.

## Browser Support

Chrome, Edge, Firefox, Safari — any modern browser with Web Speech API. PWA features require HTTPS or localhost.

## License

MIT. Dictionary data from [english-vocabulary-master](https://github.com/zhenghaoyang24/english-vocab). ECDICT data from [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT). Morpheme data from [colingoldberg/morphemes](https://github.com/colingoldberg/morphemes). MorphoLex from [hugomailhot/MorphoLex-en](https://github.com/hugomailhot/MorphoLex-en). WordNet 3.0 from Princeton University. MorphyNet from [kbatsuren/MorphyNet](https://github.com/kbatsuren/MorphyNet). Collocation data from [Clara Chong's Verb-Noun Collocations](https://github.com/clarac7/verb-noun-collocations). Wiktionary content is [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
