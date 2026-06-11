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
    container.innerHTML =
      '<div class="flex flex-col items-center justify-center h-full relative">' +
        // Prompt area + options (main content, unaffected by reveal)
        '<div class="flex flex-col items-center gap-4 w-full">' +
          '<div id="mc-prompt-area" class="flex flex-col items-center">' +
            '<button id="btn-mc-pronounce" class="h-16 w-16 rounded-full bg-zinc-900 border-2 border-zinc-800 hover:border-brand-500 text-zinc-400 hover:text-brand-400 flex items-center justify-center transition-all duration-300 transform active:scale-95 shadow-2xl relative group">' +
              '<div class="absolute inset-0 rounded-full bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md"></div>' +
              '<svg class="h-7 w-7 transition-transform group-hover:scale-105" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
                '<path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.75 9.5H4.5v5h3.25L12 18.75z" />' +
              '</svg>' +
            '</button>' +
            '<span class="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mt-1.5">Ctrl+Space</span>' +
          '</div>' +
          // Proficiency badge + reset — always visible, fixed-height to prevent layout shifts
          '<div class="flex flex-col items-center gap-0.5 h-10">' +
            '<span id="mc-prof-badge" class="text-[10px] font-semibold px-2 py-0.5 rounded-full border inline-block min-w-[6.5rem] text-center"></span>' +
            '<button id="btn-mc-reset-prof" class="invisible text-[10px] font-semibold text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors whitespace-nowrap" title="Reset to system proficiency">Reset</button>' +
          '</div>' +
          '<div class="w-full max-w-lg space-y-3">' +
            '<div id="mc-options-grid" class="grid grid-cols-2 gap-2.5"></div>' +
            '<div class="flex justify-center gap-3 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">' +
              '<span><kbd class="bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-mono font-bold">1-4</kbd> choose</span>' +
              '<span>or click</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // Reveal overlay — absolutely positioned at bottom, doesn't affect flow
        '<div id="mc-reveal-drawer" class="absolute bottom-0 left-0 right-0 invisible opacity-0 transition-all duration-300 bg-zinc-950/95 border-t border-zinc-800/50 rounded-b-3xl px-5 py-3 z-10">' +
          '<div class="flex flex-col items-center gap-2.5">' +
            '<div class="w-full flex items-center justify-between gap-3 flex-wrap">' +
              '<div id="mc-result-badge">' +
                '<span id="mc-result-text" class="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full"></span>' +
              '</div>' +
              '<div class="flex items-center gap-1.5 flex-wrap">' +
                '<button id="btn-prev-word" class="text-xs text-zinc-600 flex items-center gap-1 transition-colors cursor-not-allowed" title="Previous word" disabled>' +
                  '<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>Prev</button>' +
                '<button id="btn-next-word" class="text-xs text-zinc-600 flex items-center gap-1 transition-colors cursor-not-allowed" title="Next word" disabled>' +
                  'Next<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>' +
                '<button id="btn-jump-current" class="text-xs text-zinc-500 hover:text-amber-400 flex items-center gap-1 transition-colors hidden" title="Jump to current word">' +
                  '<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>Current</button>' +
                // Proficiency badge moved to main content area (always visible)
              '</div>' +
            '</div>' +
            '<button id="btn-mc-continue" class="hidden text-sm font-bold px-6 py-2.5 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-400 hover:bg-brand-500/25 active:scale-95 transition-all flex items-center gap-2">' +
              '<span>Next Word</span>' +
              '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7"/></svg>' +
            '</button>' +
            '<span class="text-[10px] text-zinc-500 font-semibold tracking-wider">or press <kbd class="bg-zinc-900 border border-zinc-800 px-1 py-0.5 rounded text-zinc-400 font-mono font-bold">Enter</kbd></span>' +
          '</div>' +
        '</div>' +
      '</div>';

    var self = this;
    document.getElementById('btn-mc-pronounce').addEventListener('click', function() {
      ns.sessionCore.playActiveWordAudio();
    });
    document.getElementById('btn-prev-word').addEventListener('click', function() { ns.sessionCore.goToPrevWord(); });
    document.getElementById('btn-next-word').addEventListener('click', function() { ns.sessionCore.goToNextWord(); });
    document.getElementById('btn-jump-current').addEventListener('click', function() { ns.sessionCore.jumpToCurrent(); });
    document.getElementById('btn-mc-continue').addEventListener('click', function() {
      ns.sessionCore.advance();
    });
    document.getElementById('btn-mc-reset-prof').addEventListener('click', function() { ns.sessionCore.resetWordProficiency(); });
  },

  _activateWord: function(wordData) {
    _answered = false;
    _subMode = ns.sessionCore.getSubMode();

    var promptArea = document.getElementById('mc-prompt-area');
    var audioBtn = document.getElementById('btn-mc-pronounce');

    if (_subMode === 'definition') {
      // "See word → pick meaning": show target word prominently
      if (promptArea) {
        promptArea.innerHTML = '<p id="mc-target-word" class="text-3xl font-bold text-zinc-100 tracking-wide font-mono">' + this._escape(wordData.word) + '</p>';
      }
    } else {
      // "Listen → pick meaning": show audio button
      if (promptArea) {
        promptArea.innerHTML =
          '<button id="btn-mc-pronounce" class="h-16 w-16 rounded-full bg-zinc-900 border-2 border-zinc-800 hover:border-brand-500 text-zinc-400 hover:text-brand-400 flex items-center justify-center transition-all duration-300 transform active:scale-95 shadow-2xl relative group">' +
            '<div class="absolute inset-0 rounded-full bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md"></div>' +
            '<svg class="h-7 w-7 transition-transform group-hover:scale-105" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
              '<path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.75 9.5H4.5v5h3.25L12 18.75z" />' +
            '</svg>' +
          '</button>';
        document.getElementById('btn-mc-pronounce').addEventListener('click', function() {
          ns.sessionCore.playActiveWordAudio();
        });
      }
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

    // Reset reveal
    var drawer = document.getElementById('mc-reveal-drawer');
    if (drawer) drawer.classList.add('invisible', 'opacity-0');

    var badge = document.getElementById('mc-result-text');
    if (badge) { badge.textContent = ''; badge.className = 'text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full'; }

    var continueBtn = document.getElementById('btn-mc-continue');
    if (continueBtn) continueBtn.classList.add('hidden');

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
    var key = e.key;
    if (key >= '1' && key <= '4') {
      e.preventDefault();
      var idx = parseInt(key) - 1;
      if (idx < _options.length) this._selectOption(idx);
      return;
    }
    if (e.key === 'Enter' && _answered) {
      e.preventDefault();
      ns.sessionCore.advance();
    }
    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      ns.sessionCore.playActiveWordAudio();
      return;
    }
    if (e.key === '`') {
      e.preventDefault();
      ns.sessionCore.cycleWordProficiency();
    }
  },

  // ── Reveal ──

  _revealAnswer: function(wordData, isCorrect, userInput, fromNav) {
    // Disable option buttons if reached via timeout/navigation (not _selectOption)
    if (!_answered) {
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

    var drawer = document.getElementById('mc-reveal-drawer');
    if (drawer) drawer.classList.remove('invisible', 'opacity-0');

    var resultBadge = document.getElementById('mc-result-text');
    if (resultBadge) {
      if (isCorrect) {
        resultBadge.textContent = 'Correct';
        resultBadge.className = 'text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
      } else {
        resultBadge.textContent = 'Incorrect';
        resultBadge.className = 'text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30';
      }
    }

    var continueBtn = document.getElementById('btn-mc-continue');
    if (continueBtn) continueBtn.classList.remove('hidden');

    this._updateProfBadge();

    var sc = ns.sessionCore;
    var cardContainer = document.getElementById('session-wordcard-content');
    var flipper = document.getElementById('session-wordcard-flipper');
    if (cardContainer && ns.wordcard && ns.wordcard._renderFullCard) {
      var reviewId = sc.isReviewing() ? sc.getReviewWordId() : ns.centralDictionary.getWordId(wordData.word);
      ns.wordcard._renderFullCard(reviewId, cardContainer);
      var card = cardContainer.querySelector('.space-y-5');
      if (card) card.classList.replace('space-y-5', 'space-y-3.5');
    }
    if (flipper && !flipper.classList.contains('flipped')) {
      requestAnimationFrame(function() {
        flipper.style.transform = 'rotateY(180deg)';
        flipper.classList.add('flipped');
      });
    }

    sc.updateNavButtons();
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
    var resetBtn = document.getElementById('btn-mc-reset-prof');
    if (!badge) return;

    var sc = ns.sessionCore;
    var prof = sc.getCurrentWordProficiency();
    var isManual = sc.isManualProficiency();

    var colors = {
      unlearned:  { bg: '', border: 'border-zinc-700', text: 'text-zinc-400' },
      learning:   { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-400' },
      reviewing:  { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
      mastered:   { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' }
    };
    var c = colors[prof] || colors.unlearned;
    badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full border inline-block min-w-[6.5rem] text-center ' + c.bg + ' ' + c.border + ' ' + c.text;
    var labels = { unlearned: 'Unlearned', learning: 'Learning', reviewing: 'Reviewing', mastered: 'Mastered' };
    badge.textContent = (isManual ? 'Manual: ' : '') + (labels[prof] || 'Unlearned');

    // Use invisible (not hidden) so the reset button always reserves space
    // — prevents layout shifts when toggling proficiency
    if (resetBtn) resetBtn.classList.toggle('invisible', !isManual);
  }
};

})(window.VocabGym);
