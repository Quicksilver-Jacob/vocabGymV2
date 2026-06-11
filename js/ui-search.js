// VocabGym - search
window.VocabGym = window.VocabGym || {};
(function(ns) {

ns.dictionaryLookup = {
  highlightedIndex: -1,
  resultCount: 0,
  closeTimeoutId: null,

  init() {
    this.bindEvents();
  },

  openDropdown() {
    const dropdown = document.getElementById('dict-dropdown');
    if (!dropdown) return;
    dropdown.classList.remove('hidden');
    dropdown.classList.remove('animate-fade-in');
    void dropdown.offsetWidth;
    dropdown.classList.add('animate-fade-in');
    this.highlightedIndex = -1;
    this.performSearch();
  },

  closeDropdown(blurSearch) {
    const dropdown = document.getElementById('dict-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    if (this.closeTimeoutId) {
      clearTimeout(this.closeTimeoutId);
      this.closeTimeoutId = null;
    }
    this.highlightedIndex = -1;
    if (blurSearch) {
      const searchInput = document.getElementById('header-dict-search');
      if (searchInput) searchInput.blur();
    }
  },

  bindEvents() {
    const searchInput = document.getElementById('header-dict-search');
    const dropdown = document.getElementById('dict-dropdown');
    const searchWrapper = document.getElementById('header-search-wrapper');

    if (!searchInput || !dropdown) return;

    searchInput.addEventListener('focus', () => {
      if (this.closeTimeoutId) {
        clearTimeout(this.closeTimeoutId);
        this.closeTimeoutId = null;
      }
      this.openDropdown();
    });

    searchInput.addEventListener('input', () => {
      this.openDropdown();
    });

    searchInput.addEventListener('blur', () => {
      this.closeTimeoutId = setTimeout(() => {
        this.closeDropdown(false);
      }, 150);
    });

    dropdown.addEventListener('mousedown', (e) => {
      if (this.closeTimeoutId) {
        clearTimeout(this.closeTimeoutId);
        this.closeTimeoutId = null;
      }
      if (!e.target.closest('.btn-dict-pronounce')) {
        e.preventDefault();
      }
    });

    dropdown.addEventListener('click', (e) => {
      if (!e.target.closest('.btn-dict-pronounce')) {
        searchInput.focus();
      }
    });

    searchInput.addEventListener('keydown', (e) => {
      const dropdownVisible = !dropdown.classList.contains('hidden');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!dropdownVisible) { this.openDropdown(); return; }
        this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.resultCount - 1);
        this.updateHighlight();
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!dropdownVisible) { this.openDropdown(); return; }
        this.highlightedIndex = Math.max(this.highlightedIndex - 1, -1);
        this.updateHighlight();
        return;
      }

      if (e.key === 'Enter') {
        if (dropdownVisible && this.highlightedIndex >= 0) {
          e.preventDefault();
          this.pronounceHighlighted();
          return;
        }
        if (dropdownVisible) {
          e.preventDefault();
          this.closeDropdown(true);
        }
        return;
      }

      if (e.key === 'Escape') {
        // Close word card first if it's open (higher visual priority)
        var wordcardOverlay = document.getElementById('wordcard-overlay');
        if (wordcardOverlay && !wordcardOverlay.classList.contains('hidden')) {
          e.preventDefault();
          e.stopPropagation();
          ns.wordcard.close();
          return;
        }
        if (dropdownVisible) {
          e.preventDefault();
          e.stopPropagation();
          this.closeDropdown(true);
        }
        return;
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
        this.openDropdown();
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (dropdown.classList.contains('hidden')) return;
      if (searchWrapper && !searchWrapper.contains(e.target)) {
        this.closeDropdown(true);
      }
    });
  },

  performSearch() {
    const query = document.getElementById('header-dict-search')?.value || '';
    const resultsContainer = document.getElementById('dict-dropdown-results');
    const countEl = document.getElementById('dict-dropdown-count');

    if (!resultsContainer) return;

    this.highlightedIndex = -1;

    if (!query.trim()) {
      resultsContainer.className = 'flex-1 overflow-y-auto p-3';
      resultsContainer.innerHTML = '<p class="text-zinc-500 text-xs text-center py-8">Type to search the dictionary</p>';
      if (countEl) countEl.textContent = '0 words found';
      this.resultCount = 0;
      return;
    }

    const results = ns.centralDictionary.search(query, 30);
    this.resultCount = results.length;

    if (countEl) {
      countEl.textContent = results.length === 1 ? '1 word found' : results.length + ' words found';
    }

    if (results.length === 0) {
      resultsContainer.className = 'flex-1 overflow-y-auto p-3';
      resultsContainer.innerHTML = '<p class="text-zinc-500 text-xs text-center py-8">No words found</p>';
      return;
    }

    resultsContainer.className = 'flex-1 overflow-y-auto p-3 columns-1 md:columns-2 gap-3 space-y-3';
    resultsContainer.innerHTML = '';

    results.forEach((entry, index) => {
      const progress = ns.state.getWordProgress(entry.id);

      var prof = ns.state.getProficiency(entry.id);
      var accentBorder;
      if (prof === 'mastered') {
        accentBorder = 'border-l-emerald-500/60';
      } else if (prof === 'reviewing') {
        accentBorder = 'border-l-amber-500/60';
      } else if (prof === 'learning') {
        accentBorder = 'border-l-sky-500/60';
      } else {
        accentBorder = 'border-l-zinc-700';
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'inline-block w-full mb-3 break-inside-avoid';
      wrapper.setAttribute('data-dict-index', index);
      wrapper.setAttribute('data-dict-word', entry.word);

      wrapper.innerHTML =
        '<div class="dict-result-card bg-zinc-800/40 border border-zinc-800 border-l-2 ' + accentBorder + ' rounded-xl p-4 hover:bg-zinc-800/60 transition-colors group cursor-pointer">' +
          '<div class="flex items-start gap-3 mb-3">' +
            '<div class="flex-1 min-w-0">' +
              '<h4 class="font-mono font-bold text-zinc-100 text-base break-words">' + this.escapeHtml(entry.word) + '</h4>' +
              (entry.phonetic ? '<p class="text-xs font-mono text-zinc-500 mt-0.5">' + this.escapeHtml(entry.phonetic) + '</p>' : '') +
            '</div>' +
            '<div class="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">' +
              '<button class="btn-dict-audio-uk text-zinc-500 hover:text-amber-400 p-1 transition-colors" data-word="' + this.escapeHtml(entry.word) + '" title="UK pronunciation">' +
                '<span class="text-[11px] font-semibold">UK</span>' +
              '</button>' +
              '<button class="btn-dict-audio-us text-zinc-500 hover:text-blue-400 p-1 transition-colors" data-word="' + this.escapeHtml(entry.word) + '" title="US pronunciation">' +
                '<span class="text-[11px] font-semibold">US</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
          this.formatDefinitionHTML(entry.definition) +
          this.getSentencesHTML(entry.id) +
        '</div>';

      wrapper.querySelector('.btn-dict-audio-uk').addEventListener('click', function(e) {
        e.stopPropagation();
        ns.speech.playDictvoice(entry.word, 'uk');
      });
      wrapper.querySelector('.btn-dict-audio-us').addEventListener('click', function(e) {
        e.stopPropagation();
        ns.speech.playDictvoice(entry.word, 'us');
      });

      const card = wrapper.querySelector('.dict-result-card');
      card.addEventListener('click', function(e) {
        if (!e.target.closest('button')) {
          if (ns.wordcard && ns.wordcard.show) ns.wordcard.show(entry.id);
        }
      });

      resultsContainer.appendChild(wrapper);
    });
  },

  updateHighlight() {
    const wrappers = document.querySelectorAll('#dict-dropdown-results [data-dict-index]');
    wrappers.forEach((wrapper, i) => {
      const card = wrapper.querySelector('.dict-result-card');
      if (i === this.highlightedIndex) {
        wrapper.classList.add('ring-2', 'ring-brand-500/60', 'rounded-xl');
        wrapper.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        wrapper.classList.remove('ring-2', 'ring-brand-500/60', 'rounded-xl');
      }
    });
  },

  pronounceHighlighted() {
    const wrapper = document.querySelector('#dict-dropdown-results [data-dict-index="' + this.highlightedIndex + '"]');
    if (wrapper) {
      const word = wrapper.getAttribute('data-dict-word');
      if (word) ns.speech.pronounce(word);
    }
  },

  formatDefinitionHTML(raw) {
    if (!raw || typeof raw !== 'string') return '';

    var lines = raw.split('\\n').filter(function(l) { return l.trim(); });
    if (lines.length === 0) return '<p class="text-sm text-zinc-500">—</p>';

    var parts = [];
    var self = this;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      // Find the first POS abbreviation anywhere in the line (not just at ^)
      // Some definitions have leading noise: <德>n.xxx, [复]n.xxx, l adj.xxx
      var posRegex = /\b(n\.|vt\.|vi\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|art\.|int\.|aux\.|num\.|pref\.|suf\.|abbr\.|det\.)\s*/i;
      var posMatch = line.match(posRegex);
      var pos = '';
      var label = '';
      var content = line;

      if (posMatch) {
        pos = posMatch[1].toLowerCase();
        // Normalize vt/vi to v for display
        if (pos === 'vt.' || pos === 'vi.') pos = 'v.';
        var matchIdx = posMatch.index;
        // Anything before the POS is a label (language tag, annotation, etc.)
        if (matchIdx > 0) {
          label = line.substring(0, matchIdx).trim();
        }
        content = line.substring(matchIdx + posMatch[0].length).trim();
      }

      var senseMatches = [];
      var re = /(\d+)\.\s*(.*?)(?=\s*\d+\.\s*|$)/g;
      var sm;
      while ((sm = re.exec(content)) !== null) {
        senseMatches.push(sm);
      }

      var bodyHTML = '';

      if (senseMatches.length > 1) {
        var items = senseMatches.map(function(m) {
          return '<div class="flex gap-2 pl-2 py-0.5">' +
            '<span class="text-[10px] text-zinc-500 font-mono flex-shrink-0 min-w-[1.25rem] text-right">' + self.escapeHtml(m[1]) + '.</span>' +
            '<span class="text-xs text-zinc-300 leading-relaxed">' + self.escapeHtml(m[2]) + '</span>' +
          '</div>';
        }).join('');
        bodyHTML = '<div class="space-y-0">' + items + '</div>';
      } else if (content) {
        bodyHTML = '<p class="text-xs text-zinc-300 leading-relaxed pl-2">' + self.escapeHtml(content) + '</p>';
      }

      var sectionHTML;

      if (pos) {
        sectionHTML =
          '<div class="flex items-start gap-2">' +
            (label ? '<span class="text-[10px] text-zinc-500 flex-shrink-0">' + self.escapeHtml(label) + '</span>' : '') +
            '<span class="text-[10px] font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.5 rounded flex-shrink-0 min-w-[2.25rem] text-center">' + self.escapeHtml(pos.replace('.', '')) + '</span>' +
            '<div class="flex-1 min-w-0">' + bodyHTML + '</div>' +
          '</div>';
      } else {
        sectionHTML = '<div class="pl-2">' + bodyHTML + '</div>';
      }

      if (i > 0 && pos) {
        parts.push('<div class="my-1 border-t border-zinc-800/50"></div>');
      }

      parts.push(sectionHTML);
    }

    return '<div class="space-y-1.5">' + parts.join('') + '</div>';
  },

  getSentencesHTML(wordId) {
    if (typeof SENTENCE_DATA === 'undefined') return '';
    const sentences = SENTENCE_DATA[wordId];
    if (!sentences || sentences.length === 0) return '';

    // Filter out junk sentences (same logic as word card)
    var filtered = [];
    for (var si = 0; si < sentences.length && filtered.length < 3; si++) {
      var s = sentences[si];
      var en = typeof s === 'string' ? s : s.en;
      var cn = typeof s === 'string' ? '' : s.cn;
      if (!en || en.length < 15) continue;
      if (/^[0-9. ]+$/.test(en)) continue;
      if (/skill level|hp |mana |damage|upgrade|level up|quest|spell/i.test(en)) continue;
      if (/[<>{}]/.test(en)) continue;
      filtered.push({ en: en, cn: cn });
    }

    if (filtered.length === 0) return '';

    const items = filtered.map(function(s) {
      return '<div class="space-y-0.5">' +
        '<p class="text-xs text-zinc-500 italic leading-relaxed">&ldquo;' + this.escapeHtml(s.en) + '&rdquo;</p>' +
        (s.cn ? '<p class="text-[11px] text-zinc-600 leading-relaxed">' + this.escapeHtml(s.cn) + '</p>' : '') +
        '</div>';
    }.bind(this)).join('');

    return '<div class="mt-3 pt-3 border-t border-zinc-800/50 space-y-1.5">' + items + '</div>';
  },

  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
})(window.VocabGym);
