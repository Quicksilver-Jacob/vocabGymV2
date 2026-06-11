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
    container.innerHTML =
      '<div class="flex flex-col items-center justify-between h-full">' +
        '<div class="flex items-end justify-center flex-1 pb-2">' +
          '<div class="flex flex-col items-center">' +
            '<button id="btn-dictation-pronounce" class="h-20 w-20 rounded-full bg-zinc-900 border-2 border-zinc-800 hover:border-brand-500 text-zinc-400 hover:text-brand-400 flex items-center justify-center transition-all duration-300 transform active:scale-95 shadow-2xl relative group">' +
              '<div class="absolute inset-0 rounded-full bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md"></div>' +
              '<svg class="h-9 w-9 transition-transform group-hover:scale-105" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
                '<path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.75 9.5H4.5v5h3.25L12 18.75z" />' +
              '</svg>' +
            '</button>' +
            '<span class="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mt-1.5">Ctrl+Space</span>' +
            '<span id="sentence-hint" class="hidden text-[10px] font-medium text-zinc-500">F2 for example</span>' +
          '</div>' +
        '</div>' +
        '<div class="flex-shrink-0 flex flex-col items-center w-full">' +
          // Proficiency badge area — fixed height, elements always reserve space to prevent layout shifts
          '<div class="flex flex-col items-center gap-0.5 h-10">' +
            '<div id="proficiency-badge" class="transition-all duration-300 flex items-center gap-1.5 px-3 py-1 rounded-full h-6 text-xs font-bold border min-w-[6.5rem] justify-center">' +
              '<span id="prof-badge-dot" class="w-1.5 h-1.5 rounded-full flex-shrink-0"></span>' +
              '<span id="prof-badge-label" class="whitespace-nowrap">System</span>' +
            '</div>' +
            '<button id="btn-reset-proficiency" class="invisible text-[10px] font-semibold text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors h-4" title="Reset to system-assigned proficiency">Reset</button>' +
          '</div>' +
          '<div class="w-full max-w-md space-y-1.5">' +
            '<div id="feedback-ring" class="relative rounded-2xl transition-all duration-300 p-0.5 bg-zinc-800">' +
              '<input type="text" id="dictation-input" autocomplete="off" spellcheck="false" placeholder="Type the word and press Enter..." class="w-full text-center bg-zinc-950 text-xl font-bold font-mono py-3 px-5 rounded-2xl focus:outline-none text-zinc-100 tracking-wider placeholder-zinc-700" />' +
              '<div id="word-countdown" class="hidden absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-brand-500/10 border border-brand-500/20 text-brand-400 font-bold rounded-md text-xs font-mono">10s</div>' +
            '</div>' +
            // Hard mode: letter slots (standalone, not wrapped in feedback ring)
            '<div id="hard-slots-row" class="hidden flex items-center justify-center gap-1.5 flex-wrap py-2"></div>' +
            '<div class="flex justify-between items-center text-[10px] text-zinc-500 px-1 font-semibold uppercase tracking-wider">' +
              '<span><kbd class="bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-mono font-bold">`</kbd> prof.</span>' +
              '<span id="dict-input-hint">Enter</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="reveal-drawer" class="flex-shrink-0 w-full max-w-md border-t border-zinc-800/30 pt-3 invisible opacity-0 transition-all duration-300 flex-1 flex items-start justify-center">' +
          '<div class="w-full">' +
            '<div class="flex items-center justify-between gap-3 flex-wrap">' +
              '<div id="reveal-result-badge">' +
                '<span id="reveal-result-text" class="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full"></span>' +
              '</div>' +
              '<div class="flex items-center gap-1.5 flex-wrap">' +
                '<button id="btn-prev-word" class="text-xs text-zinc-600 flex items-center gap-1 transition-colors cursor-not-allowed" title="Previous word" disabled>' +
                  '<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>Prev</button>' +
                '<button id="btn-next-word" class="text-xs text-zinc-600 flex items-center gap-1 transition-colors cursor-not-allowed" title="Next word" disabled>' +
                  'Next<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>' +
                '<button id="btn-jump-current" class="text-xs text-zinc-500 hover:text-amber-400 flex items-center gap-1 transition-colors hidden" title="Jump to current word">' +
                  '<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>Current</button>' +
              '</div>' +
            '</div>' +
            '<div id="press-enter-hint" class="text-center text-xs text-brand-400 font-bold tracking-widest uppercase animate-bounce-soft mt-2">' +
              'Press Enter to advance</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    var self = this;
    document.getElementById('btn-dictation-pronounce').addEventListener('click', function() {
      ns.sessionCore.playActiveWordAudio();
    });
    document.getElementById('btn-reset-proficiency').addEventListener('click', function() { ns.sessionCore.resetWordProficiency(); });
    document.getElementById('btn-prev-word').addEventListener('click', function() { ns.sessionCore.goToPrevWord(); });
    document.getElementById('btn-next-word').addEventListener('click', function() { ns.sessionCore.goToNextWord(); });
    document.getElementById('btn-jump-current').addEventListener('click', function() { ns.sessionCore.jumpToCurrent(); });
  },

  _activateWord: function(wordData) {
    var isHard = this._isHardMode();
    var input = document.getElementById('dictation-input');
    var slotsRow = document.getElementById('hard-slots-row');
    var hint = document.getElementById('dict-input-hint');
    var feedback = document.getElementById('feedback-ring');

    if (isHard) {
      if (input) input.classList.add('hidden');
      if (feedback) feedback.classList.add('hidden');
      if (slotsRow) slotsRow.classList.remove('hidden');
      if (hint) hint.textContent = 'Type letter by letter';

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
      if (feedback) { feedback.classList.remove('hidden'); feedback.className = 'relative rounded-2xl p-0.5 bg-zinc-800 transition-all duration-300'; }
      if (slotsRow) slotsRow.classList.add('hidden');
      if (hint) hint.textContent = 'Enter';
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
    // Recalculate _hardErrors from remaining filled slots
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
      sc.onWrongAnswer(wordData, this._hardTargetWord, elapsed);
      this.updateProficiencyBadge(sc.getCurrentWordProficiency(), sc.isManualProficiency());

      // Repaint all slots with correct letters, highlighting errors in amber
      for (var i = 0; i < this._hardTargetWord.length; i++) {
        var slot = document.getElementById('dslot-' + i);
        if (slot) {
          slot.textContent = this._hardTargetWord[i];
          if (slot.classList.contains('border-rose-500/50')) {
            // Was typed wrong — show correct letter in amber
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

    if (e.key === 'F2') {
      e.preventDefault();
      this.playSentence();
      return;
    }

    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      ns.sessionCore.playActiveWordAudio();
      return;
    }

    if (e.key === '`') {
      e.preventDefault();
      sc.cycleWordProficiency();
      return;
    }

    // Hard mode: letter-by-letter
    if (this._isHardMode()) {
      if (ns.state.wrongAnswerAttempted) {
        if (e.key === 'Enter') { e.preventDefault(); sc.advance(); }
        // Let backtick, F2, Ctrl+Space, arrow keys through even after answer
        if (e.key === '`' || e.key === 'F2' || (e.ctrlKey && e.key === ' ') || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          // fall through to handlers below
        } else {
          return;
        }
      }
      if (!ns.state.wrongAnswerAttempted) {
        if (e.key === 'Backspace') { e.preventDefault(); this._handleHardBackspace(); return; }
        if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) { e.preventDefault(); this._handleHardKey(e.key); return; }
        if (e.key !== '`' && e.key !== 'F2' && !(e.ctrlKey && e.key === ' ') && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Enter') return;
      }
    }

    // Standard mode
    if (e.key === 'Enter') {
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
        if (feedback) feedback.className = 'relative rounded-2xl p-0.5 bg-emerald-500 transition-all duration-300';
        this._revealAnswer(wordData, true, value);
        ns.state.wrongAnswerAttempted = true;
      } else {
        sc.onWrongAnswer(wordData, value, elapsed);
        this.updateProficiencyBadge(sc.getCurrentWordProficiency(), sc.isManualProficiency());
        input.readOnly = true;
        var feedbackRing = document.getElementById('feedback-ring');
        if (feedbackRing) feedbackRing.className = 'relative rounded-2xl p-0.5 bg-rose-500 transition-all duration-300 animate-shake';
        this._revealAnswer(wordData, false, value);
        ns.state.wrongAnswerAttempted = true;
      }
    }
  },

  // ── Reveal answer & word card ──

  _revealAnswer: function(wordData, isCorrect, userInput, fromNav) {
    var drawer = document.getElementById('reveal-drawer');
    if (drawer) drawer.classList.remove('invisible', 'opacity-0');

    var sc = ns.sessionCore;
    var isReviewing = sc.isReviewing();

    var resultBadge = document.getElementById('reveal-result-text');
    if (resultBadge) {
      if (isCorrect) {
        resultBadge.textContent = 'Correct';
        resultBadge.className = 'text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
      } else {
        resultBadge.textContent = 'Incorrect';
        resultBadge.className = 'text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30';
      }
    }

    var input = document.getElementById('dictation-input');
    if (input && fromNav && !this._isHardMode()) input.value = userInput;

    // Hard mode: when navigating back, rebuild and fill letter slots
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

    // Render word card
    var cardContainer = document.getElementById('session-wordcard-content');
    var flipper = document.getElementById('session-wordcard-flipper');
    if (cardContainer && ns.wordcard && ns.wordcard._renderFullCard) {
      var reviewId = isReviewing ? sc.getReviewWordId() : ns.centralDictionary.getWordId(wordData.word);
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
    badge.className = 'transition-all duration-300 flex items-center gap-1.5 px-3 py-1 rounded-full h-6 text-xs font-bold border min-w-[6.5rem] justify-center ' + c.bg + ' ' + c.border + ' ' + c.text;
    dot.className = 'w-1.5 h-1.5 rounded-full flex-shrink-0 ' + c.dot;
    var labels = { unlearned: 'Unlearned', learning: 'Learning', reviewing: 'Reviewing', mastered: 'Mastered' };
    label.textContent = (isManual ? 'Manual: ' : '') + (labels[prof] || 'Unlearned');

    // Use invisible (not hidden) so the reset button always reserves space
    // — prevents layout shifts when toggling proficiency
    if (resetBtn) {
      resetBtn.classList.toggle('invisible', !isManual);
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
