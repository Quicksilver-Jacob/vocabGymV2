// VocabGym - core
window.VocabGym = window.VocabGym || {};
(function(ns) {

const STATE_KEY_PREFIX = 'english_vocab_gym_';
const USER_PROGRESS_KEY = STATE_KEY_PREFIX + 'user_progress';
const LIST_KEY_PREFIX = STATE_KEY_PREFIX + 'list_';
const SELECTED_LISTS_KEY = STATE_KEY_PREFIX + 'selected_lists';

ns.centralDictionary = {
  data: null,
  wordMap: new Map(), // word -> id
  idMap: new Map(),   // id -> word data

  init() {
    try {
      // Use embedded data from dictionary.js
      if (typeof DICTIONARY_DATA === 'undefined') {
        console.error('[Dictionary] DICTIONARY_DATA not found. Make sure dictionary.js is loaded first.');
        return false;
      }

      this.data = DICTIONARY_DATA;

      // Build lookup maps
      DICTIONARY_DATA.dictionary.forEach(entry => {
        this.wordMap.set(entry.word.toLowerCase(), entry.id);
        this.idMap.set(entry.id, entry);
      });

      // Build prefix index for fast search
      this.buildPrefixIndex();

      console.log(`[Dictionary] Loaded ${DICTIONARY_DATA.totalWords} words`);
      return true;
    } catch (e) {
      console.error('[Dictionary] Failed to load:', e);
      return false;
    }
  },

  getById(id) {
    return this.idMap.get(id) || null;
  },

  getByWord(word) {
    const id = this.wordMap.get(word.toLowerCase());
    return id ? this.idMap.get(id) : null;
  },

  // Build prefix index for fast search
  buildPrefixIndex() {
    this.prefixIndex = new Map();
    
    for (const entry of this.data.dictionary) {
      const word = entry.word.toLowerCase();
      // Index all prefixes (1-10 chars)
      for (let i = 1; i <= Math.min(word.length, 10); i++) {
        const prefix = word.substring(0, i);
        if (!this.prefixIndex.has(prefix)) {
          this.prefixIndex.set(prefix, []);
        }
        this.prefixIndex.get(prefix).push(entry);
      }
    }
  },

  // Calculate edit distance for fuzzy matching
  editDistance(s1, s2, maxDist = 3) {
    const len1 = s1.length, len2 = s2.length;
    if (Math.abs(len1 - len2) > maxDist) return maxDist + 1;
    
    const dp = Array(len2 + 1).fill(0);
    for (let j = 0; j <= len2; j++) dp[j] = j;
    
    for (let i = 1; i <= len1; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= len2; j++) {
        const temp = dp[j];
        if (s1[i - 1] === s2[j - 1]) {
          dp[j] = prev;
        } else {
          dp[j] = Math.min(prev + 1, dp[j] + 1, dp[j - 1] + 1);
        }
        prev = temp;
        if (dp[j] > maxDist) break;
      }
    }
    return dp[len2];
  },

  // COCA frequency boost: common words rank higher
  // rank 1 (the) = +25, rank 60000 = +0, not in COCA = +0
  freqBoost(entry) {
    const r = entry.rank || 0;
    if (!r) return 0;
    return (60000 - r) / 2400;
  },

  search(query, limit = 20) {
    if (!query) return [];
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return [];
    const isChinese = /[一-鿿]/.test(query);

    const results = new Map();

    // Strategy 1: Exact prefix match (highest priority)
    // Score range: ~195-225 — always beats lower strategies
    if (!isChinese && this.prefixIndex && this.prefixIndex.has(lowerQuery)) {
      const prefixMatches = this.prefixIndex.get(lowerQuery);
      for (const entry of prefixMatches) {
        if (!results.has(entry.id)) {
          const wordLen = entry.word.length;
          const exactBonus = entry.word.toLowerCase() === lowerQuery ? 30 : 0;
          results.set(entry.id, {
            entry,
            score: 200 - wordLen * 0.5 + exactBonus + this.freqBoost(entry)
          });
        }
      }
    }

    // Strategy 2: Contains match (medium priority)
    // Score range: ~100-155 — beats fuzzy/definition, never beats prefix
    if (!isChinese && results.size < limit * 2) {
      for (const entry of this.data.dictionary) {
        if (results.has(entry.id)) continue;
        const word = entry.word.toLowerCase();
        if (!word.includes(lowerQuery)) continue;

        let score = 100 + this.freqBoost(entry) * 0.8;

        // Exact word match is best-in-class
        if (word === lowerQuery) score += 50;
        // Starts-with gives a strong signal
        else if (word.startsWith(lowerQuery)) score += 25;

        // Penalize long words (more characters means weaker match relevance)
        score -= Math.max(0, entry.word.length - lowerQuery.length) * 0.3;

        results.set(entry.id, { entry, score });
        if (results.size >= limit * 2) break;
      }
    }

    // Strategy 3: Fuzzy match for typos (only for longer English queries)
    // Score range: ~30-55 — beats definition, never beats contains
    if (!isChinese && lowerQuery.length >= 4 && results.size < limit * 3) {
      for (const entry of this.data.dictionary) {
        if (results.has(entry.id)) continue;
        const word = entry.word.toLowerCase();
        if (Math.abs(word.length - lowerQuery.length) > 2) continue;

        const dist = this.editDistance(lowerQuery, word, 2);
        if (dist > 2) continue;

        results.set(entry.id, {
          entry,
          score: 35 - dist * 8 + this.freqBoost(entry) * 0.5
        });
        if (results.size >= limit * 4) break;
      }
    }

    // Strategy 4: Definition search — match in Chinese definition
    // Score range: ~15-40 — lowest priority
    if (results.size < limit * 3) {
      for (const entry of this.data.dictionary) {
        if (results.has(entry.id)) continue;
        const def = entry.definition;
        if (!def.includes(query)) continue;

        // Multiple occurrences in definition = stronger match
        const occurrences = (def.match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        results.set(entry.id, {
          entry,
          score: 20 + Math.min(occurrences, 5) * 3 + this.freqBoost(entry) * 0.3
        });
        if (results.size >= limit * 3) break;
      }
    }

    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.entry);
  },

  getWordId(word) {
    return this.wordMap.get(word.toLowerCase()) || null;
  },

  // Get root decomposition for a word (from pre-computed data)
  decomposeWord(wordId) {
    if (typeof ROOT_DECOMPOSITIONS === 'undefined') return null;
    return ROOT_DECOMPOSITIONS[wordId] || null;
  },

  // Get synonyms for a word (from pre-computed WordNet + ECDICT data)
  getSynonyms(wordId) {
    if (typeof SYNONYM_ANTONYM_DATA === 'undefined') return [];
    var entry = SYNONYM_ANTONYM_DATA[wordId];
    return entry ? (entry.synonyms || []) : [];
  },

  // Get derivational forms (from MorphyNet — Wiktionary-derived, 98% precision)
  // Returns [{id, word, morpheme, type, fromPOS, toPOS, isSource}, ...]
  // isSource=1: this word is the base, relatedWord is the derived form
  // isSource=0: this word is a derived form, relatedWord is the base
  getDerivationalForms(wordId) {
    if (typeof DERIVATIONAL_DATA === 'undefined') return [];
    var entry = DERIVATIONAL_DATA[wordId];
    if (!entry) return [];
    return entry.map(function(row) {
      return {
        id: row[0],
        word: row[1],
        morpheme: row[2],
        type: row[3],
        fromPOS: row[4],
        toPOS: row[5],
        isSource: row[6]
      };
    });
  },

  // Get antonyms for a word (from pre-computed WordNet data)
  getAntonyms(wordId) {
    if (typeof SYNONYM_ANTONYM_DATA === 'undefined') return [];
    var entry = SYNONYM_ANTONYM_DATA[wordId];
    return entry ? (entry.antonyms || []) : [];
  },

  // Get exchange/word-form data (now also includes enrichment: tag, collins, oxford, bnc, frq, definition)
  getExchange(wordId) {
    if (typeof EXCHANGE_DATA === 'undefined') return null;
    return EXCHANGE_DATA[wordId] || null;
  },

  // ECDICT enrichment helpers — all read from EXCHANGE_DATA
  getExamTags(wordId) {
    var ex = this.getExchange(wordId);
    return (ex && ex.tag) ? ex.tag.split(' ') : [];
  },

  getCollinsStars(wordId) {
    var ex = this.getExchange(wordId);
    return (ex && ex.collins) ? ex.collins : 0;
  },

  isOxford3000(wordId) {
    var ex = this.getExchange(wordId);
    return !!(ex && ex.oxford);
  },

  getEnglishDefinition(wordId) {
    var ex = this.getExchange(wordId);
    return (ex && ex.definition) ? ex.definition : '';
  },

  getFrequencyRank(wordId) {
    var ex = this.getExchange(wordId);
    return (ex && ex.bnc) ? ex.bnc : null;
  },

  // Get POS distribution with percentages (e.g. [{code:'v', pct:46}, {code:'n', pct:51}, {code:'j', pct:3}])
  getPosDistribution(wordId) {
    var ex = this.getExchange(wordId);
    var raw = (ex && ex.posRaw) ? ex.posRaw : (ex && ex.pos) ? ex.pos : '';
    if (!raw) return [];
    // Format: "v:46/j:3/n:51" or "n&v" (normalized)
    var parts = raw.split(/[/&]/);
    var result = [];
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].split(':');
      var code = pair[0].trim().toLowerCase();
      var pct = pair[1] ? parseInt(pair[1]) : null;
      // Normalize codes: j→adj, r→adv, a→adj
      if (code === 'j' || code === 'a') code = 'adj';
      else if (code === 'r') code = 'adv';
      result.push({ code: code, pct: pct });
    }
    return result;
  },

  // Get lemma (base form) for an inflected word
  getLemma(word) {
    if (typeof LEMMA_MAP === 'undefined') return null;
    return LEMMA_MAP[word.toLowerCase()] || null;
  },

  // Extract POS from exchange data or definition
  _extractPOS(entry) {
    var ex = (typeof EXCHANGE_DATA !== 'undefined') ? EXCHANGE_DATA[entry.id] : null;
    if (ex && ex.pos) return ex.pos;
    if (!entry.definition) return '';
    // Scan all definition lines for POS tags, collect unique
    var posRegex = /\b(n\.|vt\.|vi\.|adj\.|adv\.|prep\.|conj\.|pron\.|art\.|int\.|aux\.|num\.|v\.)/gi;
    var lines = entry.definition.split('\\n');
    var tags = [];
    for (var i = 0; i < lines.length; i++) {
      var matches = lines[i].match(posRegex);
      if (matches) {
        for (var j = 0; j < matches.length; j++) {
          var tag = matches[j].replace('.', '').toLowerCase();
          if (tags.indexOf(tag) === -1) tags.push(tag);
        }
      }
    }
    return tags.join('&');
  },

  // Find similar words by composite score: edit distance + POS match + COCA frequency
  getSimilarWords(wordId, limit) {
    limit = limit || 10;
    var entry = this.getById(wordId);
    if (!entry) return [];
    var word = entry.word.toLowerCase();
    var len = word.length;
    var pos = this._extractPOS(entry);

    // Bucket: same first 2 chars, len ± 2
    var prefix = word.substring(0, 2);
    var candidates = [];
    var allEntries = this.getAllEntries();

    // First pass: same prefix bucket
    for (var i = 0; i < allEntries.length; i++) {
      var e = allEntries[i];
      if (e.id === wordId) continue;
      var w = e.word.toLowerCase();
      if (w.length < len - 2 || w.length > len + 2) continue;
      if (w.length >= 2 && w.substring(0, 2) === prefix) {
        var dist = this.editDistance(word, w);
        if (dist <= 2) candidates.push({ entry: e, distance: dist });
      }
      // Also try all words len ± 1 to catch prefix changes
      if (w.length >= len - 1 && w.length <= len + 1 && w.length >= 2 && w.substring(0, 2) !== prefix) {
        var dist2 = this.editDistance(word, w);
        if (dist2 <= 2) candidates.push({ entry: e, distance: dist2 });
      }
    }

    // Score each candidate: edit distance weighted by POS match and frequency
    var self = this;
    candidates.forEach(function(c) {
      var e = c.entry;
      var ePos = self._extractPOS(e);
      var posMatch = 0;
      if (pos && ePos) {
        var posArr = pos.split('&');
        var ePosArr = ePos.split('&');
        for (var pi = 0; pi < posArr.length; pi++) {
          if (ePosArr.indexOf(posArr[pi]) !== -1) { posMatch = 1; break; }
        }
      }
      var freqB = self.freqBoost(e);

      // Composite score: lower edit dist = better, POS match = bonus, high freq = bonus
      // Score range: editDist 0-2 maps to 100-40 base; POS adds 15; freq adds 0-12
      c.score = Math.max(0, 100 - c.distance * 30 + posMatch * 15 + freqB * 0.3);

      // Penalize words that are prefixes/suffixes of each other (common false positives)
      if (word.indexOf(w) === 0 || w.indexOf(word) === 0) {
        c.score -= 8;
      }
    });

    candidates.sort(function(a, b) { return b.score - a.score; });

    // Deduplicate by word
    var seen = {};
    var result = [];
    for (var k = 0; k < candidates.length && result.length < limit; k++) {
      var c = candidates[k];
      var wLower = c.entry.word.toLowerCase();
      if (seen[wLower]) continue;
      seen[wLower] = true;
      result.push({
        id: c.entry.id,
        word: c.entry.word,
        phonetic: c.entry.phonetic,
        definition: c.entry.definition,
        rank: c.entry.rank,
        distance: c.distance
      });
    }

    return result;
  },

  // Get all dictionary entries (for iteration - returns reference, not copy)
  getAllEntries() {
    return this.data ? this.data.dictionary : [];
  }
};

// ── User state (profile-aware via IndexedDB) ──
// Word progress and lists are stored in IndexedDB (ns.db).
// Settings (tts_source, audio_preference, reveal_layout, session_order, selected_lists)
// remain in localStorage for now as global preferences.

ns.state = {
  // Active word pool (set by dashboard syncSelectionToState)
  activeWordIds: [],

  // Shared session flag — set by mode handlers and session-core
  wrongAnswerAttempted: false,

  // Session-scoped proficiency tracking (authoritative during session)
  // Set by session-core loadWord() → snapshot of getProficiency()
  _sessionSystemProf: null,
  // Set by session-core loadWord() → wordProgress.manualProficiency or null
  _sessionManualProf: null,
  // Set by session-core → modified by correct/wrong/timeout answers
  _sessionDerivedProf: null,

  // Session mutation buffer — isolates all mid-session writes from global storage.
  // { wordId: {correct: delta, wrong: delta, manualProficiency: string|null} }
  // null means no session is active (read path returns global cache directly).
  _sessionBuffer: null,

  // Ledger pagination
  ledgerPage: 1,
  ledgerLimit: 15,
  filteredLedgerIds: [],

  // ── Daily goal & streak ──
  _dailyGoal: null,

  getDailyGoal: function() {
    if (this._dailyGoal !== null) return this._dailyGoal;
    try {
      var saved = parseInt(localStorage.getItem('english_vocab_gym_daily_goal'));
      this._dailyGoal = (saved && saved > 0) ? saved : 20;
    } catch (_) { this._dailyGoal = 20; }
    return this._dailyGoal;
  },

  setDailyGoal: function(count) {
    this._dailyGoal = count;
    try { localStorage.setItem('english_vocab_gym_daily_goal', String(count)); } catch (_) {}
  },

  getTodayStats: function() {
    var today = new Date().toISOString().split('T')[0];
    return ns.db.getDailyStatsSync(today);
  },

  getStreakAsync: function() {
    var pid = ns.db.getCurrentProfileIdSync();
    if (!pid) return Promise.resolve({ streak: 0, todayComplete: false });
    var goal = this.getDailyGoal();
    return ns.db.getAllDailyStats(pid).then(function(rows) {
      var dateMap = {};
      rows.forEach(function(r) { dateMap[r.date] = r.wordsPracticed; });
      var today = new Date();
      var streak = 0;
      var todayComplete = false;
      for (var i = 0; i < 365; i++) {
        var d = new Date(today);
        d.setDate(d.getDate() - i);
        var dateStr = d.toISOString().split('T')[0];
        var practiced = dateMap[dateStr] || 0;
        if (i === 0) {
          todayComplete = practiced >= goal;
          if (practiced >= goal) streak = 1;
          else break;
        } else {
          if (practiced >= goal) streak++;
          else break;
        }
      }
      return { streak: streak, todayComplete: todayComplete };
    });
  },

  // Get word progress (sync, from in-memory cache). When a session is active,
  // merges buffered deltas (correct/wrong/manualProficiency) on top of global data.
  getWordProgress: function(wordId) {
    var cached = ns.db.getWordProgressSync(wordId);
    if (!this._sessionBuffer) return cached;
    var buf = this._sessionBuffer[wordId];
    if (!buf) return cached;
    var merged = {};
    for (var k in cached) { if (cached.hasOwnProperty(k)) merged[k] = cached[k]; }
    if (buf.correct) merged.correct = (merged.correct || 0) + buf.correct;
    if (buf.wrong) merged.wrong = (merged.wrong || 0) + buf.wrong;
    if (buf.manualProficiency !== undefined) merged.manualProficiency = buf.manualProficiency || '';
    return merged;
  },

  // Update word progress (sync cache update + async persist)
  updateWordProgress: function(wordId, updates) {
    var pid = ns.db.getCurrentProfileIdSync();
    // Sync: update cache immediately — merge all keys
    var current = ns.db.getWordProgressSync(wordId);
    var merged = {};
    for (var k in current) { if (current.hasOwnProperty(k)) merged[k] = current[k]; }
    for (var k in updates) { if (updates.hasOwnProperty(k)) merged[k] = updates[k]; }
    ns.db.setProgressCacheSync(pid, wordId, merged);
    // Async: persist to IndexedDB (fire-and-forget)
    ns.db.updateWordProgress(pid, wordId, updates).catch(function(e) {
      console.warn('[State] Failed to persist word progress:', e);
    });
  },

  // Get word status
  getWordStatus: function(wordId) {
    return this.getWordProgress(wordId).status;
  },

  // Get proficiency level (SM-2 lifecycle: unlearned → learning → reviewing → mastered)
  // Manual override via manualProficiency field takes precedence over system-derived
  getProficiency: function(wordId) {
    var prog = this.getWordProgress(wordId);
    var VALID_PROFS = { unlearned:1, learning:1, reviewing:1, mastered:1 };
    if (prog.manualProficiency && VALID_PROFS[prog.manualProficiency]) return prog.manualProficiency;
    var attempts = prog.correct + prog.wrong;
    if (attempts === 0) return 'unlearned';
    var srs = ns.db.getSRSDataSync(wordId);
    if (srs && srs.repetitions >= 2 && srs.interval >= 30) return 'mastered';
    if (srs && srs.repetitions >= 1) return 'reviewing';
    return 'learning';
  },

  // Set manual proficiency override (persisted)
  setManualProficiency: function(wordId, level) {
    var VALID = { unlearned:1, learning:1, reviewing:1, mastered:1 };
    if (level && VALID[level]) {
      this.updateWordProgress(wordId, { manualProficiency: level });
    } else {
      this.clearManualProficiency(wordId);
    }
  },

  // Clear manual override — revert to system-derived proficiency
  // Not called during session — use addToSessionBuffer with manualProficiency:'' instead.
  clearManualProficiency: function(wordId) {
    this.updateWordProgress(wordId, { manualProficiency: '' });
  },

  // ── Session buffer — isolates all mid-session mutations ──

  // Called by session-core._beginSession to create a fresh buffer
  beginSessionBuffer: function() {
    this._sessionBuffer = {};
  },

  // Called by session-core answer handlers and proficiency cycling.
  // delta: {correct, wrong, manualProficiency} — values are INCREMENTS for
  // correct/wrong, and absolute string for manualProficiency.
  addToSessionBuffer: function(wordId, delta) {
    if (!this._sessionBuffer) this._sessionBuffer = {};
    var entry = this._sessionBuffer[wordId];
    if (!entry) { entry = {}; this._sessionBuffer[wordId] = entry; }
    if (delta.correct) entry.correct = (entry.correct || 0) + delta.correct;
    if (delta.wrong) entry.wrong = (entry.wrong || 0) + delta.wrong;
    if (delta.manualProficiency !== undefined) entry.manualProficiency = delta.manualProficiency;
  },

  // Flush all buffered deltas to IndexedDB. Called by endSession / quitSession.
  // Returns a promise that resolves when all writes are committed.
  commitSessionBuffer: function() {
    if (!this._sessionBuffer) return Promise.resolve();
    var pid = ns.db.getCurrentProfileIdSync();
    var wordIds = Object.keys(this._sessionBuffer);
    if (!pid || wordIds.length === 0) {
      this._sessionBuffer = null;
      return Promise.resolve();
    }
    // Capture and clear the buffer immediately so no new writes land in it
    var buffer = this._sessionBuffer;
    this._sessionBuffer = null;
    var self = this;
    var promises = wordIds.map(function(widStr) {
      var wid = Number(widStr);
      var delta = buffer[widStr];
      return ns.db.getWordProgress(pid, wid).then(function(current) {
        var merged = {};
        for (var k in current) { if (current.hasOwnProperty(k)) merged[k] = current[k]; }
        if (delta.correct) merged.correct = (merged.correct || 0) + delta.correct;
        if (delta.wrong) merged.wrong = (merged.wrong || 0) + delta.wrong;
        if (delta.manualProficiency !== undefined) merged.manualProficiency = delta.manualProficiency || '';
        ns.db.setProgressCacheSync(pid, wid, merged);
        return ns.db.updateWordProgress(pid, wid, merged);
      }).catch(function(err) {
        console.warn('[SessionBuffer] Failed to commit word ' + wid + ':', err);
        // Don't let one failure break the entire batch
      });
    });
    return Promise.all(promises);
  },

  // Discard buffer without committing (not currently used, but available for edge cases)
  discardSessionBuffer: function() {
    this._sessionBuffer = null;
  },

  getProficiencyStats: function() {
    var self = this;
    var ids = this.activeWordIds;
    var counts = { unlearned: 0, learning: 0, reviewing: 0, mastered: 0, total: ids.length };
    for (var i = 0; i < ids.length; i++) {
      var prof = self.getProficiency(ids[i]); if (counts.hasOwnProperty(prof)) counts[prof]++;
    }
    return counts;
  },

  // Get word stats
  getWordStats: function(wordId) {
    var p = this.getWordProgress(wordId);
    return { correct: p.correct || 0, wrong: p.wrong || 0 };
  },

  // Get accuracy for word
  getWordAccuracy: function(wordId) {
    var stats = this.getWordStats(wordId);
    var total = stats.correct + stats.wrong;
    return total > 0 ? Math.round((stats.correct / total) * 100) : 0;
  },

  // Legacy: rebuild userProgress shape for share.js export/import compatibility.
  // Returns a mutable object — caller can modify it, then call saveUserProgress() to persist.
  getUserProgress: function() {
    if (!this._userProgress) {
      this._userProgress = {
        version: '3.0',
        wordProgress: ns.db.getAllProgressCacheSync(),
        lists: ns.db.getListNamesSync()
      };
    }
    return this._userProgress;
  },

  // Legacy: persist modifications made to the object returned by getUserProgress().
  // Used by share.js import flow.
  saveUserProgress: function() {
    if (!this._userProgress) return;
    var pid = ns.db.getCurrentProfileIdSync();
    var wp = this._userProgress.wordProgress;
    var wordIds = Object.keys(wp);
    for (var i = 0; i < wordIds.length; i++) {
      var wid = wordIds[i];
      ns.db.setProgressCacheSync(pid, Number(wid), wp[wid]);
    }
    ns.db.batchImportProgress(pid, wp).catch(function(e) {
      console.warn('[State] Failed to persist imported progress:', e);
    });
    this._userProgress = null;
  },

  // ── List operations ──

  getListNames: function() {
    return ns.db.getListNamesSync();
  },

  loadList: function(listName) {
    return ns.db.loadListSync(listName);
  },

  saveList: function(listName, wordIds) {
    var pid = ns.db.getCurrentProfileIdSync();
    var listData = { name: listName, wordIds: wordIds, createdAt: Date.now() };
    // Sync: update cache
    ns.db.setListCacheSync(listName, listData);
    // Async: persist
    ns.db.saveList(pid, listName, wordIds).catch(function(e) {
      console.warn('[State] Failed to save list:', e);
    });
  },

  deleteList: function(listName) {
    var pid = ns.db.getCurrentProfileIdSync();
    ns.db.removeListCacheSync(listName);
    ns.db.deleteList(pid, listName).catch(function(e) {
      console.warn('[State] Failed to delete list:', e);
    });
  },

  mergeList: function(listName, newWordIds) {
    var existing = ns.db.loadListSync(listName);
    var existingIds = existing ? existing.wordIds : [];
    var idSet = {};
    existingIds.forEach(function(id) { idSet[id] = true; });
    newWordIds.forEach(function(id) { idSet[id] = true; });
    var mergedIds = Object.keys(idSet).map(Number);
    this.saveList(listName, mergedIds);
    return mergedIds;
  },

  // Multi-select: get/set selected book list names (stays in localStorage — global)
  getSelectedLists: function() {
    return ns.db.getSelectedListsSync();
  },

  setSelectedLists: function(listNames) {
    var pid = ns.db.getCurrentProfileIdSync();
    ns.db.setSelectedListsSync(pid, listNames);
  },

  // Session word order preference (global)
  getSessionOrder: function() {
    try {
      return localStorage.getItem('english_vocab_gym_user_progress_order') || 'shuffled';
    } catch (_) { return 'shuffled'; }
  },
  setSessionOrder: function(order) {
    localStorage.setItem('english_vocab_gym_user_progress_order', order);
  },

  // Compute combined word pool from selected lists (union, deduplicated)
  getCombinedWordIds: function() {
    var selected = this.getSelectedLists();
    if (selected.length === 0) return [];
    var idSet = new Set();
    for (var i = 0; i < selected.length; i++) {
      var list = ns.db.loadListSync(selected[i]);
      if (list && list.wordIds) {
        list.wordIds.forEach(function(id) { idSet.add(id); });
      }
    }
    return Array.from(idSet);
  },

  // Refresh state after profile switch (called by profiles module)
  refreshAfterProfileSwitch: function() {
    // Caches are already reloaded by ns.db.setCurrentProfileId()
    // This is a hook for UI modules to re-render
  }
};

// ── Centralized keyboard shortcut registry ──
ns.keybindings = {
  _bindings: [],
  _customMap: null,
  _isCapturing: false,
  _captureCallback: null,

  _loadCustom: function() {
    if (this._customMap !== null) return;
    try {
      this._customMap = JSON.parse(localStorage.getItem('english_vocab_gym_keybindings') || '{}');
    } catch (_) { this._customMap = {}; }
  },

  register: function(id, group, defaultKey, description, handler) {
    this._loadCustom();
    this._bindings.push({
      id: id,
      group: group,
      defaultKey: defaultKey,
      description: description,
      handler: handler
    });
  },

  getEffectiveKey: function(id) {
    this._loadCustom();
    return this._customMap[id] || null;
  },

  // Get the display key string for a binding (custom if set, otherwise default)
  getDisplayKey: function(id) {
    this._loadCustom();
    if (this._customMap[id]) return this._customMap[id];
    for (var i = 0; i < this._bindings.length; i++) {
      if (this._bindings[i].id === id) return this._bindings[i].defaultKey;
    }
    return '';
  },

  // Render a binding's effective key as a <kbd> HTML string
  renderKbd: function(id) {
    var key = this.getDisplayKey(id);
    if (!key) return '';
    return '<kbd class="bg-zinc-800 border border-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded font-mono font-bold text-[10px]">' + key + '</kbd>';
  },

  // Check if a keyboard event matches the effective key for a binding ID
  matchesBinding: function(e, bindingId) {
    this._loadCustom();
    // Find the binding to get the default key
    var defaultKey = null;
    for (var i = 0; i < this._bindings.length; i++) {
      if (this._bindings[i].id === bindingId) {
        defaultKey = this._bindings[i].defaultKey;
        break;
      }
    }
    if (!defaultKey) return false;
    var effectiveKey = this._customMap[bindingId] || defaultKey;
    var parsed = this._parseKeyString(effectiveKey);
    if (!parsed) return false;
    var eKey = e.key;
    if (parsed.key === 'Space' && eKey === ' ') eKey = 'Space';
    if (parsed.key.length === 1 && eKey.length === 1) eKey = eKey.toUpperCase();
    var keyIsSymbol = parsed.key.length === 1 && !/[a-zA-Z0-9]/.test(parsed.key);
    return eKey === parsed.key &&
        (!!e.ctrlKey || !!e.metaKey) === parsed.ctrlKey &&
        (keyIsSymbol || !!e.shiftKey === parsed.shiftKey) &&
        !!e.altKey === parsed.altKey;
  },

  getAllBindings: function() {
    this._loadCustom();
    var self = this;
    return this._bindings.map(function(b) {
      return {
        id: b.id,
        group: b.group,
        key: self._customMap[b.id] || b.defaultKey,
        defaultKey: b.defaultKey,
        description: b.description,
        isCustom: !!self._customMap[b.id]
      };
    });
  },

  setCustomKey: function(id, newKey) {
    this._loadCustom();
    if (newKey === null || newKey === undefined) {
      delete this._customMap[id];
    } else {
      this._customMap[id] = newKey;
    }
    try {
      localStorage.setItem('english_vocab_gym_keybindings', JSON.stringify(this._customMap));
    } catch (_) {}
  },

  resetBinding: function(id) {
    this.setCustomKey(id, null);
  },

  resetAll: function() {
    this._customMap = {};
    try { localStorage.removeItem('english_vocab_gym_keybindings'); } catch (_) {}
  },

  _parseKeyString: function(keyStr) {
    if (!keyStr) return null;
    var parts = keyStr.split('+');
    var result = { key: '', ctrlKey: false, shiftKey: false, altKey: false };
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim().toLowerCase();
      if (p === 'ctrl') result.ctrlKey = true;
      else if (p === 'shift') result.shiftKey = true;
      else if (p === 'alt') result.altKey = true;
      else if (p === 'meta') result.ctrlKey = true; // Meta maps to Ctrl for consistency
      else result.key = parts[i].trim();
    }
    return result;
  },

  handleKeydown: function(e) {
    this._loadCustom();
    for (var i = 0; i < this._bindings.length; i++) {
      var b = this._bindings[i];
      var effectiveKey = this._customMap[b.id] || b.defaultKey;
      var parsed = this._parseKeyString(effectiveKey);
      if (!parsed) continue;
      var eKey = e.key;
      // Normalize Space for matching
      if (parsed.key === 'Space' && eKey === ' ') eKey = 'Space';
      // Normalize single-character keys (browser reports lowercase, bindings store uppercase)
      if (parsed.key.length === 1 && eKey.length === 1) eKey = eKey.toUpperCase();
      // Symbol keys (non-letter, non-digit) may need Shift on US keyboards (e.g. '?')
      var keyIsSymbol = parsed.key.length === 1 && !/[a-zA-Z0-9]/.test(parsed.key);
      if (eKey === parsed.key &&
          (!!e.ctrlKey || !!e.metaKey) === parsed.ctrlKey &&
          (keyIsSymbol || !!e.shiftKey === parsed.shiftKey) &&
          !!e.altKey === parsed.altKey) {
        if (b.handler) {
          e.preventDefault();
          e.stopPropagation();
          b.handler(e);
          return true;
        }
      }
    }
    return false;
  },

  startCapture: function(callback) {
    this._isCapturing = true;
    this._captureCallback = callback;
  },

  cancelCapture: function() {
    this._isCapturing = false;
    this._captureCallback = null;
  },

  _RESTRICTED: ['Escape','Tab','CapsLock','Control','Shift','Alt','Meta','Win','Fn','Symbol','ContextMenu','Unidentified','NumLock','ScrollLock','Pause'],

  _handleCapture: function(e) {
    if (!this._isCapturing) return false;
    e.preventDefault();
    e.stopPropagation();
    var key = e.key;
    if (key === ' ') key = 'Space';
    if (key === 'Dead') return false;
    if (this._RESTRICTED.indexOf(key) !== -1) {
      this._isCapturing = false;
      if (this._captureCallback) {
        var cb = this._captureCallback;
        this._captureCallback = null;
        cb(null);
      }
      return true;
    }
    var parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    if (key.length === 1) key = key.toUpperCase();
    parts.push(key);
    var keyStr = parts.join('+');
    this._isCapturing = false;
    if (this._captureCallback) {
      var cb = this._captureCallback;
      this._captureCallback = null;
      cb(keyStr);
    }
    return true;
  },

  getConflicts: function(excludeId, keyStr) {
    this._loadCustom();
    var conflicts = [];
    var all = this.getAllBindings();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === excludeId) continue;
      if (all[i].key === keyStr) conflicts.push(all[i]);
    }
    return conflicts;
  },

  getGroupColor: function(group) {
    var colors = {
      session: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400', label: 'During Session' },
      audio: { bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400', label: 'Audio Controls' },
      navigation: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400', label: 'Navigation' },
      proficiency: { bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400', label: 'Proficiency' },
      answer: { bg: 'bg-rose-500/20', border: 'border-rose-500/40', text: 'text-rose-400', label: 'Answer Selection' },
      system: { bg: 'bg-violet-500/20', border: 'border-violet-500/40', text: 'text-violet-400', label: 'System' }
    };
    return colors[group] || colors.system;
  }
};

ns.playSFX = (type) => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'correct') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'wrong') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.25);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'unfamiliar') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554.37, now + 0.08);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    }

    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch (e) {
    console.warn('Audio error:', e);
  }
};
})(window.VocabGym);
