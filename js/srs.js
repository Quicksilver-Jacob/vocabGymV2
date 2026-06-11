// VocabGym - Spaced Repetition System (SM-2 algorithm per SuperMemo 1.0 for DOS (1987))
window.VocabGym = window.VocabGym || {};
(function(ns) {

// ── Quality grading (0–5 per SM-2 spec) ──
// 5 = perfect, 4 = correct after hesitation, 3 = correct with difficulty,
// 2 = wrong (answer felt familiar), 1 = wrong (complete blackout), 0 = timeout / no input

function gradeDictation(result) {
  if (!result.correct) {
    if (!result.userInput || result.userInput.length === 0) return 0; // timeout
    // If the user had a previous wrong attempt, it's closer to "familiar" (q=2)
    if (result.wrongAttempted) return 2;
    return 1; // wrong with no prior attempt — blackout
  }
  // Correct
  if (result.elapsedTooLong) return 3; // correct but very slow
  if (result.wrongAttempted) return 4; // correct after previous wrong attempt
  return 5; // perfect — first try, fast
}

function gradeMultipleChoice(result) {
  if (result.correct) {
    if (result.elapsedTooLong) return 3;
    return 5; // correct first pick
  }
  // Wrong — no partial credit since we can't measure "familiarity" from a wrong radio choice
  return 1;
}

ns.srs = {

  // Expose for session-core re-review detection
  gradeResult: function(result, modeName) {
    return modeName === 'multipleChoice' ? gradeMultipleChoice(result) : gradeDictation(result);
  },

  // ── SM-2 Algorithm (exact spec) ──

  computeSM2: function(quality, prevData) {
    var interval = 0;
    var easeFactor = prevData ? (prevData.easeFactor || 2.5) : 2.5;
    var repetitions = prevData ? (prevData.repetitions || 0) : 0;

    if (quality >= 3) {
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round((prevData.interval || 1) * easeFactor);
      }
      repetitions++;
      easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    } else {
      interval = 1;
      repetitions = 0;
    }

    // Store as date string for reliable comparison
    var reviewDate = new Date(Date.now() + interval * 86400000);
    var nextReview = reviewDate.toISOString().split('T')[0];

    return {
      interval: interval,
      easeFactor: Math.round(easeFactor * 100) / 100,
      repetitions: repetitions,
      nextReview: nextReview,
      lastReview: new Date().toISOString().split('T')[0]
    };
  },

  // ── Session integration ──

  processSessionResults: function(results, modeName) {
    var pid = ns.db.getCurrentProfileIdSync();
    if (!pid) return Promise.resolve();

    var self = this;

    var promises = results.map(function(result) {
      var quality = self.gradeResult(result, modeName);
      result._srsQuality = quality;
      return ns.db.getSRSData(pid, result.wordId).then(function(prevData) {
        var srs = self.computeSM2(quality, prevData);
        srs.correctCount = (prevData ? (prevData.correctCount || 0) : 0) + (result.correct ? 1 : 0);
        srs.wrongCount = (prevData ? (prevData.wrongCount || 0) : 0) + (result.correct ? 0 : 1);
        srs.lastQuality = quality;
        return ns.db.updateSRSData(pid, result.wordId, srs);
      });
    });

    return Promise.all(promises);
  },

  // ── Review queue ──

  getDueWords: function(limit) {
    var pid = ns.db.getCurrentProfileIdSync();
    if (!pid) return Promise.resolve([]);
    // Fetch more than needed so filtering out mastered words still fills the quota
    return ns.db.getDueWords(pid, (limit || 10) * 3).then(function(wordIds) {
      return wordIds.filter(function(id) {
        var prog = ns.state.getWordProgress(id);
        return prog.manualProficiency !== 'mastered';
      }).slice(0, limit);
    });
  },

  getSRSStats: function() {
    var pid = ns.db.getCurrentProfileIdSync();
    if (!pid) return Promise.resolve({ dueToday: 0, dueThisWeek: 0, totalInRotation: 0, avgRetention: 0, avgEaseFactor: 2.5 });
    var self = this;
    return ns.db.getAllSRSRows(pid).then(function(rows) {
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var todayStr = today.toISOString().split('T')[0];
      var weekEnd = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0];
      var dueToday = 0, dueWeek = 0, totalCorrect = 0, totalReviews = 0;
      var totalEF = 0, efCount = 0, inRotation = 0;
      rows.forEach(function(r) {
        var prog = ns.state.getWordProgress(r.wordId);
        if (prog.manualProficiency === 'mastered') return;
        inRotation++;
        var nr = typeof r.nextReview === 'number' ? new Date(r.nextReview).toISOString().split('T')[0] : r.nextReview;
        if (nr && nr <= todayStr) dueToday++;
        if (nr && nr <= weekEnd) dueWeek++;
        if (r.correctCount) totalCorrect += r.correctCount;
        totalReviews += (r.correctCount || 0) + (r.wrongCount || 0);
        if (r.easeFactor) { totalEF += r.easeFactor; efCount++; }
      });
      return {
        dueToday: dueToday,
        dueThisWeek: dueWeek,
        totalInRotation: inRotation,
        avgRetention: totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0,
        avgEaseFactor: efCount > 0 ? Math.round(totalEF / efCount * 100) / 100 : 2.5
      };
    });
  },

  // ── Dashboard panel ──

  renderPanel: function() {
    var panel = document.getElementById('srs-panel');
    if (!panel) return;

    var self = this;
    this.getSRSStats().then(function(stats) {
      if (stats.totalInRotation === 0) {
        panel.classList.add('hidden');
        return;
      }
      panel.classList.remove('hidden');

      var dueEl = document.getElementById('srs-due-today');
      var weekEl = document.getElementById('srs-due-week');
      var rotEl = document.getElementById('srs-in-rotation');
      var retEl = document.getElementById('srs-avg-retention');

      if (dueEl) dueEl.textContent = stats.dueToday;
      if (weekEl) weekEl.textContent = stats.dueThisWeek;
      if (rotEl) rotEl.textContent = stats.totalInRotation;
      if (retEl) retEl.textContent = Math.round(stats.avgRetention) + '%';

      var btn = document.getElementById('btn-start-srs-review');
      if (btn) {
        if (stats.dueToday > 0) {
          btn.disabled = false;
          btn.classList.remove('opacity-50', 'cursor-not-allowed');
          btn.querySelector('span').textContent = 'Review ' + stats.dueToday + ' Due Words';
        } else {
          btn.disabled = true;
          btn.classList.add('opacity-50', 'cursor-not-allowed');
          btn.querySelector('span').textContent = 'No words due today';
        }
      }

      self.getDueWords(5).then(function(wordIds) {
        var preview = document.getElementById('srs-due-preview');
        if (!preview) return;
        preview.innerHTML = '';
        if (wordIds.length === 0) {
          preview.innerHTML = '<span class="text-xs text-zinc-600">All caught up!</span>';
          return;
        }
        wordIds.forEach(function(wid) {
          var entry = ns.centralDictionary.getById(wid);
          if (entry) {
            var span = document.createElement('span');
            span.className = 'text-xs text-zinc-400 bg-zinc-900/50 border border-zinc-800 px-2 py-0.5 rounded font-mono';
            span.textContent = entry.word;
            preview.appendChild(span);
          }
        });
      });
    });
  },

  startSRSReview: function() {
    var self = this;
    this.getDueWords(200).then(function(wordIds) {
      if (wordIds.length === 0) {
        alert('No words due for review today!');
        return;
      }
      var order = ns.state.getSessionOrder();
      if (order === 'shuffled') {
        wordIds = wordIds.slice().sort(function() { return Math.random() - 0.5; });
      }
      ns.sessionCore.startSession(wordIds);
      ns.state.activeWordIds = wordIds;
  }
};

})(window.VocabGym);
