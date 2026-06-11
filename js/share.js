// share.js - Progress Import/Export with Compression
// Uses run-length encoding for ID ranges

window.VocabGym = window.VocabGym || {};
(function(ns) {
ns.share = {
  VERSION: '3.0',

  /**
   * Compress array of numbers using run-length encoding for consecutive sequences
   * [1,2,3,4,5,10,11,12] -> "1-5,10-12"
   */
  compressIdList(ids) {
    if (!ids || ids.length === 0) return '';

    var sorted = ids.slice().sort(function(a, b) { return a - b; });
    var ranges = [];
    var start = sorted[0];
    var end = sorted[0];

    for (var i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? '' + start : start + '-' + end);
        start = sorted[i];
        end = sorted[i];
      }
    }
    ranges.push(start === end ? '' + start : start + '-' + end);

    return ranges.join(',');
  },

  /**
   * Decompress ID list from run-length encoded string
   * "1-5,10-12" -> [1,2,3,4,5,10,11,12]
   */
  decompressIdList(compressed) {
    if (!compressed) return [];

    var ids = [];
    var ranges = compressed.split(',');

    for (var ri = 0; ri < ranges.length; ri++) {
      var range = ranges[ri];
      if (range.indexOf('-') >= 0) {
        var parts = range.split('-');
        var s = Number(parts[0]);
        var e = Number(parts[1]);
        for (var i = s; i <= e; i++) ids.push(i);
      } else {
        ids.push(Number(range));
      }
    }

    return ids;
  },

  /**
   * Encode user progress for export (async — includes SRS data)
   * Format v3.0: {v:"3.0", u:..., m:..., s:..., r:...}
   */
  encodeProgress: function() {
    var self = this;
    var progress = ns.state.getUserProgress();
    var wordProgress = progress.wordProgress;

    var unfamiliarIds = [];
    var masteredIds = [];
    var wordStats = [];

    var keys = Object.keys(wordProgress);
    for (var ki = 0; ki < keys.length; ki++) {
      var wordId = parseInt(keys[ki]);
      var data = wordProgress[wordId];

      var prof = ns.state.getProficiency(wordId);
      if (prof === 'learning' || prof === 'reviewing') unfamiliarIds.push(wordId);
      else if (prof === 'mastered') masteredIds.push(wordId);

      if (data.correct > 0 || data.wrong > 0) {
        wordStats.push([wordId, data.correct, data.wrong]);
      }
    }

    var payload = {
      v: '3.0',
      u: self.compressIdList(unfamiliarIds),
      m: self.compressIdList(masteredIds),
      s: wordStats.map(function(s) { return s.join(':'); }).join(',')
    };

    // Add SRS data
    var pid = ns.db.getCurrentProfileIdSync();
    if (pid) {
      return ns.db.getSRSStats(pid).then(function() {
        return ns.db._getAllInStore('srsData', pid);
      }).then(function(srsRows) {
        if (srsRows && srsRows.length > 0) {
          var srsEntries = srsRows.map(function(r) {
            return [r.wordId, r.interval || 0, Math.round((r.easeFactor || 2.5) * 100), r.repetitions || 0, r.nextReview || 0, r.correctCount || 0, r.wrongCount || 0].join(':');
          });
          payload.r = srsEntries.join(',');
        }
        var jsonStr = JSON.stringify(payload);
        return btoa(unescape(encodeURIComponent(jsonStr)));
      });
    }

    var jsonStr = JSON.stringify(payload);
    return Promise.resolve(btoa(unescape(encodeURIComponent(jsonStr))));
  },

  /**
   * Decode shared progress data (returns {wordProgress, srsData})
   */
  decodeProgress: function(encodedData) {
    var jsonStr = decodeURIComponent(escape(atob(encodedData)));
    var payload = JSON.parse(jsonStr);

    if (payload.v !== '2.0' && payload.v !== '3.0') {
      throw new Error('Unsupported version: ' + payload.v);
    }

    var unfamiliarIds = this.decompressIdList(payload.u);
    var masteredIds = this.decompressIdList(payload.m);

    var wordProgress = {};

    unfamiliarIds.forEach(function(id) {
      wordProgress[id] = { status: 'unfamiliar', correct: 1, wrong: 0, manualProficiency: 'reviewing' };
    });

    masteredIds.forEach(function(id) {
      wordProgress[id] = { status: 'mastered', correct: 1, wrong: 0, manualProficiency: 'mastered' };
    });

    // Parse stats with validation
    if (payload.s) {
      var statEntries = payload.s.split(',');
      for (var si = 0; si < statEntries.length; si++) {
        var entry = statEntries[si];
        if (!entry || entry.trim() === '') continue;
        var parts = entry.split(':').map(Number);
        if (parts.length < 3 || parts.some(function(p) { return isNaN(p); })) continue;
        var id = parts[0], correct = parts[1], wrong = parts[2];
        if (!wordProgress[id]) wordProgress[id] = { status: 'unlearned', correct: 0, wrong: 0 };
        wordProgress[id].correct = correct;
        wordProgress[id].wrong = wrong;
      }
    }

    // Parse SRS data (v3.0+)
    var srsData = [];
    if (payload.r && payload.v === '3.0') {
      var srsEntries = payload.r.split(',');
      for (var ri = 0; ri < srsEntries.length; ri++) {
        var e = srsEntries[ri];
        if (!e || e.trim() === '') continue;
        var p = e.split(':').map(Number);
        if (p.length < 5) continue;
        srsData.push({
          wordId: p[0],
          interval: p[1],
          easeFactor: (p[2] || 250) / 100,
          repetitions: p[3],
          nextReview: p[4],
          correctCount: p[5] || 0,
          wrongCount: p[6] || 0
        });
      }
    }

    return { wordProgress: wordProgress, srsData: srsData };
  },

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const btnExport = document.getElementById('btn-export-share');
    if (btnExport) {
      btnExport.addEventListener('click', () => this.openExportModal());
    }

    const btnImport = document.getElementById('btn-import-share');
    if (btnImport) {
      btnImport.addEventListener('click', () => this.openImportModal());
    }

    const btnClose = document.getElementById('btn-close-share-modal');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.closeModal());
    }

    const btnCopy = document.getElementById('btn-copy-exported-data');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => this.copyToClipboard());
    }

    const btnImportData = document.getElementById('btn-import-data');
    if (btnImportData) {
      btnImportData.addEventListener('click', () => this.handleImport());
    }

    const modal = document.getElementById('share-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal();
      });
    }

  },

  openExportModal() {
    var modal = document.getElementById('share-modal');
    var title = document.getElementById('share-modal-title');
    var exportSection = document.getElementById('share-export-section');
    var importSection = document.getElementById('share-import-section');
    var textarea = document.getElementById('exported-data-textarea');

    if (!modal) return;

    if (title) title.textContent = 'Export Progress';
    if (exportSection) exportSection.classList.remove('hidden');
    if (importSection) importSection.classList.add('hidden');

    if (textarea) textarea.value = 'Encoding...';

    var self = this;
    this.encodeProgress().then(function(encodedData) {
      var progress = ns.state.getUserProgress();
      var wordCount = Object.keys(progress.wordProgress).length;
      if (wordCount === 0) {
        if (textarea) textarea.value = 'No progress to export yet.';
      } else {
        if (textarea) textarea.value = encodedData;
      }
    }).catch(function(e) {
      if (textarea) textarea.value = '';
      alert('Failed to encode progress: ' + e.message);
    });

    modal.classList.remove('hidden');
  },

  openImportModal() {
    const modal = document.getElementById('share-modal');
    const title = document.getElementById('share-modal-title');
    const exportSection = document.getElementById('share-export-section');
    const importSection = document.getElementById('share-import-section');
    const textarea = document.getElementById('import-data-textarea');

    if (!modal) return;

    if (title) title.textContent = 'Import Progress';
    if (exportSection) exportSection.classList.add('hidden');
    if (importSection) importSection.classList.remove('hidden');
    if (textarea) textarea.value = '';

    modal.classList.remove('hidden');
  },

  closeModal() {
    const modal = document.getElementById('share-modal');
    if (modal) modal.classList.add('hidden');
  },

  copyToClipboard() {
    const textarea = document.getElementById('exported-data-textarea');
    if (!textarea) return;
    const text = textarea.value;
    const btn = document.getElementById('btn-copy-exported-data');

    const showSuccess = () => {
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('text-emerald-400');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('text-emerald-400');
        }, 2000);
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showSuccess).catch(() => this._fallbackCopy(textarea, text));
    } else {
      this._fallbackCopy(textarea, text);
    }
  },

  _fallbackCopy(textarea, text) {
    const wasReadOnly = textarea.readOnly;
    textarea.readOnly = false;
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, 99999);
    try {
      document.execCommand('copy');
    } catch (e) { /* ignore */ }
    textarea.readOnly = wasReadOnly;
    alert('Copied to clipboard!');
  },

  handleImport() {
    var textarea = document.getElementById('import-data-textarea');
    if (!textarea) return;

    var encodedData = textarea.value.trim();
    if (!encodedData) {
      alert('Please paste the exported data.');
      return;
    }

    try {
      var decoded = this.decodeProgress(encodedData);
      var wordProgress = decoded.wordProgress;
      var srsData = decoded.srsData;
      var wordCount = Object.keys(wordProgress).length;

      var msg = 'Import progress for ' + wordCount + ' words?';
      if (srsData.length > 0) msg += '\nIncludes SRS schedule data for ' + srsData.length + ' words.';
      msg += ' This will merge with your existing progress.';
      if (!confirm(msg)) return;

      // Merge word progress
      var currentProgress = ns.state.getUserProgress();
      var wpKeys = Object.keys(wordProgress);
      for (var i = 0; i < wpKeys.length; i++) {
        currentProgress.wordProgress[wpKeys[i]] = wordProgress[wpKeys[i]];
      }
      ns.state.saveUserProgress();

      // Import SRS data
      if (srsData.length > 0) {
        var pid = ns.db.getCurrentProfileIdSync();
        var batchJobs = srsData.map(function(s) {
          return ns.db.updateSRSData(pid, s.wordId, {
            interval: s.interval,
            easeFactor: s.easeFactor,
            repetitions: s.repetitions,
            nextReview: s.nextReview,
            lastReview: Date.now(),
            correctCount: s.correctCount,
            wrongCount: s.wrongCount,
            lastQuality: 0
          });
        });
        Promise.all(batchJobs).then(function() {
          if (ns.srs && ns.srs.renderPanel) ns.srs.renderPanel();
        });
      }

      if (ns.dashboard && ns.dashboard.updateStats) ns.dashboard.updateStats();
      if (ns.dashboard && ns.dashboard.updateHeaderStats) ns.dashboard.updateHeaderStats();
      if (ns.ledger && ns.ledger.render) ns.ledger.render();

      ns.playSFX('correct');
      alert('Successfully imported ' + wordCount + ' words!');
      this.closeModal();
    } catch (e) {
      alert('Failed to import: ' + e.message);
    }
  }
};

})(window.VocabGym);
