// VocabGym — Mixed Mode (universal question-type system)
window.VocabGym = window.VocabGym || {};
(function(ns) {

var sc = ns.sessionCore;

ns.mixedMode = {
  _activeType: null,
  _currentWordData: null,
  _answered: false,
  _container: null,
  _weights: {},
  _typeAssignments: [],  // per-word type ID for navigation
  _wordStartTime: 0,

  // ── Init ──

  init: function() {
    var self = this;

    sc.registerMode({
      name: 'mixed',
      label: 'Mixed',
      initModeUI: function(container) { self._initModeUI(container); },
      activateWord: function(wordData) { self._activateWord(wordData); },
      handleKeydown: function(e) { self._handleKeydown(e); },
      revealAnswer: function(wordData, isCorrect, userInput, fromNav) {
        self._revealAnswer(wordData, isCorrect, userInput, fromNav);
      },
      deactivate: function() { self._deactivate(); },
      handleTimeout: function(wordData) { self._handleTimeout(wordData); }
    });

    this._weights = this._loadWeights();
  },

  // ── Weights & Presets ──

  _loadWeights: function() {
    var weights;
    try {
      var raw = localStorage.getItem('english_vocab_gym_mixed_weights');
      if (raw) weights = JSON.parse(raw);
    } catch (_) {}
    if (!weights) {
      weights = {};
      var types = ns.questionTypes.ALL;
      for (var id in types) {
        weights[id] = 5;
      }
    }
    // Seed _lastNonZero from saved weights
    for (var id in weights) {
      if (weights[id] > 0) this._lastNonZero[id] = weights[id];
    }
    return weights;
  },

  _saveWeights: function() {
    localStorage.setItem('english_vocab_gym_mixed_weights', JSON.stringify(this._weights));
  },

  getWeights: function() {
    return this._weights;
  },

  _lastNonZero: {},  // remembers user's last non-zero weight per type

  setWeight: function(typeId, value) {
    var val = Math.max(0, Math.min(10, value || 0));
    this._weights[typeId] = val;
    if (val > 0) this._lastNonZero[typeId] = val;
    this._saveWeights();
  },

  toggleType: function(typeId) {
    var current = this._weights[typeId] || 0;
    if (current > 0) {
      this._weights[typeId] = 0;
    } else {
      this._weights[typeId] = this._lastNonZero[typeId] || 5;
    }
    this._saveWeights();
    return this._weights[typeId];
  },

  // ── Mode UI ──

  _initModeUI: function(container) {
    var self = this;
    self._container = container;
    var kb = ns.keybindings;

    container.innerHTML =
      '<div class="flex flex-col items-center h-full">' +
        // Top toolbar
        '<div class="flex items-center justify-center gap-3 max-w-md mx-auto pt-1 pb-0.5 flex-shrink-0">' +
          '<button id="btn-mixed-pronounce" class="h-9 w-9 rounded-full bg-zinc-900 border border-zinc-800 hover:border-brand-500/50 text-zinc-500 hover:text-brand-400 flex items-center justify-center transition-all duration-200 transform active:scale-95 flex-shrink-0" title="Replay audio (' + kb.getDisplayKey('word_audio') + ')">' +
            '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
              '<path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.75 9.5H4.5v5h3.25L12 18.75z" />' +
            '</svg>' +
          '</button>' +
          '<span id="mixed-type-label" class="text-xs font-semibold text-zinc-500 tracking-wider uppercase"></span>' +
          '<span class="w-9 h-9 flex items-center justify-center flex-shrink-0">' +
            '<button id="btn-mixed-sentence" class="hidden h-9 w-9 rounded-full bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 text-zinc-500 hover:text-amber-400 flex items-center justify-center transition-all duration-200 transform active:scale-95" title="Play sentence (' + kb.getDisplayKey('sentence_audio') + ')">' +
              '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.875v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>' +
            '</button>' +
          '</span>' +
        '</div>' +

        // Interactive zone — question types render here
        '<div id="mixed-interactive" class="flex-1 flex flex-col items-center justify-center w-full px-4 min-h-0 max-w-md mx-auto">' +
        '</div>' +

        // Reveal drawer: always visible, fixed min-height, badge absolutely positioned
        '<div id="reveal-drawer" class="flex-shrink-0 w-full max-w-md mx-auto border-t border-zinc-800/30 h-[140px] relative">' +
          // Result content: always visible, disabled with placeholders before answer
          '<div id="reveal-result-area" class="absolute top-3 left-4 right-4">' +
            '<div class="flex items-center gap-3">' +
              '<button id="btn-prev-word" class="flex-shrink-0 text-xs text-zinc-700 flex items-center gap-1 transition-colors cursor-not-allowed px-2 py-1 rounded-md" disabled>' +
                '<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg></button>' +
              '<span id="reveal-result-text" class="flex-1 text-center text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full text-zinc-600 bg-zinc-800/40 border border-transparent">—</span>' +
              '<button id="btn-next-word" class="flex-shrink-0 text-xs text-zinc-700 flex items-center gap-1 transition-colors cursor-not-allowed px-2 py-1 rounded-md" disabled>' +
                '<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>' +
            '</div>' +
            '<div class="flex flex-col items-center gap-1 mt-2">' +
              '<button id="btn-mixed-continue" class="text-sm font-bold px-4 py-1.5 rounded-xl bg-zinc-800/40 border border-zinc-800 text-zinc-600 cursor-not-allowed transition-all flex items-center gap-2" disabled>' +
                '<span>Answer to continue</span>' +
                '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7"/></svg>' +
              '</button>' +
              '<span class="text-[10px] text-zinc-600 font-medium">or press ' + kb.renderKbd('submit_answer') + '</span>' +
            '</div>' +
          '</div>' +
          // Proficiency badge: absolutely positioned, always visible, position never changes
          '<div id="reveal-placeholder" class="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center justify-center gap-3">' +
            '<div id="proficiency-badge-mixed" class="flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold border cursor-pointer hover:ring-1 hover:ring-white/10 transition-all duration-300 flex-shrink-0" title="Click to cycle proficiency">' +
              '<span id="prof-badge-dot-mixed" class="w-2 h-2 rounded-full flex-shrink-0"></span>' +
              '<span id="prof-badge-label-mixed" class="whitespace-nowrap">System</span>' +
            '</div>' +
            '<button id="btn-reset-proficiency-mixed" class="hidden text-[10px] font-semibold text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors" title="Reset to system-assigned proficiency">Reset</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Wire events — match dictation pattern
    document.getElementById('btn-mixed-pronounce').addEventListener('click', function() {
      sc.playActiveWordAudio();
    });
    document.getElementById('btn-mixed-sentence').addEventListener('click', function() {
      self._playSentence();
    });
    document.getElementById('proficiency-badge-mixed').addEventListener('click', function() {
      sc.cycleWordProficiency();
    });
    document.getElementById('btn-reset-proficiency-mixed').addEventListener('click', function() { sc.resetWordProficiency(); });
    document.getElementById('btn-prev-word').addEventListener('click', function() { sc.goToPrevWord(); });
    document.getElementById('btn-next-word').addEventListener('click', function() { sc.goToNextWord(); });
    document.getElementById('btn-mixed-continue').addEventListener('click', function() { sc.advance(); });

    self.updateProficiencyBadge(sc.getCurrentWordProficiency(), sc.isManualProficiency());
  },

  _activateWord: function(wordData) {
    var self = this;
    self._currentWordData = wordData;
    self._answered = false;
    self._wordStartTime = Date.now();

    // Select question type for this word
    var prevTypeId = self._typeAssignments.length > 0
      ? self._typeAssignments[self._typeAssignments.length - 1]
      : null;
    var type = self._selectType(wordData, prevTypeId);
    self._activeType = type;
    self._typeAssignments.push(type.id);

    // Update type label
    var labelEl = document.getElementById('mixed-type-label');
    if (labelEl) labelEl.textContent = type.label;

    // Show/hide pronounce button based on audio-dependent type
    var pronounceBtn = document.getElementById('btn-mixed-pronounce');
    if (pronounceBtn) {
      var needsAudio = type.id === 'spelling' || type.id === 'mc_audio';
      pronounceBtn.style.visibility = needsAudio ? '' : 'hidden';
    }

    // Show/hide sentence audio button
    var sentenceBtn = document.getElementById('btn-mixed-sentence');
    if (sentenceBtn) {
      var hasSentence = window.SENTENCE_DATA && SENTENCE_DATA[wordData.id] && SENTENCE_DATA[wordData.id].length > 0;
      sentenceBtn.classList.toggle('hidden', !hasSentence);
    }

    // Build context and activate type
    var interactive = document.getElementById('mixed-interactive');
    if (!interactive) return;

    var ctx = self._buildCtx(wordData);
    type.activate(interactive, wordData, ctx);

    // Reset drawer to placeholder state (always visible, disabled before answer)
    var resultBadge = document.getElementById('reveal-result-text');
    if (resultBadge) {
      resultBadge.textContent = '—';
      resultBadge.className = 'flex-1 text-center text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full text-zinc-600 bg-zinc-800/40 border border-transparent';
    }
    var continueBtn = document.getElementById('btn-mixed-continue');
    if (continueBtn) {
      continueBtn.disabled = true;
      continueBtn.className = 'text-sm font-bold px-4 py-1.5 rounded-xl bg-zinc-800/40 border border-zinc-800 text-zinc-600 cursor-not-allowed transition-all flex items-center gap-2';
      continueBtn.style.boxShadow = '';
    }

    self.updateProficiencyBadge(sc.getCurrentWordProficiency(), sc.isManualProficiency());

    // Update keyboard hints
    if (sc.updateKeyboardHints) sc.updateKeyboardHints();
  },

  _buildCtx: function(wordData) {
    var self = this;
    return {
      wordId: wordData.id,
      answer: function(isCorrect, userInput) {
        self._onAnswer(wordData, isCorrect, userInput);
      },
      isReviewing: function() {
        return self._answered;
      },
      escHtml: ns.wordcard ? ns.wordcard.esc : function(s) { return String(s).replace(/</g, '&lt;'); },
      speech: ns.speech,
      dictionary: ns.centralDictionary,
      sessionCore: sc
    };
  },

  // ── Keyboard ──

  _handleKeydown: function(e) {
    var self = this;

    // Global keys (handled by session-core's keydown dispatch)
    // These are handled by namespace dispatcher in vocab-gym.js
    // Here we handle type-specific keys

    if (self._activeType && self._activeType.handleKeydown) {
      if (self._activeType.handleKeydown(e, self._buildCtx(self._currentWordData))) {
        return;
      }
    }

    // Submit/advance via keybinding registry (syncs with custom keybindings)
    if (self._answered && ns.keybindings && ns.keybindings.matchesBinding(e, 'submit_answer')) {
      e.preventDefault();
      sc.advance();
    }
  },

  // ── Answer ──

  _onAnswer: function(wordData, isCorrect, userInput) {
    if (this._answered) return;
    this._answered = true;
    this._wordStartTime = this._wordStartTime || Date.now();

    var elapsed = Date.now() - this._wordStartTime;

    if (isCorrect) {
      sc.onCorrectAnswer(wordData, userInput, elapsed);
    } else {
      sc.onWrongAnswer(wordData, userInput, elapsed);
    }

    this._revealAnswer(wordData, isCorrect, userInput, false);
    ns.state.wrongAnswerAttempted = true;
  },

  _handleTimeout: function(wordData) {
    if (this._answered) return;
    // Disable active type
    if (this._activeType && this._activeType.destroy) {
      this._activeType.destroy();
    }
    this._revealAnswer(wordData, false, '');
  },

  _revealAnswer: function(wordData, isCorrect, userInput, fromNav) {
    var self = this;

    // Update result badge
    var resultBadge = document.getElementById('reveal-result-text');
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

    // Enable continue button with active style
    var continueBtn = document.getElementById('btn-mixed-continue');
    if (continueBtn) {
      continueBtn.disabled = false;
      continueBtn.className = 'text-sm font-bold px-4 py-1.5 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-400 hover:bg-brand-500/25 active:scale-95 transition-all flex items-center gap-2';
      continueBtn.style.boxShadow = '0 0 14px rgba(20,184,166,0.35)';
    }

    sc.renderWordCard(wordData);

    self.updateProficiencyBadge(sc.getCurrentWordProficiency(), sc.isManualProficiency());
    sc.updateNavButtons();
  },

  _deactivate: function() {
    if (this._activeType && this._activeType.destroy) {
      this._activeType.destroy();
    }
    this._activeType = null;
    this._currentWordData = null;
    this._answered = false;
    this._typeAssignments = [];
    this._container = null;
  },

  // ── Type Selection ──

  _selectType: function(wordData, prevTypeId) {
    var types = ns.questionTypes.ALL;
    var candidates = [];

    for (var id in types) {
      var w = this._weights[id];
      if (!w || w <= 0) continue;
      if (!types[id].canRender(wordData.id, wordData)) continue;
      candidates.push({ type: types[id], weight: w });
    }

    // Fallback: spelling always works
    if (candidates.length === 0) {
      return types.spelling || types[Object.keys(types)[0]];
    }

    // Avoid consecutive same type (only if >1 candidate)
    if (candidates.length > 1 && prevTypeId) {
      var filtered = candidates.filter(function(c) { return c.type.id !== prevTypeId; });
      if (filtered.length > 0) candidates = filtered;
    }

    // Weighted random
    var total = 0;
    for (var i = 0; i < candidates.length; i++) {
      total += candidates[i].weight;
    }
    var r = Math.random() * total;
    var cum = 0;
    for (var i = 0; i < candidates.length; i++) {
      cum += candidates[i].weight;
      if (r < cum) return candidates[i].type;
    }
    return candidates[0].type;
  },

  // ── Proficiency Badge ──

  updateProficiencyBadge: function(prof, isManual) {
    var badge = document.getElementById('proficiency-badge-mixed');
    var dot = document.getElementById('prof-badge-dot-mixed');
    var label = document.getElementById('prof-badge-label-mixed');
    var resetBtn = document.getElementById('btn-reset-proficiency-mixed');
    if (!badge || !dot || !label) return;

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
  },

  // ── Sentence Audio ──

  _playSentence: function() {
    var wordData = this._currentWordData;
    if (!wordData) return;
    var sentData = window.SENTENCE_DATA && SENTENCE_DATA[wordData.id];
    if (!sentData || sentData.length === 0) return;
    var sentence = sentData[0].en;
    if (!sentence) return;

    if (ns.speech && ns.speech.speakSentence) {
      ns.speech.speakSentence(sentence);
    }
  },

  // ── Keyboard Hints (called by session-core) ──

  getKeyboardHints: function() {
    var kb = ns.keybindings;
    var hints = [];

    if (this._activeType) {
      var id = this._activeType.id;
      if (id === 'spelling' || id === 'phonetic') {
        hints.push({ ids: ['submit_answer'], desc: 'Submit answer' });
      } else {
        hints.push({ ids: ['mc_option_1', 'mc_option_2', 'mc_option_3', 'mc_option_4'], desc: 'Select option' });
        if (this._answered) {
          hints.push({ ids: ['submit_answer'], desc: 'Advance' });
        }
      }
    }

    hints.push({ ids: ['cycle_proficiency'], desc: 'Cycle proficiency' });
    // Only show audio hint for audio-dependent types
    if (this._activeType && (this._activeType.id === 'spelling' || this._activeType.id === 'mc_audio')) {
      hints.push({ ids: ['word_audio'], desc: 'Replay audio' });
    }

    // Sentence audio hint if available
    var wordData = this._currentWordData;
    if (wordData && window.SENTENCE_DATA && SENTENCE_DATA[wordData.id]) {
      hints.push({ ids: ['sentence_audio'], desc: 'Play sentence' });
    }

    hints.push({ rawKeys: 'Esc', desc: 'Quit' });
    return hints;
  }
};

})(window.VocabGym);
