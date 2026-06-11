// VocabGym - word card
window.VocabGym = window.VocabGym || {};
(function(ns) {

ns.wordcard = {
  _currentWordId: null,
  _navStack: [],

  init() {
    this.bindEvents();
  },

  bindEvents() {
    document.getElementById('btn-wordcard-close').addEventListener('click', () => this.close());

    document.getElementById('wordcard-overlay').addEventListener('mousedown', (e) => {
      if (e.target === e.currentTarget) this.close();
    });

  },

  show(wordId) {
    this._currentWordId = wordId;
    this._navStack = [wordId];

    const content = document.getElementById('wordcard-content');
    this._renderFullCard(wordId, content);

    const overlay = document.getElementById('wordcard-overlay');
    overlay.classList.remove('hidden');
    overlay.classList.remove('animate-fade-in');
    void overlay.offsetWidth;
    overlay.classList.add('animate-fade-in');
  },

  close() {
    document.getElementById('wordcard-overlay').classList.add('hidden');
    this._currentWordId = null;
    this._navStack = [];

    // Keep search focused and dropdown open
    var searchInput = document.getElementById('header-dict-search');
    if (searchInput) {
      setTimeout(function() { searchInput.focus(); }, 50);
    }
  },

  navigateTo(wordId) {
    this._navStack.push(wordId);
    this._currentWordId = wordId;
    const content = document.getElementById('wordcard-content');
    this._renderFullCard(wordId, content);
  },

  // Render full card into a container. Used by both overlay and session reveal.
  _renderFullCard(wordId, container) {
    const entry = ns.centralDictionary.getById(wordId);
    if (!entry) { container.innerHTML = '<p class="text-zinc-500 text-sm p-4">Word not found.</p>'; return; }

    const progress = ns.state.getWordProgress(wordId);
    const stats = ns.state.getWordStats(wordId);
    const acc = ns.state.getWordAccuracy(wordId);
    const total = stats.correct + stats.wrong;

    // ── POS badges ──
    var exchange = ns.centralDictionary.getExchange(wordId);
    var posDist = ns.centralDictionary.getPosDistribution(wordId);
    var posTags = [];
    if (posDist.length > 0) {
      posTags = posDist.map(function(p) {
        return { code: p.code, label: p.pct ? p.code + ' ' + p.pct + '%' : p.code };
      });
    } else {
      // Fallback to scanning definition text for POS tags
      const posRegex = /\b(n\.|vt\.|vi\.|adj\.|adv\.|prep\.|conj\.|pron\.|art\.|int\.|aux\.|num\.|v\.)/gi;
      const lines = entry.definition.split('\\n');
      const seen = [];
      for (var li = 0; li < lines.length; li++) {
        const cleanLine = lines[li].replace(/&/g, ' ');
        const matches = cleanLine.match(posRegex);
        if (matches) {
          for (var mi = 0; mi < matches.length; mi++) {
            const tag = matches[mi].replace('.', '').toLowerCase();
            if (seen.indexOf(tag) === -1) seen.push(tag);
          }
        }
      }
      posTags = seen.map(function(s) { return { code: s, label: s }; });
    }

    // ── Proficiency badge (SM-2 derived 4-level) ──
    var prof = ns.state.getProficiency(wordId);
    let statusClass, statusLabel, statusIcon;
    if (prof === 'mastered') {
      statusClass = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
      statusLabel = 'Mastered';
      statusIcon = '<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
    } else if (prof === 'reviewing') {
      statusClass = 'bg-amber-500/10 border-amber-500/20 text-amber-400';
      statusLabel = 'Reviewing';
      statusIcon = '<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
    } else if (prof === 'learning') {
      statusClass = 'bg-sky-500/10 border-sky-500/20 text-sky-400';
      statusLabel = 'Learning';
      statusIcon = '<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>';
    } else {
      statusClass = 'bg-zinc-800/60 border-zinc-700 text-zinc-400';
      statusLabel = 'Unlearned';
      statusIcon = '<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 4h.01"/></svg>';
    }

    // ── Definition ──
    let defHTML = this._formatDefinition(entry.definition);

    // ── Roots ──
    let rootsHTML = '';
    const decomp = ns.centralDictionary.decomposeWord(wordId);
    if (decomp) {
      let blocks = '';
      if (decomp.prefix) {
        blocks += '<div class="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-center flex-shrink-0">' +
          '<span class="block text-xs font-mono font-bold text-blue-400">' + this.esc(decomp.prefix.text) + '</span>' +
          '<span class="block text-[10px] text-blue-400/60 font-semibold">prefix</span>' +
          (decomp.prefix.meaning ? '<span class="block text-[10px] text-blue-300/70 mt-0.5">' + this.esc(decomp.prefix.meaning) + '</span>' : '') +
          '</div>';
      }
      if (decomp.root) {
        blocks += '<div class="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-center flex-shrink-0">' +
          '<span class="block text-xs font-mono font-bold text-emerald-400">' + this.esc(decomp.root.text) + '</span>' +
          '<span class="block text-[10px] text-emerald-400/60 font-semibold">root</span>' +
          (decomp.root.meaning ? '<span class="block text-[10px] text-emerald-300/70 mt-0.5">' + this.esc(decomp.root.meaning) + '</span>' : '') +
          '</div>';
      }
      if (decomp.suffix) {
        blocks += '<div class="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-center flex-shrink-0">' +
          '<span class="block text-xs font-mono font-bold text-amber-400">' + this.esc(decomp.suffix.text) + '</span>' +
          '<span class="block text-[10px] text-amber-400/60 font-semibold">suffix</span>' +
          (decomp.suffix.meaning ? '<span class="block text-[10px] text-amber-300/70 mt-0.5">' + this.esc(decomp.suffix.meaning) + '</span>' : '') +
          '</div>';
      }

      let mnemHTML = '';
      if (decomp.mnemonic) {
        let mnem = decomp.mnemonic.replace(/\\n[^.]+\.\s*$/g, '').replace(/\s*\\n\w+\.$/g, '');
        mnemHTML = '<p class="text-[11px] text-zinc-400 italic mt-2">' + this.esc(mnem) + '</p>';
      }

      if (blocks) {
        rootsHTML =
          '<div class="pt-4 border-t border-zinc-800/50">' +
            '<h4 class="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2.5">Root Decomposition</h4>' +
            '<div class="flex flex-wrap items-center gap-2">' + blocks + '</div>' +
            mnemHTML +
          '</div>';
      }
    }

    // ── Sentences ──
    let sentencesHTML = '';
    const sentences = typeof SENTENCE_DATA !== 'undefined' ? SENTENCE_DATA[wordId] : null;
    if (sentences && sentences.length > 0) {
      // Get inflected forms for highlighting
      let inflectedForms = [];
      if (exchange && exchange.exchange) {
        exchange.exchange.split('|').forEach(part => {
          const val = part.replace(/^[a-z0-9]+:/, '').trim();
          if (val && val !== entry.word) inflectedForms.push(val);
        });
      }
      let hlRegex = null;
      if (inflectedForms.length > 0) {
        const escaped = inflectedForms.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        hlRegex = new RegExp('\\b(' + escaped.join('|') + ')\\b', 'gi');
      }

      // Filter out low-quality sentences
      var filtered = [];
      for (var si = 0; si < sentences.length && filtered.length < 5; si++) {
        var s = sentences[si];
        var en = typeof s === 'string' ? s : s.en;
        var cn = typeof s === 'string' ? '' : s.cn;
        if (!en || en.length < 15) continue;
        // Skip number-only junk (e.g. "1.", "2.")
        if (/^[0-9. ]+$/.test(en)) continue;
        // Skip game/tech spam patterns
        if (/skill level|hp |mana |damage|upgrade|level up|quest|spell/i.test(en)) continue;
        if (/[<>{}]/.test(en)) continue;
        filtered.push({ en: en, cn: cn });
      }

      const items = filtered.map(s => {
        var enHTML = this.esc(s.en);
        if (hlRegex) enHTML = enHTML.replace(hlRegex, '<mark class="bg-brand-500/20 text-brand-300 px-0.5 rounded">$1</mark>');
        return '<div class="border-l-2 border-zinc-800 pl-3 py-1 cursor-pointer hover:border-brand-500/40 transition-colors sentence-item">' +
          '<p class="text-xs text-zinc-300 italic leading-relaxed">&ldquo;' + enHTML + '&rdquo;</p>' +
          (s.cn ? '<p class="text-[11px] text-zinc-500 leading-relaxed mt-0.5">' + this.esc(s.cn) + '</p>' : '') +
          '</div>';
      }).join('');

      if (filtered.length > 0) {
        sentencesHTML =
          '<div class="pt-4 border-t border-zinc-800/50">' +
            '<h4 class="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2.5">Example Sentences <span class="font-normal text-zinc-600">(' + sentences.length + ')</span>' + (filtered.length < sentences.length ? ' <span class="text-zinc-600">— ' + filtered.length + ' shown</span>' : '') + '</h4>' +
            '<div class="space-y-1.5">' + items + '</div>' +
            '<p class="text-[10px] text-zinc-600 mt-1.5">Click a sentence to hear it spoken</p>' +
          '</div>';
      }
    }

    // ── Word Forms ──
    let formsHTML = '';
    if (exchange && exchange.exchange) {
      const partLabels = {
        p: 'Past', d: 'Past P.', i: 'Pres. P.', '3': '3rd Sing.',
        s: 'Plural', r: 'Comp.', t: 'Super.', '0': 'Base', '1': 'Other'
      };
      const formItems = exchange.exchange.split('|').map(part => {
        const m = part.match(/^([a-z0-9]+):(.+)$/);
        if (!m) return '';
        const label = partLabels[m[1]] || m[1];
        const word = m[2].trim();
        const formId = ns.centralDictionary.getWordId(word);
        return '<div class="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800/60 rounded-lg px-2.5 py-1.5">' +
          '<span class="text-[10px] font-semibold uppercase text-zinc-500 min-w-[3.2rem]">' + this.esc(label) + '</span>' +
          (formId
            ? '<button class="text-xs font-mono font-semibold text-brand-400 hover:text-brand-300 hover:underline transition-colors wordcard-link" data-word-id="' + formId + '">' + this.esc(word) + '</button>'
            : '<span class="text-xs font-mono text-zinc-400">' + this.esc(word) + '</span>') +
          '</div>';
      }).filter(Boolean);

      if (formItems.length > 0) {
        formsHTML =
          '<div class="pt-4 border-t border-zinc-800/50">' +
            '<h4 class="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Word Forms</h4>' +
            '<div class="grid grid-cols-2 gap-1">' + formItems.join('') + '</div>' +
          '</div>';
      }
    }

    // ── Similar Words ──
    let similarHTML = '';
    const similar = ns.centralDictionary.getSimilarWords(wordId, 8);
    if (similar.length > 0) {
      const items = similar.map(s => {
        const dist = s.distance || 0;
        const distColor = dist === 1 ? 'text-emerald-400' : 'text-amber-400';
        return '<button class="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800/60 rounded-lg px-2.5 py-1.5 hover:bg-zinc-800/60 transition-colors wordcard-link" data-word-id="' + s.id + '">' +
          '<span class="text-xs font-mono font-semibold text-zinc-200">' + this.esc(s.word) + '</span>' +
          '<span class="text-[10px] font-mono ' + distColor + '">diff ' + dist + '</span>' +
          '</button>';
      }).join('');

      similarHTML =
        '<div class="pt-4 border-t border-zinc-800/50">' +
          '<h4 class="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Similar Words <span class="font-normal text-zinc-600">(Levenshtein)</span></h4>' +
          '<div class="grid grid-cols-2 gap-1">' + items + '</div>' +
        '</div>';
    }

    // ── Rank ──
    var rankHTML = entry.rank
      ? '<span class="text-[10px] text-zinc-600 font-mono">COCA #' + entry.rank.toLocaleString() + '</span>'
      : '';

    // ── ECDICT Enrichment ──
    var collinsStars = ns.centralDictionary.getCollinsStars(wordId);
    var collinsHTML = collinsStars > 0
      ? '<span class="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded" title="Collins ' + collinsStars + '-star word">' + Array(collinsStars + 1).join('★') + '</span>'
      : '';

    var isOxford = ns.centralDictionary.isOxford3000(wordId);
    var oxfordHTML = isOxford
      ? '<span class="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded" title="Oxford 3000 essential word">OXF</span>'
      : '';

    var bncRank = ns.centralDictionary.getFrequencyRank(wordId);
    var bncHTML = bncRank
      ? '<span class="text-[10px] text-zinc-600 font-mono">BNC #' + bncRank.toLocaleString() + '</span>'
      : '';

    var examTags = ns.centralDictionary.getExamTags(wordId);
    var examTagsHTML = '';
    if (examTags.length > 0) {
      var tagColors = {
        ielts: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
        toefl: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
        gre: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
        cet4: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
        cet6: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
        ky: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
        gk: 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400',
        zk: 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400'
      };
      examTagsHTML = '<div class="flex flex-wrap gap-1 mt-1">' + examTags.map(function(t) {
        return '<span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ' + (tagColors[t] || 'bg-zinc-800/60 border-zinc-700 text-zinc-400') + '">' + t + '</span>';
      }).join('') + '</div>';
    }

    var englishDef = ns.centralDictionary.getEnglishDefinition(wordId);
    var englishDefHTML = englishDef
      ? '<div class="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4 mt-3">' +
          '<h4 class="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">English Definition (WordNet)</h4>' +
          '<div class="text-xs text-zinc-300 leading-relaxed max-h-40 overflow-y-auto">' + this._formatEnglishDef(englishDef) + '</div>' +
        '</div>'
      : '';

    // ── Synonyms & Antonyms ──
    let synAntHTML = '';
    const synonyms = ns.centralDictionary.getSynonyms(wordId);
    const antonyms = ns.centralDictionary.getAntonyms(wordId);
    if (synonyms.length > 0 || antonyms.length > 0) {
      let synPills = '';
      if (synonyms.length > 0) {
        synPills = synonyms.slice(0, 12).map(function(s) {
          const sId = ns.centralDictionary.getWordId(s.word);
          return sId
            ? '<button class="text-[11px] font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 rounded-full px-2.5 py-1 transition-colors wordcard-link" data-word-id="' + sId + '">' + ns.wordcard.esc(s.word) + '</button>'
            : '<span class="text-[11px] font-medium text-emerald-400/60 bg-emerald-500/5 border border-emerald-500/10 rounded-full px-2.5 py-1">' + ns.wordcard.esc(s.word) + '</span>';
        }).join('');
      }

      let antPills = '';
      if (antonyms.length > 0) {
        antPills = antonyms.slice(0, 8).map(function(a) {
          const aId = ns.centralDictionary.getWordId(a);
          return aId
            ? '<button class="text-[11px] font-medium text-rose-300 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 hover:border-rose-500/30 rounded-full px-2.5 py-1 transition-colors wordcard-link" data-word-id="' + aId + '">' + ns.wordcard.esc(a) + '</button>'
            : '<span class="text-[11px] font-medium text-rose-400/60 bg-rose-500/5 border border-rose-500/10 rounded-full px-2.5 py-1">' + ns.wordcard.esc(a) + '</span>';
        }).join('');
      }

      synAntHTML =
        '<div class="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4 mt-3">' +
          '<div class="space-y-2.5">' +
            (synonyms.length > 0
              ? '<div>' +
                  '<h4 class="text-[10px] font-semibold uppercase tracking-wider text-emerald-500/80 mb-2 flex items-center gap-1.5">' +
                    '<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>' +
                    'Synonyms' +
                    '<span class="font-normal text-zinc-600">(' + synonyms.length + ')</span>' +
                  '</h4>' +
                  '<div class="flex flex-wrap gap-1.5">' + synPills + '</div>' +
                '</div>'
              : '') +
            (antonyms.length > 0
              ? '<div>' +
                  '<h4 class="text-[10px] font-semibold uppercase tracking-wider text-rose-500/80 mb-2 flex items-center gap-1.5">' +
                    '<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7l10 10M17 7v10H7"/></svg>' +
                    'Antonyms' +
                    '<span class="font-normal text-zinc-600">(' + antonyms.length + ')</span>' +
                  '</h4>' +
                  '<div class="flex flex-wrap gap-1.5">' + antPills + '</div>' +
                '</div>'
              : '') +
          '</div>' +
        '</div>';
    }

    // ── Derivational Forms (MorphyNet) ──
    var derivHTML = '';
    var derivForms = ns.centralDictionary.getDerivationalForms(wordId);
    if (derivForms.length > 0) {
      var derivedList = derivForms.filter(function(d) { return d.isSource === 1; });
      var baseList = derivForms.filter(function(d) { return d.isSource === 0; });

      function makeDerivPill(d, colorClass) {
        var dId = ns.centralDictionary.getWordId(d.word);
        var label = d.type === 'suffix' ? '+' + d.morpheme : d.morpheme + '+';
        var dirLabel = d.isSource === 1
          ? '<span class="text-[9px] text-zinc-500">' + d.toPOS + '</span>'
          : '<span class="text-[9px] text-zinc-500">' + d.fromPOS + '</span>';
        return dId
          ? '<button class="text-[11px] font-medium ' + colorClass + ' rounded-full px-2.5 py-1 transition-colors wordcard-link flex items-center gap-1.5" data-word-id="' + dId + '">' +
              '<span>' + ns.wordcard.esc(d.word) + '</span>' +
              '<span class="text-[9px] opacity-60 font-mono">' + label + '</span>' +
              dirLabel +
            '</button>'
          : '<span class="text-[11px] font-medium ' + colorClass + ' rounded-full px-2.5 py-1 flex items-center gap-1.5 opacity-60">' +
              '<span>' + ns.wordcard.esc(d.word) + '</span>' +
              '<span class="text-[9px] font-mono">' + label + '</span>' +
              dirLabel +
            '</span>';
      }

      var derivPills = '';
      if (derivedList.length > 0) {
        var pills = derivedList.slice(0, 8).map(function(d) {
          return makeDerivPill(d, 'text-violet-300 bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 hover:border-violet-500/30');
        }).join('');
        derivPills += '<div>' +
          '<h4 class="text-[10px] font-semibold uppercase tracking-wider text-violet-500/80 mb-2 flex items-center gap-1.5">' +
            '<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>' +
            'Derived Forms' +
            '<span class="font-normal text-zinc-600">(' + derivedList.length + ')</span>' +
          '</h4>' +
          '<div class="flex flex-wrap gap-1.5">' + pills + '</div>' +
        '</div>';
      }
      if (baseList.length > 0) {
        var pills2 = baseList.slice(0, 6).map(function(d) {
          return makeDerivPill(d, 'text-sky-300 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 hover:border-sky-500/30');
        }).join('');
        derivPills += (derivPills ? '<div class="mt-2.5">' : '<div>') +
          '<h4 class="text-[10px] font-semibold uppercase tracking-wider text-sky-500/80 mb-2 flex items-center gap-1.5">' +
            '<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12"/></svg>' +
            'Base Words' +
            '<span class="font-normal text-zinc-600">(' + baseList.length + ')</span>' +
          '</h4>' +
          '<div class="flex flex-wrap gap-1.5">' + pills2 + '</div>' +
        '</div>';
      }

      derivHTML =
        '<div class="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4 mt-3">' +
          '<div class="space-y-0">' + derivPills + '</div>' +
        '</div>';
    }

    // ── Assemble full card ──
    container.innerHTML =
      '<div class="space-y-5">' +
        // Header
        '<div class="flex items-start gap-3">' +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center gap-2 mb-0.5 flex-wrap">' +
              '<h2 class="text-xl font-extrabold font-mono text-zinc-100 tracking-tight break-words">' + this.esc(entry.word) + '</h2>' +
              collinsHTML + oxfordHTML + rankHTML + bncHTML +
            '</div>' +
            (entry.phonetic ? '<p class="text-xs font-mono text-zinc-500">' + this.esc(entry.phonetic) + '</p>' : '') +
            (posTags.length > 0
              ? '<div class="flex flex-wrap items-center gap-1 mt-1.5"><span class="text-[9px] font-semibold uppercase tracking-wider text-zinc-600 mr-0.5">POS</span>' + posTags.map(p => '<span class="text-[10px] font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.5 rounded">' + this.esc(p.label) + '</span>').join('') + '</div>'
              : '') +
            (examTags.length > 0
              ? examTagsHTML.replace('<div class="flex flex-wrap gap-1 mt-1">', '<div class="flex flex-wrap items-center gap-1 mt-1"><span class="text-[9px] font-semibold uppercase tracking-wider text-zinc-600 mr-0.5">Exam</span>')
              : '') +
          '</div>' +
          '<div class="flex items-center gap-1 flex-shrink-0">' +
            '<button class="btn-wc-audio-uk text-zinc-400 hover:text-amber-400 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-amber-500/30 rounded-lg px-2.5 py-1.5 transition-all" data-word="' + this.esc(entry.word) + '" title="UK pronunciation">' +
              '<span class="text-[11px] font-bold">UK</span>' +
            '</button>' +
            '<button class="btn-wc-audio-us text-zinc-400 hover:text-blue-400 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-blue-500/30 rounded-lg px-2.5 py-1.5 transition-all" data-word="' + this.esc(entry.word) + '" title="US pronunciation">' +
              '<span class="text-[11px] font-bold">US</span>' +
            '</button>' +
          '</div>' +
        '</div>' +

        // Progress + accuracy
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ' + statusClass + '">' +
            statusIcon + statusLabel +
          '</span>' +
          (total > 0
            ? '<span class="text-[11px] text-zinc-500">Accuracy: <span class="font-bold ' + (acc >= 70 ? 'text-emerald-400' : acc >= 40 ? 'text-amber-400' : 'text-rose-400') + '">' + acc + '%</span> (' + stats.correct + '/' + total + ')</span>'
            : '<span class="text-[11px] text-zinc-600">No attempts yet</span>') +
        '</div>' +

        // Definition
        '<div class="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4">' +
          '<h4 class="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Definition</h4>' +
          '<div class="text-xs text-zinc-200 leading-relaxed">' + (defHTML || '<span class="text-zinc-500">—</span>') + '</div>' +
        '</div>' +
        englishDefHTML +
        synAntHTML +
        derivHTML +

        rootsHTML +
        sentencesHTML +
        formsHTML +
        similarHTML +
      '</div>';

    // Bind audio buttons
    container.querySelector('.btn-wc-audio-uk')?.addEventListener('click', function(e) {
      e.stopPropagation();
      ns.speech.playDictvoice(entry.word, 'uk');
    });
    container.querySelector('.btn-wc-audio-us')?.addEventListener('click', function(e) {
      e.stopPropagation();
      ns.speech.playDictvoice(entry.word, 'us');
    });

    // Bind sentence click-to-speak
    container.querySelectorAll('.sentence-item').forEach(el => {
      el.addEventListener('click', () => {
        const enText = el.querySelector('p')?.textContent?.replace(/[“”]/g, '') || '';
        ns.speech.speakSentence(enText);
      });
    });

    // Bind word-form and similar word navigation
    container.querySelectorAll('.wordcard-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = parseInt(btn.dataset.wordId);
        if (targetId && !isNaN(targetId)) {
          ns.playSFX('click');
          this.navigateTo(targetId);
        }
      });
    });
  },

  // Format definition with POS badges and sense numbering
  _formatDefinition(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const lines = raw.split('\\n').filter(l => l.trim());
    if (lines.length === 0) return '';

    const parts = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const posMatch = line.match(/^(n\.|vt\.|vi\.|adj\.|adv\.|prep\.|conj\.|pron\.|art\.|int\.|aux\.|num\.|pref\.|suf\.|abbr\.|v\.)\s*/);
      let pos = '';
      let content = line;
      if (posMatch) {
        pos = posMatch[1];
        content = line.substring(posMatch[0].length).trim();
      }

      const senseMatches = [...content.matchAll(/(\d+)\.\s*(.*?)(?=\s*\d+\.\s*|$)/g)];
      let bodyHTML = '';

      if (senseMatches.length > 1) {
        const items = senseMatches.map(m =>
          '<div class="flex gap-1.5 pl-1 py-0.5">' +
            '<span class="text-[10px] text-zinc-500 font-mono flex-shrink-0 min-w-[1rem] text-right">' + this.esc(m[1]) + '.</span>' +
            '<span class="text-xs text-zinc-300 leading-relaxed">' + this.esc(m[2]) + '</span>' +
          '</div>'
        ).join('');
        bodyHTML = '<div class="space-y-0">' + items + '</div>';
      } else if (content) {
        bodyHTML = '<p class="text-xs text-zinc-300 leading-relaxed pl-1">' + this.esc(content) + '</p>';
      }

      if (pos) {
        let sectionHTML =
          '<div class="flex items-start gap-1.5">' +
            '<span class="text-[10px] font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1 py-0.5 rounded flex-shrink-0 min-w-[2.25rem] text-center">' + this.esc(pos.replace('.', '')) + '</span>' +
            '<div class="flex-1 min-w-0">' + bodyHTML + '</div>' +
          '</div>';
        if (i > 0) parts.push('<div class="my-0.5 border-t border-zinc-800/30"></div>');
        parts.push(sectionHTML);
      } else {
        parts.push('<div class="pl-1">' + bodyHTML + '</div>');
      }
    }

    return '<div class="space-y-1">' + parts.join('') + '</div>';
  },

  // Format English WordNet definition with POS badges (same style as Chinese defs)
  _formatEnglishDef(raw) {
    if (!raw || typeof raw !== 'string') return '';
    var self = this;
    // Known WordNet POS codes — whitelist to avoid false matches on random words
    var posSet = {n:1, v:1, a:1, adj:1, r:1, adv:1, s:1, prep:1, conj:1, pron:1, int:1, interj:1, pl:1};
    var posLabels = {n:'N', v:'V', a:'ADJ', adj:'ADJ', r:'ADV', adv:'ADV', s:'ADJ', prep:'PREP', conj:'CONJ', pron:'PRON', int:'INT', interj:'INT', pl:'PL'};

    var parts = [];
    var lines = raw.split(/\\n|\n/);
    var currentPOS = '';
    var currentDefs = [];

    function flushGroup() {
      if (currentDefs.length > 0) {
        var label = posLabels[currentPOS] || currentPOS.toUpperCase();
        parts.push(
          '<div class="flex items-start gap-1.5">' +
            '<span class="text-[10px] font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1 py-0.5 rounded flex-shrink-0 min-w-[2rem] text-center">' + self.esc(label) + '</span>' +
            '<span class="text-xs text-zinc-300 leading-relaxed flex-1 min-w-0">' + self.esc(currentDefs.join('; ')) + '</span>' +
          '</div>'
        );
      }
      currentDefs = [];
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      // Match POS prefix with optional dot: "n. def", "n def", "adj. def", "adj def"
      var posMatch = line.match(/^([a-z]+)\.?\s+(.+)/);
      if (posMatch) {
        var code = posMatch[1].toLowerCase();
        if (posSet[code]) {
          flushGroup();
          currentPOS = code;
          currentDefs.push(posMatch[2]);
          continue;
        }
      }
      // Continuation line or non-POS text — append to current group
      currentDefs.push(line);
    }
    flushGroup();

    return '<div class="space-y-1">' + parts.join('') + '</div>';
  },

  esc(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
})(window.VocabGym);
