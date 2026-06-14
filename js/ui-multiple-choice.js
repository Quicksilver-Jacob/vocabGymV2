// VocabGym - Multiple Choice mode handler
window.VocabGym = window.VocabGym || {};
(function(ns) {

var _options = [];       // [{text, isCorrect}] — all definition text
var _answered = false;
var _subMode = 'audio';  // 'audio' (listen→pick meaning) | 'definition' (see word→pick meaning)

ns.multipleChoice = {

  init: function() {
    var self = this;
    var sc = ns.sessionCore;

    sc.registerMode({
      name: 'multipleChoice',
      label: 'Multiple Choice',
      initModeUI: function(container) { self._initModeUI(container); },
      activateWord: function(wordData) { self._activateWord(wordData); },
      handleKeydown: function(e) { self._handleKeydown(e); },
      revealAnswer: function(wordData, isCorrect, userInput, fromNav) {
        self._revealAnswer(wordData, isCorrect, userInput, fromNav);
      },
      deactivate: function() { self._deactivate(); }
    });
  },

  // ── Mode UI ──

  _initModeUI: function(container) {
    var kb = ns.keybindings;
    container.innerHTML =
      '<div class="flex flex-col items-center h-full">' +
        // Top toolbar: prompt area only, centered
        '<div class="flex items-center justify-center gap-3 max-w-lg mx-auto pt-1 pb-0.5 flex-shrink-0">' +
          '<span id="mc-prompt-wrapper" class="flex items-center gap-2 flex-shrink-0 min-w-[60px] justify-center"></span>' +
        '</div>' +

        // Main: options grid
        '<div class="flex-1 flex flex-col items-center justify-center w-full px-4 min-h-0">' +
          '<div id="mc-options-grid" class="grid grid-cols-2 gap-2.5 w-full max-w-lg mx-auto"></div>' +
        '</div>' +

        // Reveal drawer: always visible, badge absolutely positioned
        '<div id="mc-reveal-drawer" class="flex-shrink-0 w-full max-w-lg mx-auto border-t border-zinc-800/30 h-[140px] relative">' +
          // Result content: always visible, disabled with placeholders before answer
          '<div id="mc-result-area" class="absolute top-3 left-4 right-4">' +
            '<div class="flex items-center gap-3">' +
              '<button id="btn-prev-word" class="flex-shrink-0 text-xs text-zinc-700 flex items-center gap-1 transition-colors cursor-not-allowed px-2 py-1 rounded-md" disabled>' +
                '<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg></button>' +
              '<span id="mc-result-text" class="flex-1 text-center text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full text-zinc-600 bg-zinc-800/40 border border-transparent">—</span>' +
              '<button id="btn-next-word" class="flex-shrink-0 text-xs text-zinc-700 flex items-center gap-1 transition-colors cursor-not-allowed px-2 py-1 rounded-md" disabled>' +
                '<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>' +
            '</div>' +
            '<div class="flex flex-col items-center gap-1 mt-2">' +
              '<button id="btn-mc-continue" class="text-sm font-bold px-4 py-1.5 rounded-xl bg-zinc-800/40 border border-zinc-800 text-zinc-600 cursor-not-allowed transition-all flex items-center gap-2" disabled>' +
                '<span>Answer to continue</span>' +
                '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7"/></svg>' +
              '</button>' +
              '<span class="text-[10px] text-zinc-600 font-medium">or press ' + kb.renderKbd('submit_answer') + '</span>' +
            '</div>' +
          '</div>' +
          // Proficiency badge: absolutely positioned, always visible, position never changes
          '<div id="mc-reveal-placeholder" class="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center justify-center gap-3">' +
            '<div id="mc-prof-badge" class="flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold border cursor-pointer hover:ring-1 hover:ring-white/10 transition-all duration-300 flex-shrink-0" title="Click to cycle proficiency">' +
              '<span id="mc-prof-badge-dot" class="w-2 h-2 rounded-full flex-shrink-0"></span>' +
              '<span id="mc-prof-badge-label" class="whitespace-nowrap">System</span>' +
            '</div>' +
            '<button id="btn-mc-reset-prof" class="hidden text-[10px] font-semibold text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors" title="Reset to system-assigned proficiency">Reset</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    var self = this;
    document.getElementById('mc-prof-badge').addEventListener('click', function() {
      ns.sessionCore.cycleWordProficiency();
    });
    document.getElementById('btn-prev-word').addEventListener('click', function() { ns.sessionCore.goToPrevWord(); });
    document.getElementById('btn-next-word').addEventListener('click', function() { ns.sessionCore.goToNextWord(); });
    document.getElementById('btn-mc-continue').addEventListener('click', function() {
      ns.sessionCore.advance();
    });
    document.getElementById('btn-mc-reset-prof').addEventListener('click', function() { ns.sessionCore.resetWordProficiency(); });
  },

  _activateWord: function(wordData) {
    _answered = false;
    _subMode = ns.sessionCore.getSubMode();

    // Reset drawer to placeholder state (always visible, disabled before answer)
    var resultBadge = document.getElementById('mc-result-text');
    if (resultBadge) {
      resultBadge.textContent = '—';
      resultBadge.className = 'flex-1 text-center text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full text-zinc-600 bg-zinc-800/40 border border-transparent';
    }
    var continueBtn = document.getElementById('btn-mc-continue');
    if (continueBtn) {
      continueBtn.disabled = true;
      continueBtn.className = 'text-sm font-bold px-4 py-1.5 rounded-xl bg-zinc-800/40 border border-zinc-800 text-zinc-600 cursor-not-allowed transition-all flex items-center gap-2';
      continueBtn.style.boxShadow = '';
    }

    this._updateProfBadge();

    var promptArea = document.getElementById('mc-prompt-wrapper');
    var kb = ns.keybindings;

    if (_subMode === 'definition') {
      if (promptArea) {
        promptArea.innerHTML =
          '<span id="mc-target-word" class="text-2xl font-bold text-zinc-100 tracking-wide font-mono">' + this._escape(wordData.word) + '</span>' +
          '<button id="btn-mc-pronounce" class="h-8 w-8 rounded-full bg-zinc-900 border border-zinc-800 hover:border-brand-500/50 text-zinc-500 hover:text-brand-400 flex items-center justify-center transition-all duration-200 transform active:scale-95 flex-shrink-0" title="Replay audio (' + kb.getDisplayKey('word_audio') + ')">' +
            '<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
              '<path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.75 9.5H4.5v5h3.25L12 18.75z" />' +
            '</svg>' +
          '</button>';
      }
    } else {
      if (promptArea) {
        promptArea.innerHTML =
          '<button id="btn-mc-pronounce" class="h-9 w-9 rounded-full bg-zinc-900 border border-zinc-800 hover:border-brand-500/50 text-zinc-500 hover:text-brand-400 flex items-center justify-center transition-all duration-200 transform active:scale-95 flex-shrink-0" title="Replay audio (' + kb.getDisplayKey('word_audio') + ')">' +
            '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
              '<path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.75 9.5H4.5v5h3.25L12 18.75z" />' +
            '</svg>' +
          '</button>';
      }
    }
    // Re-bind audio button click
    var audioBtn = document.getElementById('btn-mc-pronounce');
    if (audioBtn) {
      audioBtn.addEventListener('click', function() {
        ns.sessionCore.playActiveWordAudio();
      });
    }

    // Both sub-modes: options are definitions (correct + 3 distractors)
    _options = this._generateDefinitionOptions(wordData);

    // Update proficiency badge for current word
    if (document.getElementById('mc-prof-badge')) this._updateProfBadge();

    // Build option buttons
    var grid = document.getElementById('mc-options-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var self = this;
    _options.forEach(function(opt, idx) {
      var btn = document.createElement('button');
      btn.className = 'mc-option-btn w-full text-left px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-brand-500/50 hover:bg-zinc-900 text-zinc-300 text-sm leading-relaxed transition-all duration-200 flex items-start gap-2';
      btn.setAttribute('data-idx', idx);
      btn.innerHTML = '<span class="text-xs font-mono text-zinc-600 w-5 flex-shrink-0 mt-0.5">' + (idx + 1) + '</span><span class="min-w-0 break-words">' + self._escape(opt.text) + '</span>';
      btn.addEventListener('click', function() { self._selectOption(idx); });
      grid.appendChild(btn);
    });

    ns.sessionCore.updateNavButtons();
  },

  _deactivate: function() {},

  // ── Definition-distractor generation ──

  _generateDefinitionOptions: function(targetEntry) {
    var targetDef = this._extractFirstDefLine(targetEntry.definition);
    var allEntries = ns.centralDictionary.getAllEntries();
    var definitions = [];
    var usedDefs = {};
    usedDefs[targetDef.toLowerCase().trim()] = true;

    var indices = [];
    var total = allEntries.length;
    var maxChecks = Math.min(200, total);
    for (var i = 0; i < maxChecks; i++) {
      indices.push(Math.floor(Math.random() * total));
    }

    for (var j = 0; j < indices.length && definitions.length < 3; j++) {
      var e = allEntries[indices[j]];
      if (e.id === targetEntry.id) continue;
      var def = this._extractFirstDefLine(e.definition);
      if (!def || usedDefs[def.toLowerCase().trim()]) continue;
      var defNorm = def.toLowerCase().trim();
      var targNorm = targetDef.toLowerCase().trim();
      if (defNorm.length > 3 && targNorm.length > 3 && defNorm.substring(0, 3) === targNorm.substring(0, 3)) continue;
      definitions.push(def);
      usedDefs[defNorm] = true;
    }

    var options = definitions.slice(0, 3).map(function(d) {
      return { text: d, isCorrect: false };
    });
    options.push({ text: targetDef, isCorrect: true });
    this._shuffle(options);
    return options;
  },

  _extractFirstDefLine: function(def) {
    if (!def || typeof def !== 'string') return '';
    var parts = def.split(/\\n|；|;/);
    var first = parts[0].trim();
    first = first.replace(/^[a-z]+\.[\s]*/i, '').trim();
    if (first.length > 80) first = first.substring(0, 80) + '…';
    return first || def.substring(0, 80);
  },

  _shuffle: function(arr) {
    for (var m = arr.length - 1; m > 0; m--) {
      var n = Math.floor(Math.random() * (m + 1));
      var tmp = arr[m]; arr[m] = arr[n]; arr[n] = tmp;
    }
  },

  // ── Selection handling ──

  _selectOption: function(idx) {
    if (_answered || !ns.sessionCore.isSessionActive()) return;
    _answered = true;

    var sc = ns.sessionCore;
    clearInterval(sc.getTimerId());
    var wordData = ns.centralDictionary.getById(sc.getQueue()[sc.getIndex()]);
    if (!wordData) return;

    var isCorrect = _options[idx].isCorrect;
    var userInput = _options[idx].text;
    var elapsed = Date.now() - sc.getWordStartTime();

    var btns = document.querySelectorAll('.mc-option-btn');
    btns.forEach(function(btn, i) {
      btn.disabled = true;
      btn.classList.remove('hover:border-brand-500/50', 'hover:bg-zinc-900');
      if (_options[i].isCorrect) {
        btn.classList.add('border-emerald-500/50', 'bg-emerald-500/10', 'text-emerald-300');
      } else if (i === idx && !_options[i].isCorrect) {
        btn.classList.add('border-rose-500/50', 'bg-rose-500/10', 'text-rose-300');
      } else {
        btn.classList.add('opacity-40');
      }
    });

    if (isCorrect) {
      sc.onCorrectAnswer(wordData, userInput, elapsed);
    } else {
      sc.onWrongAnswer(wordData, userInput, elapsed);
    }

    this._revealAnswer(wordData, isCorrect, userInput);
    ns.state.wrongAnswerAttempted = true;
  },

  _handleKeydown: function(e) {
    var kb = ns.keybindings;
    for (var i = 1; i <= 4; i++) {
      if (kb.matchesBinding(e, 'mc_option_' + i)) {
        e.preventDefault();
        if (i - 1 < _options.length) this._selectOption(i - 1);
        return;
      }
    }
    if (kb.matchesBinding(e, 'submit_answer') && _answered) {
      e.preventDefault();
      ns.sessionCore.advance();
    }
    if (kb.matchesBinding(e, 'word_audio')) {
      e.preventDefault();
      ns.sessionCore.playActiveWordAudio();
      return;
    }
    if (kb.matchesBinding(e, 'cycle_proficiency')) {
      e.preventDefault();
      ns.sessionCore.cycleWordProficiency();
    }
  },

  // ── Reveal ──

  _revealAnswer: function(wordData, isCorrect, userInput, fromNav) {
    if (!_answered || fromNav) {
      _answered = true;
      var btns = document.querySelectorAll('.mc-option-btn');
      btns.forEach(function(btn, i) {
        btn.disabled = true;
        btn.classList.remove('hover:border-brand-500/50', 'hover:bg-zinc-900');
        if (_options[i] && _options[i].isCorrect) {
          btn.classList.add('border-emerald-500/50', 'bg-emerald-500/10', 'text-emerald-300');
        } else {
          btn.classList.add('opacity-40');
        }
      });
    }

    var resultBadge = document.getElementById('mc-result-text');
    if (resultBadge) {
      if (isCorrect) {
        resultBadge.textContent = 'Correct';
        resultBadge.className = 'flex-1 text-center text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
        resultBadge.style.boxShadow = '0 0 12px rgba(52,211,153,0.30)';
      } else {
        resultBadge.textContent = 'Incorrect';
        resultBadge.className = 'flex-1 text-center text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30';
        resultBadge.style.boxShadow = '0 0 12px rgba(251,113,133,0.30)';
      }
    }

    var continueBtn = document.getElementById('btn-mc-continue');
    if (continueBtn) {
      continueBtn.disabled = false;
      continueBtn.className = 'text-sm font-bold px-4 py-1.5 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-400 hover:bg-brand-500/25 active:scale-95 transition-all flex items-center gap-2';
      continueBtn.style.boxShadow = '0 0 14px rgba(20,184,166,0.35)';
    }

    this._updateProfBadge();

    ns.sessionCore.renderWordCard(wordData);

    ns.sessionCore.updateNavButtons();
    if (ns.dictation && ns.dictation._applyLayout) ns.dictation._applyLayout();
  },

  _escape: function(text) {
    if (typeof text !== 'string') return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // ── Proficiency badge ──

  _updateProfBadge: function() {
    var badge = document.getElementById('mc-prof-badge');
    var dot = document.getElementById('mc-prof-badge-dot');
    var label = document.getElementById('mc-prof-badge-label');
    var resetBtn = document.getElementById('btn-mc-reset-prof');
    if (!badge || !dot || !label) return;

    var sc = ns.sessionCore;
    var prof = sc.getCurrentWordProficiency();
    var isManual = sc.isManualProficiency();

    var colors = {
      unlearned:  { bg: 'bg-zinc-800/60', border: 'border-zinc-700', text: 'text-zinc-400', dot: 'bg-zinc-500' },
      learning:   { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-400', dot: 'bg-sky-400' },
      reviewing:  { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-400' },
      mastered:   { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400' }
    };
    var c = colors[prof] || colors.unlearned;
    badge.className = 'flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold border cursor-pointer hover:ring-1 hover:ring-white/10 transition-all duration-300 flex-shrink-0 ' + c.bg + ' ' + c.border + ' ' + c.text;
    dot.className = 'w-2 h-2 rounded-full flex-shrink-0 ' + c.dot;
    var labels = { unlearned: 'Unlearned', learning: 'Learning', reviewing: 'Reviewing', mastered: 'Mastered' };
    label.textContent = (isManual ? 'Manual: ' : '') + (labels[prof] || 'Unlearned');

    if (resetBtn) {
      resetBtn.classList.toggle('hidden', !isManual);
    }
  }
};

})(window.VocabGym);
