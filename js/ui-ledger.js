// VocabGym - ledger (proficiency-aware + floating island controls)
window.VocabGym = window.VocabGym || {};
(function(ns) {

var _islandVisible = false;

// Proficiency level metadata
var PROF_LEVELS = ['unlearned', 'learning', 'reviewing', 'mastered'];
var PROF_LABELS = { unlearned: 'Unlearned', learning: 'Learning', reviewing: 'Reviewing', mastered: 'Mastered' };
var PROF_COLORS = {
  unlearned:  { bg: 'bg-zinc-950/20', border: 'border-transparent', select: 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:border-zinc-600 focus:ring-brand-500/50', dot: '' },
  learning:   { bg: 'bg-sky-950/20', border: 'border-sky-500/30', select: 'bg-sky-950/50 border-sky-600/30 text-sky-300 focus:ring-sky-500/50', dot: 'bg-sky-400 shadow-sm shadow-sky-400/50' },
  reviewing:  { bg: 'bg-amber-950/20', border: 'border-amber-500/40', select: 'bg-amber-950/50 border-amber-600/40 text-amber-300 focus:ring-amber-500/50', dot: 'bg-amber-400 shadow-sm shadow-amber-400/50' },
  mastered:   { bg: 'bg-emerald-950/25', border: 'border-emerald-500/50', select: 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300 focus:ring-emerald-500/50', dot: 'bg-emerald-400 shadow-sm shadow-emerald-400/50' }
};

ns.ledger = {
  init() {
    this.bindEvents();
    this.initIsland();
    this.render();
  },

  bindEvents() {
    var self = this;
    var searchInput = document.getElementById('ledger-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        ns.state.ledgerPage = 1;
        self.render();
      });
    }

    var statusFilter = document.getElementById('ledger-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', function() {
        ns.state.ledgerPage = 1;
        self.render();
      });
    }

    var limitSelect = document.getElementById('ledger-limit-select');
    if (limitSelect) {
      var saved = localStorage.getItem('english_vocab_gym_ledger_limit');
      if (saved !== null) {
        var savedVal = parseInt(saved);
        ns.state.ledgerLimit = savedVal === 0 ? 99999 : savedVal;
        limitSelect.value = String(savedVal);
      }
      limitSelect.addEventListener('change', function() {
        var val = parseInt(this.value);
        ns.state.ledgerLimit = val === 0 ? 99999 : val;
        localStorage.setItem('english_vocab_gym_ledger_limit', this.value);
        ns.state.ledgerPage = 1;
        self.render();
      });
    }

    var btnPrev = document.getElementById('btn-ledger-prev');
    var btnNext = document.getElementById('btn-ledger-next');
    if (btnPrev) {
      btnPrev.addEventListener('click', function() {
        if (ns.state.ledgerPage > 1) { ns.state.ledgerPage--; self.render(); }
      });
    }
    if (btnNext) {
      btnNext.addEventListener('click', function() {
        var maxPage = Math.ceil(ns.state.filteredLedgerIds.length / ns.state.ledgerLimit);
        if (ns.state.ledgerPage < maxPage) { ns.state.ledgerPage++; self.render(); }
      });
    }
  },

  // ── Floating island ──

  initIsland: function() {
    var self = this;
    var island = document.getElementById('ledger-island');
    var ledgerContainer = document.getElementById('word-ledger-container');
    if (!island || !ledgerContainer) return;

    // Intersection Observer — show island when ledger is in viewport
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          self._showIsland();
        } else {
          self._hideIsland();
        }
      });
    }, { threshold: 0.1 });

    observer.observe(ledgerContainer);

    // Sync island controls → main controls
    var islandSearch = document.getElementById('island-search');
    var islandStatus = document.getElementById('island-status-filter');
    var islandLimit = document.getElementById('island-limit-select');
    var islandPrev = document.getElementById('island-prev');
    var islandNext = document.getElementById('island-next');

    if (islandSearch) {
      islandSearch.addEventListener('input', function() {
        var main = document.getElementById('ledger-search');
        if (main) { main.value = this.value; main.dispatchEvent(new Event('input', { bubbles: true })); }
      });
    }
    if (islandStatus) {
      islandStatus.addEventListener('change', function() {
        var main = document.getElementById('ledger-status-filter');
        if (main) { main.value = this.value; main.dispatchEvent(new Event('change', { bubbles: true })); }
      });
    }
    if (islandLimit) {
      islandLimit.addEventListener('change', function() {
        var main = document.getElementById('ledger-limit-select');
        if (main) { main.value = this.value; main.dispatchEvent(new Event('change', { bubbles: true })); }
      });
    }
    if (islandPrev) {
      islandPrev.addEventListener('click', function() {
        document.getElementById('btn-ledger-prev').click();
      });
    }
    if (islandNext) {
      islandNext.addEventListener('click', function() {
        document.getElementById('btn-ledger-next').click();
      });
    }

    // Constrain island position to ledger bounds on scroll
    window.addEventListener('scroll', function() {
      if (_islandVisible) self._positionIsland();
    }, { passive: true });
  },

  _showIsland: function() {
    var island = document.getElementById('ledger-island');
    if (!island || _islandVisible) return;
    _islandVisible = true;
    island.classList.remove('hidden');
    this._syncIslandFromMain();
    this._positionIsland();
    requestAnimationFrame(function() {
      island.style.opacity = '1';
      island.style.transform = 'translateX(0)';
    });
  },

  _hideIsland: function() {
    var island = document.getElementById('ledger-island');
    if (!island || !_islandVisible) return;
    _islandVisible = false;
    island.style.opacity = '0';
    island.style.transform = 'translateX(1rem)';
  },

  _syncIslandFromMain: function() {
    var mainSearch = document.getElementById('ledger-search');
    var mainStatus = document.getElementById('ledger-status-filter');
    var mainLimit = document.getElementById('ledger-limit-select');
    var islandSearch = document.getElementById('island-search');
    var islandStatus = document.getElementById('island-status-filter');
    var islandLimit = document.getElementById('island-limit-select');

    if (mainSearch && islandSearch) islandSearch.value = mainSearch.value;
    if (mainStatus && islandStatus) islandStatus.value = mainStatus.value;
    if (mainLimit && islandLimit) islandLimit.value = mainLimit.value;
  },

  _positionIsland: function() {
    var island = document.getElementById('ledger-island');
    var ledgerContainer = document.getElementById('word-ledger-container');
    if (!island || !ledgerContainer) return false;

    var ledgerRect = ledgerContainer.getBoundingClientRect();
    var islandCard = island.querySelector('.glass-card');
    if (!islandCard) return false;
    var islandH = islandCard.offsetHeight;
    var viewH = window.innerHeight;

    // Island vertical bounds: must stay within ledger top/bottom with 12px padding
    var minTop = ledgerRect.top + 12;
    var maxBottom = Math.min(viewH, ledgerRect.bottom) - 12;
    if (maxBottom - minTop < 60) return false; // too small to fit

    // Ideal: centered in viewport, but clamped to ledger bounds
    var idealTop = Math.round((viewH - islandH) / 2);
    if (idealTop + islandH > maxBottom) idealTop = maxBottom - islandH;
    if (idealTop < minTop) idealTop = minTop;

    // Only reposition if needed (avoids jank on minor scroll changes)
    var currentTop = parseInt(island.style.top) || 0;
    if (Math.abs(currentTop - idealTop) > 5) {
      island.style.top = idealTop + 'px';
    }
    return true;
  },

  // ── Filtering & rendering ──

  getFilteredIds: function() {
    var searchVal = (document.getElementById('ledger-search')?.value || '').toLowerCase().trim();
    var statusFilter = document.getElementById('ledger-status-filter')?.value || 'all';

    return ns.state.activeWordIds.filter(function(id) {
      var wordData = ns.centralDictionary.getById(id);
      if (!wordData) return false;

      if (statusFilter !== 'all') {
        var prof = ns.state.getProficiency(id);
        if (prof !== statusFilter) return false;
      }

      if (searchVal) {
        return wordData.word.toLowerCase().includes(searchVal) ||
               wordData.definition.toLowerCase().includes(searchVal);
      }
      return true;
    });
  },

  render: function() {
    var self = this;
    var tbody = document.getElementById('ledger-table-body');
    var pagination = document.getElementById('ledger-pagination');
    if (!tbody) return;

    if (ns.state.activeWordIds.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-12 text-zinc-500 font-medium">No active list. Upload an Excel file to populate.</td></tr>';
      if (pagination) pagination.classList.add('hidden');
      this._updateIslandInfo(0, 0, 0, 0, 1);
      return;
    }

    ns.state.filteredLedgerIds = this.getFilteredIds();
    var totalWords = ns.state.filteredLedgerIds.length;

    if (totalWords === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-12 text-zinc-500 font-medium">No words match the filter.</td></tr>';
      if (pagination) pagination.classList.add('hidden');
      this._updateIslandInfo(0, 0, 0, 0, 1);
      return;
    }

    var totalPages = Math.ceil(totalWords / ns.state.ledgerLimit);
    var start = (ns.state.ledgerPage - 1) * ns.state.ledgerLimit;
    var end = Math.min(start + ns.state.ledgerLimit, totalWords);
    var pageIds = ns.state.filteredLedgerIds.slice(start, end);

    if (pagination) {
      pagination.classList.remove('hidden');
      var pageStart = document.getElementById('ledger-page-start');
      var pageEnd = document.getElementById('ledger-page-end');
      var totalRows = document.getElementById('ledger-total-rows');
      var btnPrev = document.getElementById('btn-ledger-prev');
      var btnNext = document.getElementById('btn-ledger-next');
      if (pageStart) pageStart.textContent = start + 1;
      if (pageEnd) pageEnd.textContent = end;
      if (totalRows) totalRows.textContent = totalWords;
      if (btnPrev) btnPrev.disabled = ns.state.ledgerPage <= 1;
      if (btnNext) btnNext.disabled = ns.state.ledgerPage >= totalPages;
    }

    this._updateIslandInfo(start + 1, end, totalWords, totalPages, ns.state.ledgerPage);

    tbody.innerHTML = '';
    pageIds.forEach(function(id) {
      var wordData = ns.centralDictionary.getById(id);
      if (!wordData) return;

      var stats = ns.state.getWordStats(id);
      var attempts = stats.correct + stats.wrong;
      var accuracy = attempts > 0 ? Math.round((stats.correct / attempts) * 100) : 0;
      var prof = ns.state.getProficiency(id);
      var colors = PROF_COLORS[prof] || PROF_COLORS.unlearned;

      var hoverBg = prof === 'mastered' ? 'hover:bg-emerald-950/40' :
                    prof === 'reviewing' ? 'hover:bg-amber-950/30' :
                    prof === 'learning' ? 'hover:bg-sky-950/30' : 'hover:bg-zinc-900/50';
      var tr = document.createElement('tr');
      tr.className = 'transition-colors duration-200 border-l-2 ' + colors.bg + ' ' + colors.border + ' ' + hoverBg;

      var selectClass = 'ledger-status-select rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 transition-colors duration-200 ' + colors.select;

      var hasManual = !!ns.state.getWordProgress(id).manualProficiency;
      var profOptions = '<option value="system"' + (!hasManual ? ' selected' : '') + '>⟲ System</option>' +
        PROF_LEVELS.map(function(lvl) {
          return '<option value="' + lvl + '"' + (hasManual && prof === lvl ? ' selected' : '') + '>' + PROF_LABELS[lvl] + '</option>';
        }).join('');

      tr.innerHTML =
        '<td class="px-6 py-3.5">' +
          '<div class="flex items-center gap-2"><span class="status-dot hidden w-2 h-2 rounded-full ml-1"></span><span class="font-mono font-semibold text-zinc-200">' + self.escapeHtml(wordData.word) + '</span></div>' +
        '</td>' +
        '<td class="px-6 py-3.5">' +
          '<div class="text-xs font-mono text-zinc-500">' + (wordData.phonetic ? self.escapeHtml(wordData.phonetic) : '—') + '</div>' +
        '</td>' +
        '<td class="px-6 py-3.5">' +
          '<div class="text-sm text-zinc-300 whitespace-pre-line">' + self.escapeHtml(wordData.definition) + '</div>' +
        '</td>' +
        '<td class="px-6 py-3.5 text-center">' +
          '<span class="text-sm font-semibold text-zinc-300">' + attempts + '</span>' +
        '</td>' +
        '<td class="px-6 py-3.5 text-center">' +
          '<span class="text-sm font-semibold ' + (accuracy >= 80 ? 'text-emerald-400' : (accuracy >= 50 ? 'text-amber-400' : 'text-rose-400')) + '">' + accuracy + '%</span>' +
        '</td>' +
        '<td class="px-6 py-3.5 text-right">' +
          '<select class="' + selectClass + '" data-word-id="' + id + '">' + profOptions + '</select>' +
        '</td>';

      var select = tr.querySelector('.ledger-status-select');
      if (select) {
        select.addEventListener('change', function(e) {
          self._setProficiencyOverride(id, e.target.value);
        });
      }

      var dot = tr.querySelector('.status-dot');
      if (dot && colors.dot) {
        dot.classList.remove('hidden');
        dot.className = 'status-dot w-2 h-2 rounded-full ml-1 ' + colors.dot;
      }

      tbody.appendChild(tr);
    });
  },

  _updateIslandInfo: function(s, e, total, pages, currentPage) {
    var countEl = document.getElementById('island-word-count');
    var pageInfo = document.getElementById('island-page-info');
    var prev = document.getElementById('island-prev');
    var next = document.getElementById('island-next');
    if (countEl) countEl.textContent = total;
    if (pageInfo) pageInfo.textContent = total > 0 ? (currentPage + ' / ' + pages) : '- / -';
    if (prev) prev.disabled = currentPage <= 1;
    if (next) next.disabled = currentPage >= pages;
    this._syncIslandFromMain();
  },

  // Manual proficiency override
  _setProficiencyOverride: function(wordId, newProf) {
    if (newProf === 'system') {
      ns.state.clearManualProficiency(wordId);
    } else {
      ns.state.setManualProficiency(wordId, newProf);
    }
    ns.dashboard.updateStats();
    ns.dashboard.updateHeaderStats();
    this.render();
    ns.playSFX('click');
  },

  // Set manual proficiency from the ledger (replaces legacy updateWordStatus)
  setProficiency: function(wordId, newProf) {
    if (newProf === 'system' || !newProf) {
      ns.state.clearManualProficiency(wordId);
    } else {
      ns.state.setManualProficiency(wordId, newProf);
    }
    ns.dashboard.updateStats();
    ns.dashboard.updateHeaderStats();
    this.render();
    ns.playSFX('click');
  },

  escapeHtml: function(text) {
    if (typeof text !== 'string') return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
})(window.VocabGym);
