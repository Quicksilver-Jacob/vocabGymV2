// VocabGym - dashboard
window.VocabGym = window.VocabGym || {};
(function(ns) {

ns.parser = {
  // Smart word extractor: reads any file format, auto-detects content structure
  parseFile(file, callback) {
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (isExcel) {
      return this._parseExcel(file, callback);
    }
    this._parseText(file, callback);
  },

  _parseExcel(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        callback(null, this._extractWordIdsFromRows(rawRows));
      } catch (err) {
        callback(err);
      }
    };
    reader.onerror = () => callback(new Error('File reading error.'));
    reader.readAsArrayBuffer(file);
  },

  _parseText(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        const wordIds = this._extractWordIdsFromText(lines);
        callback(null, wordIds);
      } catch (err) {
        callback(err);
      }
    };
    reader.onerror = () => callback(new Error('File reading error.'));
    reader.readAsText(file, 'UTF-8');
  },

  // Score each column/delimiter strategy by dictionary hit rate, pick the winner
  _extractWordIdsFromText(lines) {
    if (lines.length === 0) return [];

    const strategies = [
      { name: 'tab', split: (l) => l.split('\t') },
      { name: 'comma', split: (l) => this._splitCSV(l) },
      { name: 'single', split: (l) => [l.trim()] }
    ];

    let best = { col: 0, totalHits: 0, totalCells: 0 };

    for (const strat of strategies) {
      const cols = strat.split(lines[0]).length;
      // Try single-line strategy (one word per line)
      if (cols === 1 && strat.name !== 'single') continue;
      for (let c = 0; c < cols; c++) {
        let hits = 0;
        let cellsChecked = 0;
        for (let i = 0; i < Math.min(lines.length, 50); i++) {
          const parts = strat.split(lines[i]);
          if (c < parts.length) {
            cellsChecked++;
            const word = parts[c].trim().replace(/^["']|["']$/g, '');
            if (word && ns.centralDictionary.getWordId(word)) hits++;
          }
        }
        // Adjust for non-single strategies: bonus for higher hit rate
        const score = cellsChecked > 0 ? hits / cellsChecked : 0;
        // Prefer multi-column over single-line if both work
        const adjustedScore = strat.name === 'single' ? score * 0.9 : score;
        if (adjustedScore > best.totalHits / Math.max(best.totalCells, 1)) {
          best = { col: c, totalHits: hits, totalCells: cellsChecked, strategy: strat.name };
        }
      }
    }

    if (best.totalCells === 0) return [];

    const resolveSplit = (() => {
      if (best.strategy === 'tab') return (l) => l.split('\t');
      if (best.strategy === 'comma') return (l) => this._splitCSV(l);
      return (l) => [l.trim()];
    })();

    const wordIds = [];
    const seen = new Set();
    for (const line of lines) {
      const parts = resolveSplit(line);
      if (best.col < parts.length) {
        const word = parts[best.col].trim().replace(/^["']|["']$/g, '');
        if (word) {
          const id = ns.centralDictionary.getWordId(word);
          if (id && !seen.has(id)) {
            seen.add(id);
            wordIds.push(id);
          }
        }
      }
    }
    return wordIds;
  },

  _splitCSV(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  },

  // Excel: use header detection as before, but also scan if no header found
  _extractWordIdsFromRows(rows) {
    if (!rows || rows.length === 0) return [];
    const headers = rows[0].map(h => String(h || '').trim().toLowerCase());

    let wordIdx = -1;
    for (let i = 0; i < headers.length; i++) {
      if (/单词|word|spelling|vocab|term|english/i.test(headers[i])) {
        wordIdx = i;
        break;
      }
    }

    // If header found, start from row 1; otherwise scan all rows (no header)
    const startRow = wordIdx >= 0 ? 1 : 0;

    // No header found: auto-detect best column by dictionary hit rate
    if (wordIdx === -1) {
      const numCols = rows.reduce((max, r) => Math.max(max, r ? r.length : 0), 0);
      let bestCol = 0;
      let bestHits = 0;
      for (let c = 0; c < numCols; c++) {
        let hits = 0;
        const limit = Math.min(rows.length, 50);
        for (let i = 0; i < limit; i++) {
          const row = rows[i];
          if (!row || c >= row.length) continue;
          const word = String(row[c] || '').trim();
          if (word && ns.centralDictionary.getWordId(word)) hits++;
        }
        if (hits > bestHits) { bestHits = hits; bestCol = c; }
      }
      wordIdx = bestCol;
    }

    const wordIds = [];
    const seen = new Set();
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const word = String(row[wordIdx] || '').trim();
      if (!word) continue;
      const id = ns.centralDictionary.getWordId(word);
      if (id && !seen.has(id)) {
        seen.add(id);
        wordIds.push(id);
      }
    }
    return wordIds;
  }
};

ns.fileUploader = {
  init() {
    const modal = document.getElementById('upload-modal');
    const btnOpen = document.getElementById('btn-open-upload');
    const btnClose = document.getElementById('btn-close-upload-modal');
    const dropzone = document.getElementById('upload-dropzone');
    const input = document.getElementById('excel-file-input');

    if (!modal) return;

    // Open
    if (btnOpen) {
      btnOpen.addEventListener('click', () => modal.classList.remove('hidden'));
    }

    // Close
    if (btnClose) {
      btnClose.addEventListener('click', () => modal.classList.add('hidden'));
    }

    // Backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    if (!dropzone || !input) return;

    dropzone.addEventListener('click', () => input.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-brand-500', 'bg-zinc-900/80');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-brand-500', 'bg-zinc-900/80');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-brand-500', 'bg-zinc-900/80');
      if (e.dataTransfer.files.length > 0) {
        this.handleFiles(e.dataTransfer.files);
      }
    });

    input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFiles(e.target.files);
      }
    });
  },

  handleFiles(files) {
    const validExts = ['.txt', '.csv', '.xlsx', '.xls'];
    const fileList = Array.from(files).filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return validExts.includes(ext);
    });

    if (fileList.length === 0) {
      alert('Please upload .txt, .csv, .xlsx, or .xls files.');
      return;
    }

    if (fileList.length < files.length) {
      console.warn('Some files were skipped (unsupported format).');
    }

    let totalWordIds = 0;
    const newBookNames = [];

    const finish = () => {
      const modalEl = document.getElementById('upload-modal');
      if (modalEl) modalEl.classList.add('hidden');

      if (newBookNames.length > 0) {
        const selected = ns.state.getSelectedLists();
        for (const name of newBookNames) {
          if (!selected.includes(name)) selected.push(name);
        }
        ns.state.setSelectedLists(selected);
      }

      ns.playSFX('correct');
      ns.dashboard.renderBookCards();
      ns.dashboard.syncSelectionToState();

      if (newBookNames.length === 0) return;
      const msg = newBookNames.length === 1
        ? 'Imported "' + newBookNames[0].replace(/\.\w+$/i, '') + '" (' + totalWordIds + ' words).'
        : 'Imported ' + newBookNames.length + ' books (' + totalWordIds + ' words total).';
      alert(msg);
    };

    const processNext = (idx) => {
      if (idx >= fileList.length) { finish(); return; }

      const file = fileList[idx];
      ns.parser.parseFile(file, (err, wordIds) => {
        if (err) {
          console.error('Parse error (' + file.name + '):', err);
          alert('Failed to parse "' + file.name + '": ' + err.message);
          processNext(idx + 1);
          return;
        }

        if (wordIds.length === 0) {
          alert('No valid English words found in "' + file.name + '".');
          processNext(idx + 1);
          return;
        }

        ns.state.mergeList(file.name, wordIds);
        newBookNames.push(file.name);
        totalWordIds += wordIds.length;
        processNext(idx + 1);
      });
    };

    processNext(0);
  }
};

ns.dashboard = {
  init() {
    this.bindEvents();
    this.renderBookCards();
    this.syncSelectionToState();
  },

  bindEvents() {
    // Select All / Deselect All
    const btnSelectAll = document.getElementById('picker-select-all');
    const btnDeselectAll = document.getElementById('picker-deselect-all');
    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', (e) => {
        e.stopPropagation();
        ns.state.setSelectedLists(ns.state.getListNames());
        this.syncSelectionToState();
        this.renderBookCards();
      });
    }
    if (btnDeselectAll) {
      btnDeselectAll.addEventListener('click', (e) => {
        e.stopPropagation();
        ns.state.setSelectedLists([]);
        this.syncSelectionToState();
        this.renderBookCards();
      });
    }

    // Delete selected books
    const btnDelete = document.getElementById('btn-delete-selected');
    if (btnDelete) {
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSelectedLists();
      });
    }

    // Test audio
    const btnTestAudio = document.getElementById('btn-test-audio');
    if (btnTestAudio) {
      btnTestAudio.addEventListener('click', () => {
        ns.speech.playWord('welcome');
      });
    }

    // Voice rate slider
    const rateSlider = document.getElementById('voice-rate');
    const rateValue = document.getElementById('rate-value');
    if (rateSlider && rateValue) {
      rateSlider.addEventListener('input', (e) => {
        rateValue.textContent = e.target.value + 'x';
      });
    }
  },

  // Render book cards in the grid
  renderBookCards() {
    const grid = document.getElementById('book-cards-grid');
    if (!grid) return;

    const listNames = ns.state.getListNames();
    const selected = ns.state.getSelectedLists();

    if (listNames.length === 0) {
      grid.innerHTML = '<p class="text-zinc-500 text-xs text-center py-4 col-span-2">No books imported yet</p>';
      return;
    }

    grid.innerHTML = '';
    listNames.forEach(name => {
      const list = ns.state.loadList(name);
      const count = list ? (list.wordIds ? list.wordIds.length : 0) : 0;
      const isActive = selected.includes(name);

      const card = document.createElement('div');
      card.className = 'rounded-xl border p-3.5 cursor-pointer transition-all duration-300 hover:scale-[1.02] ' +
        (isActive
          ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
          : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700');

      card.addEventListener('click', () => {
        ns.dashboard.toggleBookSelection(name);
      });

      const displayName = name.replace(/\.xlsx$/i, '');

      const header = document.createElement('div');
      header.className = 'flex items-start justify-between gap-2';

      const info = document.createElement('div');
      info.className = 'flex-1 min-w-0';

      const nameEl = document.createElement('div');
      nameEl.className = 'text-xs font-semibold truncate ' + (isActive ? 'text-emerald-300' : 'text-zinc-300');
      nameEl.textContent = displayName;

      const countEl = document.createElement('div');
      countEl.className = 'text-[10px] mt-1 ' + (isActive ? 'text-emerald-500/70' : 'text-zinc-500');
      countEl.textContent = count + ' words';

      info.appendChild(nameEl);
      info.appendChild(countEl);

      const indicator = document.createElement('div');
      indicator.className = 'w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors mt-0.5 ' +
        (isActive ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600');
      if (isActive) {
        indicator.innerHTML = '<svg class="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="4"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
      }

      header.appendChild(info);
      header.appendChild(indicator);
      card.appendChild(header);
      grid.appendChild(card);
    });
  },

  // Backward compatibility
  refreshListPicker() {
    this.renderBookCards();
  },

  toggleBookSelection(listName) {
    const selected = ns.state.getSelectedLists();
    const idx = selected.indexOf(listName);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else {
      selected.push(listName);
    }
    ns.state.setSelectedLists(selected);
    this.syncSelectionToState();
    this.renderBookCards();
  },

  getCombinedWordPool() {
    return ns.state.getCombinedWordIds();
  },

  syncSelectionToState() {
    const combined = this.getCombinedWordPool();
    ns.state.activeWordIds = combined;

    this.updateStats();
    this.updateHeaderStats();

    const btnStart = document.getElementById('btn-start-session');
    const hint = document.getElementById('stats-empty-hint');

    if (combined.length > 0) {
      if (btnStart) {
        btnStart.disabled = false;
        btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
      }
      if (hint) { hint.style.opacity = '0'; hint.style.pointerEvents = 'none'; }
    } else {
      if (btnStart) {
        btnStart.disabled = true;
        btnStart.classList.add('opacity-50', 'cursor-not-allowed');
      }
      if (hint) { hint.style.opacity = '1'; hint.style.pointerEvents = 'auto'; }
    }

    if (typeof ns.ledger !== 'undefined' && ns.ledger.render) {
      ns.ledger.render();
    }
    this.renderBookCards();
  },

  // No-op: book cards already reflect selection state in the grid
  updateSelectedBooksUI() {},

  deleteSelectedLists() {
    const selected = ns.state.getSelectedLists();
    if (selected.length === 0) {
      alert('No books selected.');
      return;
    }

    const names = selected.map(n => n.replace(/\.xlsx$/i, '')).join(', ');
    if (!confirm('Delete ' + (selected.length > 1 ? selected.length + ' books' : '"' + names + '"') + '?')) return;

    selected.forEach(name => ns.state.deleteList(name));
    ns.state.setSelectedLists([]);

    this.syncSelectionToState();
    this.renderBookCards();
    ns.playSFX('click');
  },

  updateStats() {
    var counts = ns.state.getProficiencyStats();
    var totalWords = counts.total;

    var progressPercent = totalWords > 0 ? Math.round((counts.mastered / totalWords) * 100) : 0;
    var circle = document.getElementById('mastery-progress-circle');
    var percentText = document.getElementById('mastery-progress-percent');
    var totalMetric = document.getElementById('total-words-metric');

    if (circle) {
      var circumference = 2 * Math.PI * 28;
      var offset = circumference - (progressPercent / 100) * circumference;
      circle.style.strokeDashoffset = offset;
    }

    if (percentText) percentText.textContent = progressPercent + '%';
    if (totalMetric) totalMetric.textContent = totalWords;

    var barMastered = document.getElementById('bar-mastered');
    var barReviewing = document.getElementById('bar-reviewing');
    var barLearning = document.getElementById('bar-learning');
    var barUnlearned = document.getElementById('bar-unlearned');

    if (totalWords > 0) {
      if (barMastered) barMastered.style.width = (counts.mastered / totalWords) * 100 + '%';
      if (barReviewing) barReviewing.style.width = (counts.reviewing / totalWords) * 100 + '%';
      if (barLearning) barLearning.style.width = (counts.learning / totalWords) * 100 + '%';
      if (barUnlearned) barUnlearned.style.width = (counts.unlearned / totalWords) * 100 + '%';
    } else {
      if (barMastered) barMastered.style.width = '0%';
      if (barReviewing) barReviewing.style.width = '0%';
      if (barLearning) barLearning.style.width = '0%';
      if (barUnlearned) barUnlearned.style.width = '0%';
    }
  },

  updateHeaderStats() {
    var counts = ns.state.getProficiencyStats();
    var statMastered = document.getElementById('stat-count-mastered');
    var statReviewing = document.getElementById('stat-count-reviewing');
    var statLearning = document.getElementById('stat-count-learning');
    var statUnlearned = document.getElementById('stat-count-unlearned');

    if (statMastered) statMastered.textContent = counts.mastered;
    if (statReviewing) statReviewing.textContent = counts.reviewing;
    if (statLearning) statLearning.textContent = counts.learning;
    if (statUnlearned) statUnlearned.textContent = counts.unlearned;
  },

};
})(window.VocabGym);
