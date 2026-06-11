// VocabGym - Session Core (mode-agnostic framework)
window.VocabGym = window.VocabGym || {};
(function(ns) {

var _modes = {};        // {name: {name, label, initModeUI, activateWord, handleKeydown, revealAnswer, deactivate, handleTimeout}}
var _activeMode = null;
var _activeModeName = null;

// Session state — all scoped within a single session instance
var _sessionActive = false;  // true only while a session is in progress
var _queue = [];
var _index = 0;
var _results = [];
var _correctStreak = 0;
var _maxStreak = 0;
var _wordStartTime = 0;
var _timerId = null;
var _timerSecs = 0;
var _reviewRound = 0;       // safety counter to prevent infinite loops

// Navigation
var _visitedHistory = [];
var _forwardHistory = [];
var _isReviewing = false;
var _reviewWordId = null;

ns.sessionCore = {

  // ── Mode registration ──

  registerMode: function(mode) {
    _modes[mode.name] = mode;
  },

  getMode: function(name) {
    return _modes[name] || null;
  },

  getActiveMode: function() {
    return _activeModeName;
  },

  setMode: function(name) {
    _activeModeName = name;
    _activeMode = _modes[name] || null;
    try { localStorage.setItem('english_vocab_gym_session_mode', name); } catch (_) {}
  },

  // Read selected mode from dashboard buttons
  _readDashboardMode: function() {
    var btns = document.querySelectorAll('.mode-select-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].classList.contains('bg-brand-500/15')) {
        return btns[i].getAttribute('data-mode');
      }
    }
    return 'dictation';
  },

  // Get sub-mode (dictation: standard|hard, MC: audio|definition)
  getSubMode: function() {
    var activeClass = 'bg-brand-500/15';
    var modeAttr = _activeModeName === 'multipleChoice' ? 'mc' : 'dictation';
    var toggles = document.querySelectorAll('.submode-toggle-btn[data-mode="' + modeAttr + '"]');
    for (var i = 0; i < toggles.length; i++) {
      if (toggles[i].classList.contains(activeClass)) {
        return toggles[i].getAttribute('data-value');
      }
    }
    return _activeModeName === 'multipleChoice' ? 'audio' : 'standard';
  },

  // ── Session lifecycle ──

  buildQueue: function() {
    var filterVal = document.querySelector('input[name="session-filter"]:checked').value;
    var limitInput = document.getElementById('session-timer').value;
    _timerSecs = limitInput ? parseInt(limitInput) : 0;

    var pool = ns.state.activeWordIds.slice();

    if (filterVal === 'reviewing') {
      // Include both learning and reviewing proficiency levels
      pool = pool.filter(function(id) {
        var prof = ns.state.getProficiency(id);
        return prof === 'learning' || prof === 'reviewing';
      });
    } else if (filterVal === 'low-accuracy') {
      var threshold = parseInt(document.getElementById('accuracy-threshold').value) || 60;
      pool = pool.filter(function(id) {
        var stats = ns.state.getWordStats(id);
        var total = stats.correct + stats.wrong;
        if (total === 0) return true;
        return (stats.correct / total) * 100 < threshold;
      });
    } else if (filterVal === 'unlearned') {
      pool = pool.filter(function(id) { return ns.state.getProficiency(id) === 'unlearned'; });
    }

    if (pool.length === 0) {
      alert('No words found matching filter.');
      return [];
    }

    var sizeInput = document.getElementById('session-size').value.trim();
    var sessionSize = sizeInput ? parseInt(sizeInput) : pool.length;
    if (isNaN(sessionSize) || sessionSize <= 0) sessionSize = pool.length;

    var order = ns.state.getSessionOrder();
    var ordered = order === 'shuffled' ? _shuffleArray(pool) : pool;
    return ordered.slice(0, sessionSize);
  },

  // optQueue: pre-built wordIds array (e.g. SRS due words). When provided,
// skips buildQueue() / srsRatio mixing and uses it directly.
startSession: function(optQueue) {
    ns.playSFX('click');

    // Read mode from dashboard selector
    _activeModeName = this._readDashboardMode();
    _activeMode = _modes[_activeModeName] || _modes['dictation'];
    try { localStorage.setItem('english_vocab_gym_session_mode', _activeModeName); } catch (_) {}

    var self = this;

    // If a pre-built queue was provided (e.g. SRS review), use it directly
    if (optQueue && optQueue.length > 0) {
      self._beginSession(optQueue);
      return;
    }

    var ratioSlider = document.getElementById('srs-ratio-slider');
    var srsRatio = ratioSlider ? Math.min(100, Math.max(0, parseInt(ratioSlider.value) || 0)) : 0;

    // Build the base queue from target filter
    var filterQueue = self.buildQueue();
    if (filterQueue.length === 0) return;

    if (srsRatio > 0 && ns.srs && ns.srs.getDueWords) {
      // Mix: srsRatio% SRS due words + (100-srsRatio)% filter words
      var sizeInput = document.getElementById('session-size').value.trim();
      var sessionSize = sizeInput ? parseInt(sizeInput) : filterQueue.length;
      if (isNaN(sessionSize) || sessionSize <= 0) sessionSize = filterQueue.length;

      var srsCount = Math.round(sessionSize * srsRatio / 100);
      var filterCount = sessionSize - srsCount;

      ns.srs.getDueWords(srsCount).then(function(dueIds) {
        // Remove due words that are already in the filter queue to avoid duplicates
        var filterSet = {};
        filterQueue.forEach(function(id) { filterSet[id] = true; });
        var uniqueDue = dueIds.filter(function(id) { return !filterSet[id]; });

        // If fewer SRS due words than the target ratio, fill the gap with filter words
        var actualSRSCount = uniqueDue.length;
        var shortfall = Math.max(0, srsCount - actualSRSCount);
        var adjustedFilterCount = filterCount + shortfall;

        // Take filter words that are NOT in the due list
        var dueSet = {};
        uniqueDue.forEach(function(id) { dueSet[id] = true; });
        var filterWords = filterQueue.filter(function(id) { return !dueSet[id]; }).slice(0, adjustedFilterCount);

        // SRS due words first, then filter words, capped at session size
        var mixed = uniqueDue.slice(0, srsCount).concat(filterWords);
        mixed = mixed.slice(0, sessionSize);

        // Shuffle if order is shuffled
        var orderEl = document.querySelector('input[name="session-order"]:checked');
        var order = orderEl ? orderEl.value : 'shuffled';
        if (order === 'shuffled') {
          mixed = _shuffleArray(mixed);
        } else {
          // Sort by word ID to keep book order
          mixed.sort(function(a, b) { return a - b; });
        }

        if (mixed.length === 0) {
          alert('No words match. Try adjusting the ratio or filter.');
          return;
        }
        self._beginSession(mixed);
      });
    } else {
      self._beginSession(filterQueue);
    }
  },

  // ── Internal: begin session with a given queue ──

  _beginSession: function(queue) {
    if (_sessionActive) {
      console.warn('[Session] _beginSession called while session already active — ignored.');
      return;
    }
    if (queue.length === 0) {
      alert('No words found matching filter.');
      return;
    }

    // Create session mutation buffer — all mid-session writes go here
    ns.state.beginSessionBuffer();

    _sessionActive = true;
    _queue = queue;
    _index = 0;
    _results = [];
    _correctStreak = 0;
    _maxStreak = 0;
    _visitedHistory = [];
    _forwardHistory = [];
    _isReviewing = false;
    _reviewWordId = null;
    _reviewRound = 0;

    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('results-view').classList.add('hidden');
    document.getElementById('word-ledger-container').classList.add('hidden');
    document.getElementById('dictation-view').classList.remove('hidden');

    document.getElementById('total-session-words').textContent = _queue.length;

    var contentArea = document.getElementById('mode-content-area');
    if (contentArea && _activeMode && _activeMode.initModeUI) {
      _activeMode.initModeUI(contentArea);
    }

    if (ns.dictation && ns.dictation._applyLayout) ns.dictation._applyLayout();

    this.loadWord();
  },

  loadWord: function() {
    if (_index >= _queue.length) {
      this.endSession();
      return;
    }

    _isReviewing = false;
    _reviewWordId = null;

    var wordId = _queue[_index];
    var wordData = ns.centralDictionary.getById(wordId);
    if (!wordData) {
      _index++;
      this.loadWord();
      return;
    }

    ns.state.wrongAnswerAttempted = false;
    ns.state._sessionSystemProf = ns.state.getProficiency(wordId);
    ns.state._sessionManualProf = null;
    var prog = ns.state.getWordProgress(wordId);
    if (prog.manualProficiency) ns.state._sessionManualProf = prog.manualProficiency;
    ns.state._sessionDerivedProf = ns.state._sessionManualProf || ns.state._sessionSystemProf;

    // Reset shared UI (elements may be mode-specific, check existence)
    var revealDrawer = document.getElementById('reveal-drawer');
    if (revealDrawer) revealDrawer.classList.add('invisible', 'opacity-0');
    var mcDrawer = document.getElementById('mc-reveal-drawer');
    if (mcDrawer) mcDrawer.classList.add('invisible', 'opacity-0');

    this.updateProgressBar();
    this.updateNavButtons();

    // Unflip word card
    var flipper = document.getElementById('session-wordcard-flipper');
    if (flipper) {
      flipper.style.transform = '';
      flipper.classList.remove('flipped');
    }

    // Update proficiency indicator (dictation mode only)
    // Use session-scoped proficiency to show the authoritative session view
    if (ns.dictation && ns.dictation.updateProficiencyBadge) {
      var prof = ns.state._sessionDerivedProf || ns.state.getProficiency(wordId);
      var isManual = !!ns.state._sessionManualProf;
      ns.dictation.updateProficiencyBadge(prof, isManual);
    }

    // Sentence hint (dictation mode only)
    var sentenceHint = document.getElementById('sentence-hint');
    if (sentenceHint) {
      var hasSentence = typeof SENTENCE_DATA !== 'undefined' &&
                        SENTENCE_DATA[wordId] &&
                        SENTENCE_DATA[wordId].length > 0;
      sentenceHint.classList.toggle('hidden', !hasSentence);
    }

    // Delegate to active mode
    if (_activeMode && _activeMode.activateWord) {
      _activeMode.activateWord(wordData);
    }

    // Start timer after audio — only if the word hasn't been answered yet.
    // (A fast answer within 150ms would set _isReviewing, making the timer skip.)
    var self = this;
    setTimeout(function() {
      if (_isReviewing) return;
      self._playActiveWordAudio(function() {
        if (_isReviewing) return;
        _wordStartTime = Date.now();
        _startCountdownTimer();
      });
    }, 150);
  },

  _playActiveWordAudio: function(onEnd) {
    if (_index >= _queue.length) return;
    var wordId = _queue[_index];
    var wordData = ns.centralDictionary.getById(wordId);
    if (wordData) {
      ns.speech.playWord(wordData.word);
      if (_index + 1 < _queue.length) {
        var nextId = _queue[_index + 1];
        var nextData = ns.centralDictionary.getById(nextId);
        if (nextData) ns.speech.preloadWord(nextData.word);
      }
      if (typeof onEnd === 'function') onEnd();
    }
  },

  handleInputKeydowns: function(e) {
    if (!_sessionActive) return;

    if (_isReviewing && e.key === 'Enter') {
      e.preventDefault();
      _advanceFromReview();
      return;
    }

    if (_isReviewing && e.key === 'ArrowLeft') {
      e.preventDefault();
      this.goToPrevWord();
      return;
    }

    if (_isReviewing && e.key === 'ArrowRight') {
      e.preventDefault();
      this.goToNextWord();
      return;
    }

    if (_index >= _queue.length) return;

    // Delegate to active mode for mode-specific keys
    if (_activeMode && _activeMode.handleKeydown) {
      _activeMode.handleKeydown(e);
      return;
    }
  },

  // Called by mode handlers on correct answer
  onCorrectAnswer: function(wordData, userInput, elapsed) {
    clearInterval(_timerId);
    ns.playSFX('correct');
    _correctStreak++;
    if (_correctStreak > _maxStreak) _maxStreak = _correctStreak;
    this.updateStreakUI();

    var wordId = wordData ? ns.centralDictionary.getWordId(wordData.word) : _queue[_index];
    var systemProf = ns.state._sessionSystemProf || 'unlearned';
    var manualProf = ns.state._sessionManualProf;

    // Auto-promote session-derived proficiency if user hasn't manually overridden
    if (!manualProf) {
      var profLevels = ['unlearned', 'learning', 'reviewing', 'mastered'];
      var idx = profLevels.indexOf(ns.state._sessionDerivedProf || 'unlearned');
      if (idx >= 0 && idx < profLevels.length - 1) {
        ns.state._sessionDerivedProf = profLevels[idx + 1];
      }
    }

    ns.state.addToSessionBuffer(wordId, { correct: 1 });

    _results.push({
      wordId: wordId,
      word: wordData.word,
      elapsed: elapsed,
      correct: true,
      userInput: userInput,
      initialProf: systemProf,
      finalProf: manualProf || ns.state._sessionDerivedProf || systemProf,
      _manualOverride: !!manualProf,
      wrongAttempted: !!ns.state.wrongAnswerAttempted,
      elapsedTooLong: _timerSecs > 0 && elapsed > _timerSecs * 500
    });

    _forwardHistory = [];
    _visitedHistory.push(wordId);
    _isReviewing = true;
    _reviewWordId = wordId;
  },

  // Called by mode handlers on wrong answer
  onWrongAnswer: function(wordData, userInput, elapsed) {
    clearInterval(_timerId);
    ns.playSFX('wrong');
    _correctStreak = 0;
    this.updateStreakUI();

    var wordId = wordData ? ns.centralDictionary.getWordId(wordData.word) : _queue[_index];
    var systemProf = ns.state._sessionSystemProf || 'unlearned';
    var manualProf = ns.state._sessionManualProf;

    // Demote session-derived proficiency if user hasn't manually overridden
    if (!manualProf) {
      var profLevels = ['unlearned', 'learning', 'reviewing', 'mastered'];
      var idx = profLevels.indexOf(ns.state._sessionDerivedProf || 'unlearned');
      if (idx > 1) { ns.state._sessionDerivedProf = profLevels[idx - 1]; }
      else if (idx === 1) { ns.state._sessionDerivedProf = 'learning'; }
      // idx === 0 (unlearned): no demotion possible, leave at unlearned
    }

    ns.state.addToSessionBuffer(wordId, { wrong: 1 });

    _results.push({
      wordId: wordId,
      word: wordData.word,
      elapsed: elapsed,
      correct: false,
      userInput: userInput,
      initialProf: systemProf,
      finalProf: manualProf || ns.state._sessionDerivedProf || systemProf,
      _manualOverride: !!manualProf,
      wrongAttempted: !!ns.state.wrongAnswerAttempted,
      elapsedTooLong: _timerSecs > 0 && elapsed > _timerSecs * 500
    });

    _forwardHistory = [];
    _visitedHistory.push(wordId);
    _isReviewing = true;
    _reviewWordId = wordId;
  },

  // Called by mode handlers on timeout
  onTimeout: function(wordData) {
    clearInterval(_timerId);

    ns.playSFX('wrong');
    _correctStreak = 0;
    this.updateStreakUI();

    var wordId = wordData ? ns.centralDictionary.getWordId(wordData.word) : _queue[_index];
    var systemProf = ns.state._sessionSystemProf || 'unlearned';
    var manualProf = ns.state._sessionManualProf;

    // Demote session-derived proficiency if user hasn't manually overridden
    if (!manualProf) {
      var profLevels = ['unlearned', 'learning', 'reviewing', 'mastered'];
      var idx = profLevels.indexOf(ns.state._sessionDerivedProf || 'unlearned');
      if (idx > 1) { ns.state._sessionDerivedProf = profLevels[idx - 1]; }
      else if (idx === 1) { ns.state._sessionDerivedProf = 'learning'; }
      // idx === 0 (unlearned): no demotion possible, leave at unlearned
    }

    ns.state.addToSessionBuffer(wordId, { wrong: 1 });

    var elapsed = Date.now() - _wordStartTime;
    _results.push({
      wordId: wordId,
      word: wordData.word,
      elapsed: elapsed,
      correct: false,
      userInput: '',
      initialProf: systemProf,
      finalProf: manualProf || ns.state._sessionDerivedProf || systemProf,
      _manualOverride: !!manualProf,
      wrongAttempted: false,
      elapsedTooLong: _timerSecs > 0 && elapsed > _timerSecs * 500
    });

    _forwardHistory = [];
    _visitedHistory.push(wordId);
    _isReviewing = true;
    _reviewWordId = wordId;
    ns.state.wrongAnswerAttempted = true;
  },

  // ── Navigation ──

  // Refresh per-word session proficiency state for a target word
  _refreshProfState: function(wordId) {
    ns.state._sessionSystemProf = ns.state.getProficiency(wordId);
    ns.state._sessionManualProf = null;
    ns.state._sessionDerivedProf = ns.state._sessionSystemProf;

    // Check if this word has an existing session result (answered earlier)
    var result = null;
    for (var i = _results.length - 1; i >= 0; i--) {
      if (_results[i].wordId === wordId) { result = _results[i]; break; }
    }
    if (result) {
      ns.state._sessionDerivedProf = result.finalProf;
      if (result._manualOverride) {
        ns.state._sessionManualProf = result.finalProf;
      }
    } else {
      // No result yet — use buffered manual proficiency if set
      var prog = ns.state.getWordProgress(wordId);
      if (prog.manualProficiency) {
        ns.state._sessionManualProf = prog.manualProficiency;
        ns.state._sessionDerivedProf = prog.manualProficiency;
      }
    }
  },

  goToPrevWord: function() {
    if (_visitedHistory.length <= 1) return;
    var currentId = _visitedHistory.pop();
    if (currentId) _forwardHistory.push(currentId);
    var prevWordId = _visitedHistory[_visitedHistory.length - 1];
    if (!prevWordId) return;

    var result = null;
    for (var i = _results.length - 1; i >= 0; i--) {
      if (_results[i].wordId === prevWordId) { result = _results[i]; break; }
    }
    if (!result) return;

    var wordData = ns.centralDictionary.getById(prevWordId);
    if (!wordData) return;

    ns.playSFX('click');
    _isReviewing = true;
    _reviewWordId = prevWordId;
    this._refreshProfState(prevWordId);

    if (_activeMode && _activeMode.revealAnswer) {
      _activeMode.revealAnswer(wordData, result.correct, result.userInput || '', true);
    }
    this.updateNavButtons();
  },

  goToNextWord: function() {
    if (_forwardHistory.length === 0) return;
    var nextWordId = _forwardHistory.pop();
    if (!nextWordId) return;

    var result = null;
    for (var i = _results.length - 1; i >= 0; i--) {
      if (_results[i].wordId === nextWordId) { result = _results[i]; break; }
    }
    if (!result) return;

    var wordData = ns.centralDictionary.getById(nextWordId);
    if (!wordData) return;

    ns.playSFX('click');
    _visitedHistory.push(nextWordId);
    _isReviewing = true;
    _reviewWordId = nextWordId;
    this._refreshProfState(nextWordId);

    if (_activeMode && _activeMode.revealAnswer) {
      _activeMode.revealAnswer(wordData, result.correct, result.userInput || '', true);
    }
    this.updateNavButtons();
  },

  jumpToCurrent: function() {
    if (!_isReviewing) return;
    var currentWordId = _queue[_index];
    if (!currentWordId) return;

    var result = null;
    for (var i = _results.length - 1; i >= 0; i--) {
      if (_results[i].wordId === currentWordId) { result = _results[i]; break; }
    }

    if (!result) {
      ns.playSFX('click');
      _isReviewing = false;
      _reviewWordId = null;
      _forwardHistory = [];
      this._refreshProfState(currentWordId);
      var flipper = document.getElementById('session-wordcard-flipper');
      if (flipper) { flipper.style.transform = ''; flipper.classList.remove('flipped'); }
      this.updateNavButtons();
      if (_activeMode && _activeMode.activateWord) {
        var wordData = ns.centralDictionary.getById(currentWordId);
        if (wordData) _activeMode.activateWord(wordData);
      }
      return;
    }

    ns.playSFX('click');
    var wordData = ns.centralDictionary.getById(currentWordId);
    _isReviewing = true;
    _reviewWordId = currentWordId;
    _forwardHistory = [];
    this._refreshProfState(currentWordId);

    if (_activeMode && _activeMode.revealAnswer) {
      _activeMode.revealAnswer(wordData, result.correct, result.userInput || '', true);
    }
    this.updateNavButtons();
  },

  // ── Shared UI ──

  updateProgressBar: function() {
    var bar = document.getElementById('session-progress-bar');
    var idxEl = document.getElementById('current-word-index');
    if (bar) bar.style.width = ((_index + 1) / _queue.length * 100) + '%';
    if (idxEl) idxEl.textContent = _index + 1;
  },

  updateNavButtons: function() {
    var btnPrev = document.getElementById('btn-prev-word');
    var btnNext = document.getElementById('btn-next-word');
    var btnJump = document.getElementById('btn-jump-current');

    if (btnPrev) {
      var hasHistory = _visitedHistory.length > 1;
      btnPrev.disabled = !hasHistory;
      btnPrev.className = hasHistory
        ? 'text-xs text-zinc-300 hover:text-zinc-100 flex items-center gap-1 transition-colors cursor-pointer'
        : 'text-xs text-zinc-700 flex items-center gap-1 transition-colors cursor-not-allowed';
    }
    if (btnNext) {
      var hasForward = _forwardHistory.length > 0;
      btnNext.disabled = !hasForward;
      btnNext.className = hasForward
        ? 'text-xs text-zinc-300 hover:text-zinc-100 flex items-center gap-1 transition-colors cursor-pointer'
        : 'text-xs text-zinc-700 flex items-center gap-1 transition-colors cursor-not-allowed';
    }
    if (btnJump) {
      btnJump.classList.toggle('hidden', !_isReviewing);
    }
    // Update Enter hint
    var hint = document.getElementById('press-enter-hint');
    if (hint) {
      hint.textContent = _isReviewing ? 'Press Enter to continue' : 'Press Enter to advance';
    }
  },

  updateStreakUI: function() {
    var container = document.getElementById('streak-indicator');
    var count = document.getElementById('streak-count');
    if (_correctStreak > 0) {
      container.classList.remove('hidden');
      container.classList.add('flex');
      count.textContent = _correctStreak;
      if (_correctStreak >= 5) {
        container.className = 'flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-bold rounded-lg transition-all animate-pulse-subtle shadow-md shadow-amber-500/10 scale-105';
      } else {
        container.className = 'flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold rounded-lg transition-all';
      }
    } else {
      container.classList.add('hidden');
      container.classList.remove('flex');
    }
  },

  endSession: function(reviewRoundComplete) {
    clearInterval(_timerId);

    var self = this;

    // ── q=4 re-review loop (SM-2 spec: repeat quality=4 items) ──
    if (!reviewRoundComplete && ns.srs && ns.srs.gradeResult) {
      var modeName = _activeModeName || 'dictation';
      var reReviewIds = [];
      var seen = {};
      for (var i = 0; i < _results.length; i++) {
        var r = _results[i];
        var q = ns.srs.gradeResult(r, modeName);
        r._srsQuality = q;
        if (q === 4 && !seen[r.wordId]) {
          seen[r.wordId] = true;
          reReviewIds.push(r.wordId);
        }
      }

      if (reReviewIds.length > 0 && _reviewRound < 2) {
        _reviewRound++;
        _visitedHistory = [];
        _forwardHistory = [];

        // Append re-review words to queue and continue
        _queue = _queue.concat(reReviewIds);
        document.getElementById('total-session-words').textContent = _queue.length;
        // Reset streak for review phase
        _correctStreak = 0;
        this.loadWord();
        return;
      }
    }

    // Deduplicate: for re-reviewed words keep only the most recent attempt
    var seenWids = {};
    for (var ri = _results.length - 1; ri >= 0; ri--) {
      var wid = _results[ri].wordId;
      if (!seenWids[wid]) {
        seenWids[wid] = true;
      } else {
        _results.splice(ri, 1);
      }
    }

    _sessionActive = false;
    if (_activeMode && _activeMode.deactivate) _activeMode.deactivate();
    ns.playSFX('correct');
    document.getElementById('session-progress-bar').style.width = '100%';

    document.getElementById('dictation-view').classList.add('hidden');
    document.getElementById('results-view').classList.remove('hidden');

    var total = _results.length;
    var correctCount = _results.filter(function(r) { return r.correct; }).length;
    var accPercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    var totalDuration = _results.reduce(function(acc, r) { return acc + r.elapsed; }, 0);
    var avgDuration = total > 0 ? ((totalDuration / 1000) / total).toFixed(1) : '0.0';

    document.getElementById('result-stat-accuracy').textContent = accPercent + '%';
    document.getElementById('result-stat-count').textContent = correctCount + '/' + total;
    document.getElementById('result-stat-speed').textContent = avgDuration + 's';
    document.getElementById('result-stat-streak').textContent = '🔥 ' + _maxStreak;

    this.renderResultsBreakdown();

    // Snapshot results before async processing so a rapid Restart
    // does not replace _results with an empty array mid-flight.
    var sessionResults = _results.slice();

    // Process SRS data (async — await before refreshing UI so caches are current)
    var srsPromise = (ns.srs && ns.srs.processSessionResults)
      ? ns.srs.processSessionResults(sessionResults, _activeModeName || 'dictation')
      : Promise.resolve();

    srsPromise.then(function() {
      return self._commitSessionProficiencies(sessionResults);
    }).then(function() {
      return ns.state.commitSessionBuffer();
    }).then(function() {
      self._refreshAllPostSession();
    });
  },

  // Boost SRS data for words whose session-derived proficiency exceeds post-SRS system level.
  // Does NOT write manualProficiency — proficiency stays SRS-derived so it can continue evolving.
  _commitSessionProficiencies: function(results) {
    var list = results || _results;
    var profLevels = ['unlearned', 'learning', 'reviewing', 'mastered'];
    var pid = ns.db.getCurrentProfileIdSync();
    var writes = [];
    if (!pid) return Promise.resolve();
    var today = new Date().toISOString().split('T')[0];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r._manualOverride) continue;
      var systemProf = ns.state.getProficiency(r.wordId);
      var systemIdx = profLevels.indexOf(systemProf);
      var finalIdx = profLevels.indexOf(r.finalProf);
      if (finalIdx <= systemIdx) continue;

      var srs = ns.db.getSRSDataSync(r.wordId) || {};
      if (finalIdx >= 2) {
        srs.repetitions = Math.max(srs.repetitions || 0, 1);
        srs.interval = Math.max(srs.interval || 0, 1);
      }
      if (finalIdx >= 3) {
        srs.repetitions = Math.max(srs.repetitions || 0, 2);
        srs.interval = Math.max(srs.interval || 0, 30);
      }
      if (!srs.nextReview) srs.nextReview = today;
      if (!srs.lastReview) srs.lastReview = today;
      if (!srs.easeFactor) srs.easeFactor = 2.5;

      ns.db.setSRSCacheSync(r.wordId, srs);
      writes.push(ns.db.updateSRSData(pid, r.wordId, srs));
    }
    return Promise.all(writes);
  },

  _refreshAllPostSession: function() {
    if (ns.dashboard && ns.dashboard.updateStats) ns.dashboard.updateStats();
    if (ns.dashboard && ns.dashboard.updateHeaderStats) ns.dashboard.updateHeaderStats();
    if (ns.ledger && ns.ledger.render) ns.ledger.render();
    if (ns.srs && ns.srs.renderPanel) ns.srs.renderPanel();
  },

  // Force a specific queue (used by SRS review)
  _forceQueue: function(wordIds) {
    _queue = wordIds.slice();
    _index = 0;
    _results = [];
    _correctStreak = 0;
    _maxStreak = 0;
    _visitedHistory = [];
    _forwardHistory = [];
    _isReviewing = false;
    _reviewWordId = null;
    _reviewRound = 0;
  },

  quitSession: function() {
    clearInterval(_timerId);
    _sessionActive = false; // block further input before async commit
    if (_activeMode && _activeMode.deactivate) _activeMode.deactivate();
    var self = this;
    // Process SRS data for completed words before discarding session
    if (_results.length > 0 && ns.srs && ns.srs.processSessionResults) {
      var sessionResults = _results.slice();
      ns.srs.processSessionResults(sessionResults, _activeModeName || 'dictation').then(function() {
        return self._commitSessionProficiencies(sessionResults);
      }).then(function() {
        return ns.state.commitSessionBuffer();
      }).then(function() {
        self.exitToDashboard();
      });
    } else {
      ns.state.commitSessionBuffer().then(function() {
        self.exitToDashboard();
      });
    }
  },

  exitToDashboard: function() {
    _sessionActive = false;
    ns.playSFX('click');
    document.getElementById('dictation-view').classList.add('hidden');
    document.getElementById('results-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('word-ledger-container').classList.remove('hidden');
    this._refreshAllPostSession();
  },

  escapeHtml: function(text) {
    if (typeof text !== 'string') return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  renderResultsBreakdown: function() {
    var container = document.getElementById('tested-words-list');
    var searchVal = document.getElementById('tested-search').value.toLowerCase().trim();
    container.innerHTML = '';

    var filteredResults = _results.filter(function(r) {
      if (r.word.toLowerCase().includes(searchVal)) return true;
      var wd = ns.centralDictionary.getById(r.wordId);
      return wd && wd.definition && wd.definition.toLowerCase().includes(searchVal);
    });

    if (filteredResults.length === 0) {
      container.innerHTML = '<div class="col-span-2 text-center py-8 text-zinc-500 text-sm">No matching tested words found.</div>';
      return;
    }

    var self = this;
    filteredResults.forEach(function(r) {
      var card = document.createElement('div');
      card.className = 'p-4 rounded-xl border flex flex-col justify-between space-y-3 bg-[#121214]/60 ' + (r.correct ? 'border-emerald-500/20' : 'border-rose-500/20');

      var wordEscaped = self.escapeHtml(r.word);
      var wordData = ns.centralDictionary.getById(r.wordId);
      var defEscaped = wordData ? self.escapeHtml(wordData.definition) : '';
      var initialProf = r.initialProf || 'unlearned';
      var currentProf = r.finalProf || ns.state.getProficiency(r.wordId);

      card.innerHTML =
        '<div class="flex items-start justify-between">' +
          '<div class="flex-1 min-w-0">' +
            '<h4 class="font-bold font-mono text-zinc-100 text-sm flex items-center gap-1.5">' +
              '<span>' + wordEscaped + '</span>' +
              '<span class="text-[10px] font-mono text-zinc-500">(' + ((r.elapsed / 1000)).toFixed(1) + 's)</span>' +
            '</h4>' +
            (defEscaped ? '<p class="text-xs text-zinc-400 mt-1.5 leading-relaxed whitespace-pre-line line-clamp-3" title="' + defEscaped + '">' + defEscaped + '</p>' : '') +
            '<div class="flex gap-2 mt-2">' +
              '<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ' + _profBadgeClass(initialProf) + '">Before: ' + _profLabel(initialProf) + '</span>' +
              '<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ' + _profBadgeClass(currentProf) + '">Now: ' + _profLabel(currentProf) + '</span>' +
            '</div>' +
          '</div>' +
          '<span class="flex-shrink-0 ml-3 h-6 w-6 rounded-full flex items-center justify-center ' + (r.correct ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400') + '">' +
            (r.correct
              ? '<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
              : '<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>') +
          '</span>' +
        '</div>' +
        '<div class="flex items-center justify-between border-t border-zinc-900 pt-2.5 text-[10px]">' +
          '<div class="flex items-center gap-1.5">' +
            '<span class="text-zinc-500 font-medium">Proficiency:</span>' +
            '<span class="font-semibold ' + _profTextClass(initialProf) + '">' + _profLabel(initialProf) + '</span>' +
            '<svg class="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>' +
            '<span class="font-semibold ' + _profTextClass(currentProf) + '">' + _profLabel(currentProf) + '</span>' +
          '</div>' +
          '<button class="btn-replay-word text-zinc-500 hover:text-brand-400 flex items-center gap-1 text-[10px] font-semibold" data-word="' + wordEscaped + '">Replay Audio</button>' +
        '</div>';

      var replayBtn = card.querySelector('.btn-replay-word');
      if (replayBtn) {
        replayBtn.addEventListener('click', function() {
          ns.speech.playWord(r.word);
        });
      }

      container.appendChild(card);
    });
  },

  // ── Expose state for mode handlers ──

  getQueue: function() { return _queue; },
  getIndex: function() { return _index; },
  getResults: function() { return _results; },
  getCorrectStreak: function() { return _correctStreak; },
  getMaxStreak: function() { return _maxStreak; },
  getWordStartTime: function() { return _wordStartTime; },
  isReviewing: function() { return _isReviewing; },
  isSessionActive: function() { return _sessionActive; },
  getReviewWordId: function() { return _reviewWordId; },
  getTimerSecs: function() { return _timerSecs; },
  getTimerId: function() { return _timerId; },

  // For mode handlers to advance to next word
  advance: function() {
    ns.playSFX('click');
    // If there's forward history (user went back), walk forward first
    if (_forwardHistory.length > 0) {
      this.goToNextWord();
      return;
    }
    _forwardHistory = [];
    // Jump _index to past all answered words (handles cases where user
    // navigated back multiple times then wants to proceed)
    _index = _results.length;
    this.loadWord();
  },

  playActiveWordAudio: function() {
    this._playActiveWordAudio();
  }
};

// ── Proficiency cycling (in-session) ──

var PROF_LEVELS = ['unlearned', 'learning', 'reviewing', 'mastered'];
var PROF_LABELS = { unlearned: 'Unlearned', learning: 'Learning', reviewing: 'Reviewing', mastered: 'Mastered' };

ns.sessionCore.cycleWordProficiency = function() {
  var wordId = this.isReviewing() ? this.getReviewWordId() : this.getQueue()[this.getIndex()];
  if (!wordId) return;
  // Cycle: system → learning → reviewing → mastered → system → ...
  var levels = ['system', 'learning', 'reviewing', 'mastered'];
  var currentProf = ns.state._sessionManualProf || 'system';
  var idx = levels.indexOf(currentProf);
  if (idx < 0) idx = 0;
  var nextIdx = (idx + 1) % levels.length;
  var nextProf = levels[nextIdx];

  if (nextProf === 'system') {
    ns.state._sessionManualProf = null;
    ns.state.addToSessionBuffer(wordId, { manualProficiency: '' });
    // Re-read now that manual override is cleared
    ns.state._sessionSystemProf = ns.state.getProficiency(wordId);
    ns.state._sessionDerivedProf = ns.state._sessionSystemProf;
    this._updateActiveModeProfBadge(ns.state._sessionDerivedProf, false);
    // Update result entry so _commitSessionProficiencies won't skip this word
    for (var i = _results.length - 1; i >= 0; i--) {
      if (_results[i].wordId === wordId && _results[i]._manualOverride) {
        _results[i]._manualOverride = false;
        _results[i].finalProf = ns.state._sessionDerivedProf;
        break;
      }
    }
  } else {
    ns.state._sessionManualProf = nextProf;
    ns.state._sessionDerivedProf = nextProf;
    ns.state.addToSessionBuffer(wordId, { manualProficiency: nextProf });
    this._updateActiveModeProfBadge(nextProf, true);
    // Update result entry so breakdown shows the new manual proficiency
    for (var i = _results.length - 1; i >= 0; i--) {
      if (_results[i].wordId === wordId) {
        _results[i].finalProf = nextProf;
        _results[i]._manualOverride = true;
        break;
      }
    }
  }
  ns.playSFX('click');
};

ns.sessionCore.resetWordProficiency = function() {
  var wordId = this.isReviewing() ? this.getReviewWordId() : this.getQueue()[this.getIndex()];
  if (!wordId) return;
  ns.state._sessionManualProf = null;
  ns.state.addToSessionBuffer(wordId, { manualProficiency: '' });
  // Re-read after clearing manual override
  ns.state._sessionSystemProf = ns.state.getProficiency(wordId);
  ns.state._sessionDerivedProf = ns.state._sessionSystemProf;
  // Update result entry so _commitSessionProficiencies won't skip this word
  for (var i = _results.length - 1; i >= 0; i--) {
    if (_results[i].wordId === wordId && _results[i]._manualOverride) {
      _results[i]._manualOverride = false;
      _results[i].finalProf = ns.state._sessionDerivedProf;
      break;
    }
  }
  ns.playSFX('click');
  this._updateActiveModeProfBadge(ns.state._sessionDerivedProf, false);
};

ns.sessionCore._updateActiveModeProfBadge = function(prof, isManual) {
  var modeName = _activeModeName;
  if (modeName === 'multipleChoice' && ns.multipleChoice && ns.multipleChoice._updateProfBadge) {
    ns.multipleChoice._updateProfBadge();
  } else if (ns.dictation && ns.dictation.updateProficiencyBadge) {
    ns.dictation.updateProficiencyBadge(prof, isManual);
  }
};

ns.sessionCore.getCurrentWordProficiency = function() {
  return ns.state._sessionManualProf || ns.state._sessionDerivedProf || ns.state._sessionSystemProf || 'unlearned';
};

ns.sessionCore.isManualProficiency = function() {
  return !!ns.state._sessionManualProf;
};

// ── Internal helpers ──

function _shuffleArray(array) {
  var arr = array.slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

function _advanceFromReview() {
  ns.sessionCore.advance();
}

function _profBadgeClass(prof) {
  switch (prof) {
    case 'mastered': return 'bg-emerald-500/20 text-emerald-300';
    case 'reviewing': return 'bg-amber-500/20 text-amber-300';
    case 'learning': return 'bg-sky-500/20 text-sky-300';
    default: return 'bg-zinc-700 text-zinc-400';
  }
}

function _profTextClass(prof) {
  switch (prof) {
    case 'mastered': return 'text-emerald-400';
    case 'reviewing': return 'text-amber-400';
    case 'learning': return 'text-sky-400';
    default: return 'text-zinc-400';
  }
}

function _profLabel(prof) {
  return PROF_LABELS[prof] || 'Unlearned';
}

function _startCountdownTimer() {
  clearInterval(_timerId);
  var counter = document.getElementById('word-countdown');

  if (_timerSecs <= 0) {
    if (counter) counter.classList.add('hidden');
    return;
  }

  if (counter) counter.classList.remove('hidden');
  var remaining = _timerSecs;

  var updateText = function() {
    if (!counter) return;
    counter.textContent = remaining + 's';
    if (remaining > 5) {
      counter.className = 'absolute right-4 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-brand-500/10 border border-brand-500/20 text-brand-400 font-bold rounded-lg text-sm font-mono';
    } else if (remaining > 2) {
      counter.className = 'absolute right-4 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-amber-500/15 border border-amber-500/35 text-amber-400 font-bold rounded-lg text-sm font-mono';
    } else {
      counter.className = 'absolute right-4 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-rose-500/20 border border-rose-500/40 text-rose-400 font-bold rounded-lg text-sm font-mono animate-pulse';
    }
  };

  updateText();

  _timerId = setInterval(function() {
    remaining--;
    if (remaining <= 0) {
      clearInterval(_timerId);
      var wordId = _queue[_index];
      var wordData = ns.centralDictionary.getById(wordId);
      ns.sessionCore.onTimeout(wordData);
      if (_activeMode && _activeMode.handleTimeout) {
        _activeMode.handleTimeout(wordData);
      } else if (_activeMode && _activeMode.revealAnswer) {
        _activeMode.revealAnswer(wordData, false, '');
      }
    } else {
      updateText();
    }
  }, 1000);
}

})(window.VocabGym);
