// VocabGym - Dictation mode handler
window.VocabGym = window.VocabGym || {};
(function(ns) {

ns.dictation = {
  _layoutMode: 'vertical',
  LAYOUT_KEY: 'english_vocab_gym_reveal_layout',

  // Hard mode state
  _hardTargetWord: '',
  _hardFilled: 0,
  _hardErrors: false,
  _hardSlotClass: '',

  init: function() {
    var self = this;
    var sc = ns.sessionCore;

    try { this._layoutMode = localStorage.getItem(this.LAYOUT_KEY) || 'vertical'; } catch (_) {}
    if (this._layoutMode === 'horizontal') this._layoutMode = 'horizontal-right';

    sc.registerMode({
      name: 'dictation',
      label: 'Dictation',
      initModeUI: function(container) { self._initModeUI(container); },
      activateWord: function(wordData) { self._activateWord(wordData); },
      handleKeydown: function(e) { self._handleKeydown(e); },
      revealAnswer: function(wordData, isCorrect, userInput, fromNav) {
        self._revealAnswer(wordData, isCorrect, userInput, fromNav);
      },
      deactivate: function() { self._deactivate(); }
    });

    document.getElementById('btn-start-session').addEventListener('click', function() { sc.startSession(); });
    document.getElementById('btn-quit-session').addEventListener('click', function() {
      if (confirm('Quit session? Progress will be saved.')) sc.quitSession();
    });
    document.getElementById('btn-replay-session').addEventListener('click', function() { sc.startSession(); });
    document.getElementById('btn-results-home').addEventListener('click', function() { sc.exitToDashboard(); });
    document.getElementById('tested-search').addEventListener('input', function() { sc.renderResultsBreakdown(); });

    document.getElementById('btn-layout-vertical').addEventListener('click', function() { self.setLayout('vertical'); });
    document.getElementById('btn-layout-horizontal-right').addEventListener('click', function() { self.setLayout('horizontal-right'); });
    document.getElementById('btn-layout-horizontal-left').addEventListener('click', function() { self.setLayout('horizontal-left'); });
    this._updateLayoutButtons();

    var savedOrder = ns.state.getSessionOrder();
    var orderRadio = document.querySelector('input[name="session-order"][value="' + savedOrder + '"]');
    if (orderRadio) orderRadio.checked = true;
    document.querySelectorAll('input[name="session-order"]').forEach(function(el) {
      el.addEventListener('change', function() {
        if (el.checked) ns.state.setSessionOrder(el.value);
      });
    });
  },

  // ── Mode UI ──

  _initModeUI: function(container) {
    var kb = ns.keybindings;

    container.innerHTML =
      '<div class="flex flex-col items-center h-full">' +
        // Top toolbar: word audio + sentence audio, centered
        '<div class="flex items-center justify-center gap-3 max-w-md mx-auto pt-1 pb-0.5 flex-shrink-0">' +
          '<button id="btn-dictation-pronounce" class="h-9 w-9 rounded-full bg-zinc-900 border border-zinc-800 hover:border-brand-500/50 text-zinc-500 hover:text-brand-400 flex items-center justify-center transition-all duration-200 transform active:scale-95 relative group flex-shrink-0" title="Replay audio (' + kb.getDisplayKey('word_audio') + ')">' +
            '<svg class="h-4 w-4 transition-transform group-hover:scale-105" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
              '<path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.75 9.5H4.5v5h3.25L12 18.75z" />' +
            '</svg>' +
          '</button>' +
          '<span class="w-9 h-9 flex items-center justify-center flex-shrink-0">' +
            '<button id="btn-sentence-audio" class="hidden h-9 w-9 rounded-full bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 text-zinc-500 hover:text-amber-400 flex items-center justify-center transition-all duration-200 transform active:scale-95" title="Play sample sentence (' + kb.getDisplayKey('sentence_audio') + ')">' +
              '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.875v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>' +
            '</button>' +
          '</span>' +
        '</div>' +

        // Main interaction area
        '<div class="flex-1 flex flex-col items-center justify-center w-full px-4 min-h-0">' +
          '<div id="feedback-ring" class="relative rounded-2xl transition-all duration-300 p-0.5 bg-zinc-800 w-full max-w-md mx-auto">' +
            '<input type="text" id="dictation-input" autocomplete="off" spellcheck="false" placeholder="Type the word you hear…" class="w-full text-center bg-zinc-950 text-xl font-bold font-mono py-4 px-5 rounded-2xl focus:outline-none text-zinc-100 tracking-wider placeholder-zinc-700" />' +
            '<div id="word-countdown" class="hidden absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-brand-500/10 border border-brand-500/20 text-brand-400 font-bold rounded-md text-xs font-mono">10s</div>' +
          '</div>' +
          '<div id="hard-slots-row" class="hidden flex items-center justify-center gap-1.5 flex-wrap py-3 w-full max-w-md mx-auto"></div>' +
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
              '<button id="btn-dictation-continue" class="text-sm font-bold px-4 py-1.5 rounded-xl bg-zinc-800/40 border border-zinc-800 text-zinc-600 cursor-not-allowed transition-all flex items-center gap-2" disabled>' +
                '<span>Answer to continue</span>' +
                '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7"/></svg>' +
              '</button>' +
              '<span class="text-[10px] text-zinc-600 font-medium">or press ' + kb.renderKbd('submit_answer') + '</span>' +
            '</div>' +
          '</div>' +
          // Proficiency badge: absolutely positioned, always visible, position never changes
          '<div id="reveal-placeholder" class="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center justify-center gap-3">' +
            '<div id="proficiency-badge" class="flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold border cursor-pointer hover:ring-1 hover:ring-white/10 transition-all duration-300 flex-shrink-0" title="Click to cycle proficiency">' +
              '<span id="prof-badge-dot" class="w-2 h-2 rounded-full flex-shrink-0"></span>' +
              '<span id="prof-badge-label" class="whitespace-nowrap">System</span>' +
            '</div>' +
            '<button id="btn-reset-proficiency" class="hidden text-[10px] font-semibold text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors" title="Reset to system-assigned proficiency">Reset</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    var self = this;
    document.getElementById('btn-dictation-pronounce').addEventListener('click', function() {
      ns.sessionCore.playActiveWordAudio();
    });
    document.getElementById('btn-sentence-audio').addEventListener('click', function() {
      self.playSentence();
    });
    document.getElementById('proficiency-badge').addEventListener('click', function() {
      ns.sessionCore.cycleWordProficiency();
    });
    document.getElementById('btn-reset-proficiency').addEventListener('click', function() { ns.sessionCore.resetWordProficiency(); });
    document.getElementById('btn-prev-word').addEventListener('click', function() { ns.sessionCore.goToPrevWord(); });
    document.getElementById('btn-next-word').addEventListener('click', function() { ns.sessionCore.goToNextWord(); });
    document.getElementById('btn-dictation-continue').addEventListener('click', function() { ns.sessionCore.advance(); });
  },

  _activateWord: function(wordData) {
    var isHard = this._isHardMode();
    var input = document.getElementById('dictation-input');
    var slotsRow = document.getElementById('hard-slots-row');
    var feedback = document.getElementById('feedback-ring');

    // Reset drawer to placeholder state (always visible, disabled before answer)
    var resultBadge = document.getElementById('reveal-result-text');
    if (resultBadge) {
      resultBadge.textContent = '—';
      resultBadge.className = 'flex-1 text-center text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full text-zinc-600 bg-zinc-800/40 border border-transparent';
    }
    var continueBtn = document.getElementById('btn-dictation-continue');
    if (continueBtn) {
      continueBtn.disabled = true;
      continueBtn.className = 'text-sm font-bold px-4 py-1.5 rounded-xl bg-zinc-800/40 border border-zinc-800 text-zinc-600 cursor-not-allowed transition-all flex items-center gap-2';
      continueBtn.style.boxShadow = '';
    }

    this.updateProficiencyBadge(ns.sessionCore.getCurrentWordProficiency(), ns.sessionCore.isManualProficiency());

    // Sentence audio button visibility
    var wordId = ns.centralDictionary.getWordId(wordData.word);
    var sentenceBtn = document.getElementById('btn-sentence-audio');
    if (sentenceBtn) {
      var hasSentence = typeof SENTENCE_DATA !== 'undefined' && SENTENCE_DATA[wordId] && SENTENCE_DATA[wordId].length > 0;
      sentenceBtn.classList.toggle('hidden', !hasSentence);
    }

    if (isHard) {
      if (input) input.classList.add('hidden');
      if (feedback) feedback.classList.add('hidden');
      if (slotsRow) slotsRow.classList.remove('hidden');

      this._hardTargetWord = wordData.word;
      this._hardFilled = 0;
      this._hardErrors = false;

      var len = wordData.word.length;
      var slotSize = len > 10 ? 'w-7 h-9 text-lg' : len > 7 ? 'w-8 h-10 text-xl' : 'w-9 h-11 text-xl';
      this._hardSlotClass = slotSize + ' rounded-lg border-2 border-zinc-700/60 bg-zinc-900/50 flex items-center justify-center font-bold font-mono text-zinc-100 transition-all duration-150';

      if (slotsRow) {
        slotsRow.innerHTML = '';
        for (var i = 0; i < len; i++) {
          var slot = document.createElement('div');
          slot.id = 'dslot-' + i;
          slot.className = this._hardSlotClass;
          slotsRow.appendChild(slot);
        }
      }
    } else {
      if (input) { input.classList.remove('hidden'); input.value = ''; input.readOnly = false; setTimeout(function() { input.focus(); }, 80); }
      if (feedback) { feedback.classList.remove('hidden'); feedback.className = 'relative rounded-2xl p-0.5 bg-zinc-800 transition-all duration-300 w-full max-w-md mx-auto'; }
      if (slotsRow) slotsRow.classList.add('hidden');
    }
  },

  _deactivate: function() {},

  // ── Hard mode helpers ──

  _isHardMode: function() {
    return ns.sessionCore.getSubMode() === 'hard';
  },

  _handleHardKey: function(letter) {
    if (this._hardFilled >= this._hardTargetWord.length) return;

    var idx = this._hardFilled;
    var expected = this._hardTargetWord[idx].toLowerCase();
    var isCorrect = letter.toLowerCase() === expected;

    if (!isCorrect) this._hardErrors = true;

    var slot = document.getElementById('dslot-' + idx);
    if (slot) {
      slot.textContent = letter;
      if (isCorrect) {
        slot.classList.add('border-emerald-500/50', 'bg-emerald-500/10', 'text-emerald-300');
      } else {
        slot.classList.add('border-rose-500/50', 'bg-rose-500/10', 'text-rose-300', 'animate-shake');
        setTimeout(function() { slot.classList.remove('animate-shake'); }, 500);
      }
    }

    this._hardFilled++;

    if (this._hardFilled >= this._hardTargetWord.length) {
      this._evaluateHard();
    }
  },

  _handleHardBackspace: function() {
    if (this._hardFilled <= 0) return;
    this._hardFilled--;
    var slot = document.getElementById('dslot-' + this._hardFilled);
    if (slot) {
      slot.textContent = '';
      slot.className = this._hardSlotClass;
    }
    this._hardErrors = false;
    for (var i = 0; i < this._hardFilled; i++) {
      var s = document.getElementById('dslot-' + i);
      if (s && s.textContent.toLowerCase() !== this._hardTargetWord[i].toLowerCase()) {
        this._hardErrors = true;
        break;
      }
    }
  },

  _evaluateHard: function() {
    var sc = ns.sessionCore;
    var wordData = ns.centralDictionary.getByWord(this._hardTargetWord);
    var elapsed = Date.now() - sc.getWordStartTime();
    var isCorrect = !this._hardErrors;

    if (isCorrect) {
      sc.onCorrectAnswer(wordData, this._hardTargetWord, elapsed);
    } else {
      var typedLetters = [];
      for (var k = 0; k < this._hardTargetWord.length; k++) {
        var sl = document.getElementById('dslot-' + k);
        typedLetters.push(sl && sl.textContent ? sl.textContent : '');
      }
      sc.onWrongAnswer(wordData, typedLetters.join(''), elapsed);
      this.updateProficiencyBadge(sc.getCurrentWordProficiency(), sc.isManualProficiency());

      for (var i = 0; i < this._hardTargetWord.length; i++) {
        var slot = document.getElementById('dslot-' + i);
        if (slot) {
          slot.textContent = this._hardTargetWord[i];
          if (slot.classList.contains('border-rose-500/50')) {
            slot.className = this._hardSlotClass.replace('border-zinc-700/60', 'border-amber-500/50')
              .replace('bg-zinc-900/50', 'bg-amber-500/10') + ' text-amber-400';
          }
        }
      }
    }

    this._revealAnswer(wordData, isCorrect, this._hardTargetWord);
    ns.state.wrongAnswerAttempted = true;
  },

  // ── Keydown handling ──

  _handleKeydown: function(e) {
    var sc = ns.sessionCore;
    if (!sc.isSessionActive()) return;
    var wordId = sc.getQueue()[sc.getIndex()];
    if (!wordId) return;
    var wordData = ns.centralDictionary.getById(wordId);
    if (!wordData) return;

    var kb = ns.keybindings;

    if (kb.matchesBinding(e, 'sentence_audio')) {
      e.preventDefault();
      this.playSentence();
      return;
    }

    if (kb.matchesBinding(e, 'word_audio')) {
      e.preventDefault();
      ns.sessionCore.playActiveWordAudio();
      return;
    }

    if (kb.matchesBinding(e, 'cycle_proficiency')) {
      e.preventDefault();
      sc.cycleWordProficiency();
      return;
    }

    if (this._isHardMode()) {
      if (ns.state.wrongAnswerAttempted) {
        if (kb.matchesBinding(e, 'submit_answer')) { e.preventDefault(); sc.advance(); }
        if (kb.matchesBinding(e, 'cycle_proficiency') || kb.matchesBinding(e, 'sentence_audio') || kb.matchesBinding(e, 'word_audio') || kb.matchesBinding(e, 'prev_word') || kb.matchesBinding(e, 'next_word')) {
        } else {
          return;
        }
      }
      if (!ns.state.wrongAnswerAttempted) {
        if (e.key === 'Backspace') { e.preventDefault(); this._handleHardBackspace(); return; }
        if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) { e.preventDefault(); this._handleHardKey(e.key); return; }
        if (!kb.matchesBinding(e, 'cycle_proficiency') && !kb.matchesBinding(e, 'sentence_audio') && !kb.matchesBinding(e, 'word_audio') && !kb.matchesBinding(e, 'prev_word') && !kb.matchesBinding(e, 'next_word') && !kb.matchesBinding(e, 'submit_answer')) return;
      }
    }

    if (kb.matchesBinding(e, 'submit_answer')) {
      e.preventDefault();
      clearInterval(sc.getTimerId());

      if (ns.state.wrongAnswerAttempted) {
        sc.advance();
        return;
      }

      var input = document.getElementById('dictation-input');
      var value = input ? input.value.trim() : '';

      if (!value || /^\s*$/.test(value)) return;

      var isCorrect = value.toLowerCase() === wordData.word.toLowerCase();
      var elapsed = Date.now() - sc.getWordStartTime();

      if (isCorrect) {
        sc.onCorrectAnswer(wordData, value, elapsed);
        input.readOnly = true;
        var feedback = document.getElementById('feedback-ring');
        if (feedback) feedback.className = 'relative rounded-2xl p-0.5 bg-emerald-500 transition-all duration-300 w-full max-w-md mx-auto';
        this._revealAnswer(wordData, true, value);
        ns.state.wrongAnswerAttempted = true;
      } else {
        sc.onWrongAnswer(wordData, value, elapsed);
        this.updateProficiencyBadge(sc.getCurrentWordProficiency(), sc.isManualProficiency());
        input.readOnly = true;
        var feedbackRing = document.getElementById('feedback-ring');
        if (feedbackRing) feedbackRing.className = 'relative rounded-2xl p-0.5 bg-rose-500 transition-all duration-300 animate-shake w-full max-w-md mx-auto';
        this._revealAnswer(wordData, false, value);
        ns.state.wrongAnswerAttempted = true;
      }
    }
  },

  // ── Reveal answer & word card ──

  _revealAnswer: function(wordData, isCorrect, userInput, fromNav) {
    var sc = ns.sessionCore;

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

    var input = document.getElementById('dictation-input');
    if (input && fromNav) {
      if (!this._isHardMode()) input.value = userInput;
      input.readOnly = true;
    }

    if (this._isHardMode() && fromNav) {
      this._hardTargetWord = wordData.word;
      if (input) input.classList.add('hidden');
      var feedback = document.getElementById('feedback-ring');
      if (feedback) feedback.classList.add('hidden');
      var slotsRow = document.getElementById('hard-slots-row');
      if (slotsRow) {
        slotsRow.classList.remove('hidden');
        slotsRow.innerHTML = '';
        var len = wordData.word.length;
        var slotSize = len > 10 ? 'w-7 h-9 text-lg' : len > 7 ? 'w-8 h-10 text-xl' : 'w-9 h-11 text-xl';
        this._hardSlotClass = slotSize + ' rounded-lg border-2 border-zinc-700/60 bg-zinc-900/50 flex items-center justify-center font-bold font-mono text-zinc-100 transition-all duration-150';
        for (var i = 0; i < len; i++) {
          var slot = document.createElement('div');
          slot.id = 'dslot-' + i;
          slot.textContent = wordData.word[i];
          var borderColor = isCorrect ? 'border-emerald-500/50' : 'border-amber-500/50';
          var bgColor = isCorrect ? 'bg-emerald-500/10' : 'bg-amber-500/10';
          var textColor = isCorrect ? 'text-emerald-300' : 'text-amber-400';
          slot.className = slotSize + ' rounded-lg border-2 ' + borderColor + ' ' + bgColor + ' flex items-center justify-center font-bold font-mono ' + textColor + ' transition-all duration-150';
          slotsRow.appendChild(slot);
        }
      }
    }

    // Enable continue button with active style
    var continueBtn = document.getElementById('btn-dictation-continue');
    if (continueBtn) {
      continueBtn.disabled = false;
      continueBtn.className = 'text-sm font-bold px-4 py-1.5 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-400 hover:bg-brand-500/25 active:scale-95 transition-all flex items-center gap-2';
      continueBtn.style.boxShadow = '0 0 14px rgba(20,184,166,0.35)';
    }
    ns.sessionCore.renderWordCard(wordData);

    this.updateProficiencyBadge(sc.getCurrentWordProficiency(), sc.isManualProficiency());
    sc.updateNavButtons();
    this._applyLayout();
  },

  // ── Proficiency badge ──

  updateProficiencyBadge: function(prof, isManual) {
    var badge = document.getElementById('proficiency-badge');
    var dot = document.getElementById('prof-badge-dot');
    var label = document.getElementById('prof-badge-label');
    var resetBtn = document.getElementById('btn-reset-proficiency');
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

  // ── Audio / sentence ──

  playSentence: function() {
    var sc = ns.sessionCore;
    var wordId = sc.isReviewing() ? sc.getReviewWordId() : sc.getQueue()[sc.getIndex()];
    if (!wordId) return;
    if (typeof SENTENCE_DATA === 'undefined') return;
    var sentences = SENTENCE_DATA[wordId];
    if (!sentences || sentences.length === 0) return;
    var s = sentences[0];
    var text = typeof s === 'string' ? s : s.en;
    ns.speech.speakSentence(text);
  },

  // ── Layout ──

  setLayout: function(mode) {
    this._layoutMode = mode;
    try { localStorage.setItem(this.LAYOUT_KEY, mode); } catch (_) {}
    this._updateLayoutButtons();
    this._applyLayout();
  },

  _updateLayoutButtons: function() {
    var active = 'bg-brand-500/15 border-brand-500/30 text-brand-400';
    var inactive = 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 hover:border-zinc-700';
    var btns = {
      vertical: document.getElementById('btn-layout-vertical'),
      'horizontal-right': document.getElementById('btn-layout-horizontal-right'),
      'horizontal-left': document.getElementById('btn-layout-horizontal-left')
    };
    for (var mode in btns) {
      if (!btns[mode]) continue;
      if (mode === this._layoutMode) {
        btns[mode].className = 'layout-toggle-btn p-1.5 rounded-md border transition-all ' + active;
      } else {
        btns[mode].className = 'layout-toggle-btn p-1.5 rounded-md border transition-all ' + inactive;
      }
    }
  },

  _applyLayout: function() {
    var wrapper = document.getElementById('dictation-layout-wrapper');
    var dictCard = document.getElementById('dictation-card');
    var wcPanel = document.getElementById('session-wordcard-panel');
    var flipper = document.getElementById('session-wordcard-flipper');
    if (!wrapper || !dictCard || !wcPanel) return;

    var isHorizontal = this._layoutMode === 'horizontal-right' || this._layoutMode === 'horizontal-left';
    var isReversed = this._layoutMode === 'horizontal-left';

    var viewH = window.innerHeight;
    var availH = viewH - 170;
    var cardH = Math.max(500, availH);

    if (isHorizontal) {
      wrapper.classList.remove('flex-col');
      wrapper.classList.add('flex-row', 'items-stretch', 'justify-center');
      wrapper.classList.toggle('flex-row-reverse', isReversed);

      dictCard.style.height = cardH + 'px';
      dictCard.style.flex = '1';
      dictCard.style.minWidth = '0';
      wcPanel.style.height = cardH + 'px';
      wcPanel.style.flex = '1';
      wcPanel.style.minWidth = '0';

      if (flipper) { flipper.style.height = '100%'; flipper.style.minHeight = ''; }
    } else {
      wrapper.classList.remove('flex-row', 'flex-row-reverse', 'items-stretch', 'justify-center');
      wrapper.classList.add('flex-col');

      dictCard.style.height = '';
      dictCard.style.flex = '';
      dictCard.style.minWidth = '';
      wcPanel.style.height = '';
      wcPanel.style.flex = '1';
      wcPanel.style.minWidth = '';
      wcPanel.style.minHeight = '0';

      if (flipper) { flipper.style.height = cardH + 'px'; flipper.style.minHeight = ''; }
    }
  }
};

})(window.VocabGym);
