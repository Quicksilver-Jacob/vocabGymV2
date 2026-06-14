// VocabGym — Question Type definitions for Mixed Mode
window.VocabGym = window.VocabGym || {};
(function(ns) {

// ═══════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Build a 2×2 grid of option buttons. Returns { grid, buttons }.
// onSelect(index, option, buttons[]) is called on click.
function buildOptionGrid(container, options, onSelect) {
  container.innerHTML = '';
  var grid = document.createElement('div');
  grid.className = 'grid grid-cols-2 gap-3';

  var buttons = [];
  options.forEach(function(opt, i) {
    var btn = document.createElement('button');
    btn.className = 'mc-option-btn w-full text-sm text-left bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-4 py-3 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-700/60 transition-all';
    btn.innerHTML = '<span class="text-[10px] font-mono text-zinc-500 mr-2">' + (i + 1) + '</span>' + esc(opt.label);
    btn.setAttribute('data-option-index', String(i));
    btn.addEventListener('click', function() {
      onSelect(i, opt, buttons);
    });
    grid.appendChild(btn);
    buttons.push(btn);
  });

  container.appendChild(grid);
  return { grid: grid, buttons: buttons };
}

// Style buttons after answer: green for correct, red for wrong selected
function markOptionButtons(buttons, correctIndex, selectedIndex) {
  buttons.forEach(function(btn, i) {
    btn.disabled = true;
    btn.classList.remove('hover:border-zinc-600', 'hover:bg-zinc-700/60', 'cursor-pointer');
    btn.classList.add('cursor-default');
    if (i === correctIndex) {
      btn.classList.add('border-emerald-500/50', 'bg-emerald-500/10', 'text-emerald-300');
    } else if (i === selectedIndex && i !== correctIndex) {
      btn.classList.add('border-rose-500/50', 'bg-rose-500/10', 'text-rose-300');
    } else {
      btn.classList.add('opacity-50');
    }
  });
}

// Pick N distractors from dictionary, excluding the target word and any listed words
function pickDistractors(wordId, excludeWords, count, preferPOS) {
  var dict = ns.centralDictionary;
  if (!dict || !dict.idMap) return [];

  var allIds = Array.from(dict.idMap.keys());
  var excludeSet = new Set(excludeWords.map(function(w) { return w.toLowerCase(); }));

  // Shuffle
  var shuffled = allIds.slice();
  for (var i = shuffled.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
  }

  var distractors = [];
  for (var i = 0; i < shuffled.length && distractors.length < count; i++) {
    var id = Number(shuffled[i]);
    if (id === wordId) continue;
    var entry = dict.getById(id);
    if (!entry) continue;
    // Get first line of definition
    var def = (entry.definition || '').split('\\n')[0].replace(/^[a-z]+\.\s*/i, '').split(',')[0].trim();
    if (!def || def.length < 2) continue;
    if (excludeSet.has(def.toLowerCase())) continue;
    distractors.push({ label: def, id: id, word: entry.word });
    excludeSet.add(def.toLowerCase()); // no duplicate definitions
  }
  return distractors;
}

// ── Collocation helpers ──

function getCollocValidSet(wordId) {
  var valid = new Set();
  var data = window.COLLOCATION_DATA && COLLOCATION_DATA[wordId];
  if (data) {
    data.forEach(function(c) {
      c.words.forEach(function(w) { valid.add(w.toLowerCase()); });
    });
  }
  return valid;
}

function pickCollocDistractors(wordId, correctAnswer, collocType, count) {
  var validSet = getCollocValidSet(wordId);
  var allIds = Object.keys(window.COLLOCATION_DATA || {});

  // Shuffle
  for (var i = allIds.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = allIds[i]; allIds[i] = allIds[j]; allIds[j] = tmp;
  }

  // Extract the "role" from collocType: "verb + crime" → "verb", "adj" → "adj"
  var role = collocType.toLowerCase().split('+')[0].trim();
  // Normalize: "verb" / "adj" / "adv" / "prep" / "phrases" / "noun"
  if (role === 'adj.' || role === 'adj') role = 'adj';
  if (role === 'adv.' || role === 'adv') role = 'adv';
  if (role === 'prep.' || role === 'prep') role = 'prep';

  var distractors = [];
  for (var i = 0; i < allIds.length && distractors.length < count; i++) {
    var otherId = allIds[i];
    if (otherId === String(wordId)) continue;
    var clusters = COLLOCATION_DATA[otherId];
    if (!clusters) continue;

    for (var ci = 0; ci < clusters.length && distractors.length < count; ci++) {
      var clType = (clusters[ci].type || '').toLowerCase().split('+')[0].trim();
      if (clType === 'adj.' || clType === 'adj') clType = 'adj';
      if (clType === 'adv.' || clType === 'adv') clType = 'adv';
      if (clType === 'prep.' || clType === 'prep') clType = 'prep';
      if (clType !== role) continue;
      for (var wi = 0; wi < clusters[ci].words.length && distractors.length < count; wi++) {
        var w = clusters[ci].words[wi].toLowerCase();
        if (!validSet.has(w) && w !== correctAnswer.toLowerCase()) {
          distractors.push(clusters[ci].words[wi]);
        }
      }
    }
  }
  return distractors;
}

function formatCollocPrompt(word, type) {
  var t = type.toLowerCase();
  if (t.indexOf('verb +') === 0) return '___ ' + word;
  if (t.indexOf(' + verb') > -1) return word + ' ___';
  if (t.indexOf('noun +') === 0) return '___ ' + word;
  if (t.indexOf('adv') === 0 || t.indexOf('adv.') === 0) return '___ ' + word;
  if (t.indexOf('prep') === 0 || t.indexOf('prep.') === 0) return word + ' ___';
  if (t.indexOf('phras') === 0) return word + ' ___';
  if (t.indexOf('adj') === 0 || t.indexOf('adj.') === 0) return '___ ' + word;
  return '___ ' + word;
}

// ═══════════════════════════════════════════
// Question Type definitions
// ═══════════════════════════════════════════

ns.questionTypes = {
  ALL: {},

  _registry: {},

  define: function(config) {
    var type = {
      id: config.id,
      label: config.label,
      icon: config.icon || '?',
      canRender: config.canRender || function() { return true; },
      activate: config.activate,
      handleKeydown: config.handleKeydown,
      destroy: config.destroy || function() {}
    };
    ns.questionTypes.ALL[config.id] = type;
    return type;
  }
};

var qt = ns.questionTypes;

// ── 1. Spelling (Listen & Spell) ──

qt.define({
  id: 'spelling',
  label: 'Listen & Spell',
  icon: '🔊',
  activate: function(container, wordData, ctx) {
    var self = this;
    container.innerHTML =
      '<div class="flex flex-col items-center gap-3">' +
        '<input type="text" class="qt-spell-input w-full max-w-md text-center text-lg bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-5 py-3.5 text-zinc-100 placeholder-zinc-500 focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/30" placeholder="Type the word…" autocomplete="off" autocapitalize="off" spellcheck="false" />' +
      '</div>';
    var input = container.querySelector('.qt-spell-input');
    if (input) input.focus();

    self._input = input;
    self._submitted = false;

    self._doSubmit = function() {
      if (self._submitted || !self._input) return;
      var userInput = self._input.value.trim();
      if (!userInput) return;
      self._submitted = true;
      self._input.disabled = true;
      ctx.answer(userInput.toLowerCase() === wordData.word.toLowerCase(), userInput);
    };
  },
  handleKeydown: function(e, ctx) {
    if (e.key === 'Enter' && !ctx.isReviewing()) {
      e.preventDefault();
      if (this._doSubmit) this._doSubmit();
      return true;
    }
    return false;
  },
  destroy: function() {
    this._input = null;
    this._doSubmit = null;
    this._submitted = false;
  }
});

// ── 2. MC Audio (Listen & Pick) ──

qt.define({
  id: 'mc_audio',
  label: 'Pick Meaning (audio)',
  icon: '🎧',
  activate: function(container, wordData, ctx) {
    var self = this;
    self._answered = false;
    self._correctIdx = -1;
    self._selectedIdx = -1;

    var distractors = pickDistractors(wordData.id, [wordData.word], 3);
    var correctDef = (wordData.definition || '').split('\\n')[0].replace(/^[a-z]+\.\s*/i, '').split(',')[0].trim();
    var options = [{ label: correctDef, isCorrect: true, id: wordData.id }];
    distractors.forEach(function(d) {
      options.push({ label: d.label, isCorrect: false, id: d.id });
    });
    // Shuffle
    for (var i = options.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = options[i]; options[i] = options[j]; options[j] = tmp;
    }
    self._correctIdx = options.findIndex(function(o) { return o.isCorrect; });

    var result = buildOptionGrid(container, options, function(idx, opt, btns) {
      if (self._answered) return;
      self._answered = true;
      self._selectedIdx = idx;
      self._buttons = btns;
      markOptionButtons(btns, self._correctIdx, idx);
      ctx.answer(opt.isCorrect, opt.label);
    });
    self._buttons = result.buttons;
    self._options = options;
  },
  handleKeydown: function(e, ctx) {
    if (this._answered) return false;
    var keyMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
    var idx = keyMap[e.key];
    if (idx !== undefined && this._buttons && this._buttons[idx]) {
      e.preventDefault();
      this._buttons[idx].click();
      return true;
    }
    return false;
  },
  destroy: function() {
    this._buttons = null;
    this._options = null;
    this._answered = false;
  }
});

// ── 3. MC Visual (See Word & Pick) ──

qt.define({
  id: 'mc_visual',
  label: 'Pick Meaning (visual)',
  icon: '👁',
  activate: function(container, wordData, ctx) {
    // Show the word prominently above the options
    var self = this;
    self._answered = false;
    self._correctIdx = -1;
    self._selectedIdx = -1;

    var distractors = pickDistractors(wordData.id, [wordData.word], 3);
    var correctDef = (wordData.definition || '').split('\\n')[0].replace(/^[a-z]+\.\s*/i, '').split(',')[0].trim();
    var options = [{ label: correctDef, isCorrect: true, id: wordData.id }];
    distractors.forEach(function(d) {
      options.push({ label: d.label, isCorrect: false, id: d.id });
    });
    for (var i = options.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = options[i]; options[i] = options[j]; options[j] = tmp;
    }
    self._correctIdx = options.findIndex(function(o) { return o.isCorrect; });

    container.innerHTML =
      '<div class="text-center mb-4">' +
        '<span class="text-2xl font-bold text-zinc-100">' + esc(wordData.word) + '</span>' +
      '</div>' +
      '<div id="qt-mc-visual-grid"></div>';
    var gridContainer = container.querySelector('#qt-mc-visual-grid');

    var result = buildOptionGrid(gridContainer, options, function(idx, opt, btns) {
      if (self._answered) return;
      self._answered = true;
      self._selectedIdx = idx;
      self._buttons = btns;
      markOptionButtons(btns, self._correctIdx, idx);
      ctx.answer(opt.isCorrect, opt.label);
    });
    self._buttons = result.buttons;
    self._options = options;
  },
  handleKeydown: function(e, ctx) {
    if (this._answered) return false;
    var keyMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
    var idx = keyMap[e.key];
    if (idx !== undefined && this._buttons && this._buttons[idx]) {
      e.preventDefault();
      this._buttons[idx].click();
      return true;
    }
    return false;
  },
  destroy: function() {
    this._buttons = null;
    this._options = null;
    this._answered = false;
  }
});

// ── 4. Collocation Choice ──

qt.define({
  id: 'collocation',
  label: 'Collocation',
  icon: '🔗',
  canRender: function(wordId) {
    var data = window.COLLOCATION_DATA && COLLOCATION_DATA[wordId];
    return data && data.length >= 2;
  },
  activate: function(container, wordData, ctx) {
    var self = this;
    self._answered = false;
    self._correctIdx = -1;

    var data = COLLOCATION_DATA[wordData.id];

    // Pick a random cluster as the source
    var cluster = data[Math.floor(Math.random() * data.length)];
    // Pick a random word from that cluster as the correct answer
    var correctWord = cluster.words[Math.floor(Math.random() * cluster.words.length)];
    var prompt = formatCollocPrompt(wordData.word, cluster.type);

    // Find 3 distractors — same type, invalid for this word
    var distractors = pickCollocDistractors(wordData.id, correctWord, cluster.type, 3);
    // If not enough distractors, supplement with dictionary words
    if (distractors.length < 3) {
      var more = pickDistractors(wordData.id, [correctWord].concat(distractors), 3 - distractors.length);
      distractors = distractors.concat(more.map(function(d) { return d.word; }));
    }

    var options = [{ label: correctWord, isCorrect: true }];
    distractors.slice(0, 3).forEach(function(d) {
      options.push({ label: d, isCorrect: false });
    });
    for (var i = options.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = options[i]; options[i] = options[j]; options[j] = tmp;
    }
    self._correctIdx = options.findIndex(function(o) { return o.isCorrect; });

    container.innerHTML =
      '<div class="text-center mb-4">' +
        '<span class="text-lg font-semibold text-brand-300">' + esc(prompt) + '</span>' +
      '</div>' +
      '<div id="qt-colloc-grid"></div>';
    var gridContainer = container.querySelector('#qt-colloc-grid');

    var result = buildOptionGrid(gridContainer, options, function(idx, opt, btns) {
      if (self._answered) return;
      self._answered = true;
      markOptionButtons(btns, self._correctIdx, idx);
      ctx.answer(opt.isCorrect, opt.label);
    });
    self._buttons = result.buttons;
  },
  handleKeydown: function(e, ctx) {
    if (this._answered) return false;
    var keyMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
    var idx = keyMap[e.key];
    if (idx !== undefined && this._buttons && this._buttons[idx]) {
      e.preventDefault();
      this._buttons[idx].click();
      return true;
    }
    return false;
  },
  destroy: function() {
    this._buttons = null;
    this._answered = false;
  }
});

// ── 6. Phonetic Spelling ──

qt.define({
  id: 'phonetic',
  label: 'Phonetic Spelling',
  icon: '📖',
  canRender: function(wordId, wordData) {
    return !!(wordData && wordData.phonetic && wordData.phonetic.length > 0);
  },
  activate: function(container, wordData, ctx) {
    var self = this;
    var phonetic = wordData.phonetic.replace(/^\/|\/$/g, '').trim();
    container.innerHTML =
      '<div class="flex flex-col items-center gap-3">' +
        '<span class="text-xl font-mono text-brand-300 tracking-wide">/' + esc(phonetic) + '/</span>' +
        '<input type="text" class="qt-spell-input w-full max-w-md text-center text-lg bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-5 py-3.5 text-zinc-100 placeholder-zinc-500 focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/30" placeholder="Type the word…" autocomplete="off" autocapitalize="off" spellcheck="false" />' +
      '</div>';
    var input = container.querySelector('.qt-spell-input');
    if (input) input.focus();

    self._input = input;
    self._submitted = false;

    self._doSubmit = function() {
      if (self._submitted || !self._input) return;
      var userInput = self._input.value.trim();
      if (!userInput) return;
      self._submitted = true;
      self._input.disabled = true;
      ctx.answer(userInput.toLowerCase() === wordData.word.toLowerCase(), userInput);
    };
  },
  handleKeydown: function(e, ctx) {
    if (e.key === 'Enter' && !ctx.isReviewing()) {
      e.preventDefault();
      if (this._doSubmit) this._doSubmit();
      return true;
    }
    return false;
  },
  destroy: function() {
    this._input = null;
    this._doSubmit = null;
    this._submitted = false;
  }
});

// ── 7. Synonym Choice ──

qt.define({
  id: 'synonym',
  label: 'Synonym',
  icon: '≈',
  canRender: function(wordId) {
    var syns = window.SYNONYM_ANTONYM_DATA && SYNONYM_ANTONYM_DATA[wordId] && SYNONYM_ANTONYM_DATA[wordId].synonyms;
    return syns && syns.length >= 3;
  },
  activate: function(container, wordData, ctx) {
    var self = this;
    self._answered = false;
    self._correctIdx = -1;

    var synData = SYNONYM_ANTONYM_DATA[wordData.id];
    var synonyms = synData.synonyms.slice(); // shallow copy

    // Shuffle and pick one as correct
    for (var i = synonyms.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = synonyms[i]; synonyms[i] = synonyms[j]; synonyms[j] = tmp;
    }
    var correctSyn = synonyms[0];

    // For distractors, use random words (not synonyms of this word)
    var synWords = new Set(synonyms.map(function(s) { return s.word.toLowerCase(); }));
    synWords.add(wordData.word.toLowerCase());
    var distractors = pickDistractors(wordData.id, Array.from(synWords), 3);

    var options = [{ label: correctSyn.word, isCorrect: true }];
    distractors.forEach(function(d) {
      options.push({ label: d.word, isCorrect: false });
    });
    for (var i = options.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = options[i]; options[i] = options[j]; options[j] = tmp;
    }
    self._correctIdx = options.findIndex(function(o) { return o.isCorrect; });

    container.innerHTML =
      '<div class="text-center mb-4">' +
        '<span class="text-xs text-zinc-500 uppercase tracking-wider">Synonym for</span>' +
        '<br><span class="text-xl font-bold text-zinc-100">' + esc(wordData.word) + '</span>' +
      '</div>' +
      '<div id="qt-synonym-grid"></div>';
    var gridContainer = container.querySelector('#qt-synonym-grid');

    var result = buildOptionGrid(gridContainer, options, function(idx, opt, btns) {
      if (self._answered) return;
      self._answered = true;
      markOptionButtons(btns, self._correctIdx, idx);
      ctx.answer(opt.isCorrect, opt.label);
    });
    self._buttons = result.buttons;
  },
  handleKeydown: function(e, ctx) {
    if (this._answered) return false;
    var keyMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
    var idx = keyMap[e.key];
    if (idx !== undefined && this._buttons && this._buttons[idx]) {
      e.preventDefault();
      this._buttons[idx].click();
      return true;
    }
    return false;
  },
  destroy: function() {
    this._buttons = null;
    this._answered = false;
  }
});

// ── 8. Antonym Choice ──

qt.define({
  id: 'antonym',
  label: 'Antonym',
  icon: '↔',
  canRender: function(wordId) {
    var ants = window.SYNONYM_ANTONYM_DATA && SYNONYM_ANTONYM_DATA[wordId] && SYNONYM_ANTONYM_DATA[wordId].antonyms;
    return ants && ants.length >= 1;
  },
  activate: function(container, wordData, ctx) {
    var self = this;
    self._answered = false;
    self._correctIdx = -1;

    var antData = SYNONYM_ANTONYM_DATA[wordData.id];
    var antonyms = antData.antonyms.slice();

    var correctAnt = antonyms[Math.floor(Math.random() * antonyms.length)];
    var antWords = new Set(antonyms.map(function(a) { return a.toLowerCase(); }));
    antWords.add(wordData.word.toLowerCase());
    var distractors = pickDistractors(wordData.id, Array.from(antWords), 3);

    var options = [{ label: correctAnt, isCorrect: true }];
    distractors.forEach(function(d) {
      options.push({ label: d.word, isCorrect: false });
    });
    for (var i = options.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = options[i]; options[i] = options[j]; options[j] = tmp;
    }
    self._correctIdx = options.findIndex(function(o) { return o.isCorrect; });

    container.innerHTML =
      '<div class="text-center mb-4">' +
        '<span class="text-xs text-zinc-500 uppercase tracking-wider">Antonym for</span>' +
        '<br><span class="text-xl font-bold text-zinc-100">' + esc(wordData.word) + '</span>' +
      '</div>' +
      '<div id="qt-antonym-grid"></div>';
    var gridContainer = container.querySelector('#qt-antonym-grid');

    var result = buildOptionGrid(gridContainer, options, function(idx, opt, btns) {
      if (self._answered) return;
      self._answered = true;
      markOptionButtons(btns, self._correctIdx, idx);
      ctx.answer(opt.isCorrect, opt.label);
    });
    self._buttons = result.buttons;
  },
  handleKeydown: function(e, ctx) {
    if (this._answered) return false;
    var keyMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
    var idx = keyMap[e.key];
    if (idx !== undefined && this._buttons && this._buttons[idx]) {
      e.preventDefault();
      this._buttons[idx].click();
      return true;
    }
    return false;
  },
  destroy: function() {
    this._buttons = null;
    this._answered = false;
  }
});

// ── 9. Derivational Form ──

qt.define({
  id: 'derivational',
  label: 'Derivational Form',
  icon: '🌳',
  canRender: function(wordId) {
    var derivs = window.DERIVATIONAL_DATA && DERIVATIONAL_DATA[wordId];
    return derivs && derivs.length >= 1;
  },
  activate: function(container, wordData, ctx) {
    var self = this;
    self._answered = false;
    self._correctIdx = -1;

    var derivations = DERIVATIONAL_DATA[wordData.id];
    // Filter to entries where this word is the source (isSource=1)
    var sourceDerivs = derivations.filter(function(d) { return d[6] === 1; });
    // Also include entries where this word IS the derived form (isSource=0)
    var targetDerivs = derivations.filter(function(d) { return d[6] === 0; });

    // Decide which type of gap to show
    var useTarget = targetDerivs.length > 0 && (sourceDerivs.length === 0 || Math.random() > 0.5);
    var deriv, correctWord, label1, label2;

    if (useTarget) {
      // This word IS the derived form. Gap: "___ → WORD"
      deriv = targetDerivs[Math.floor(Math.random() * targetDerivs.length)];
      correctWord = deriv[1]; // the related (source) word name
      label1 = '___';
      label2 = wordData.word;
    } else {
      // This word IS the source. Gap: "WORD → ___"
      deriv = sourceDerivs[Math.floor(Math.random() * sourceDerivs.length)];
      correctWord = deriv[1]; // the related (derived) word name
      label1 = wordData.word;
      label2 = '___';
    }

    var posLabel = deriv[5]; // toPOS (derived form's POS)
    var posNames = { noun: 'N.', verb: 'V.', adj: 'Adj.', adv: 'Adv.' };
    var posHint = posNames[posLabel] || posLabel;

    // Pick distractors: random words NOT in the derivational family
    var familyWords = new Set();
    derivations.forEach(function(d) { familyWords.add(d[1].toLowerCase()); });
    familyWords.add(wordData.word.toLowerCase());
    familyWords.add(correctWord.toLowerCase());
    var distractors = pickDistractors(wordData.id, Array.from(familyWords), 3);

    var options = [{ label: correctWord, isCorrect: true }];
    distractors.forEach(function(d) {
      options.push({ label: d.word, isCorrect: false });
    });
    for (var i = options.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = options[i]; options[i] = options[j]; options[j] = tmp;
    }
    self._correctIdx = options.findIndex(function(o) { return o.isCorrect; });

    container.innerHTML =
      '<div class="text-center mb-4 space-y-1">' +
        '<span class="text-xs text-zinc-500 uppercase tracking-wider">Word Family ' +
          '<span class="text-brand-400">' + esc(posHint) + '</span>' +
        '</span>' +
        '<div class="flex items-center justify-center gap-3 text-lg font-mono text-zinc-100">' +
          '<span class="bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-1.5">' + esc(label1) + '</span>' +
          '<span class="text-zinc-600">→</span>' +
          '<span class="bg-zinc-800/60 border border-brand-500/30 rounded-lg px-3 py-1.5 text-brand-300">' + esc(label2) + '</span>' +
        '</div>' +
      '</div>' +
      '<div id="qt-deriv-grid"></div>';
    var gridContainer = container.querySelector('#qt-deriv-grid');

    var result = buildOptionGrid(gridContainer, options, function(idx, opt, btns) {
      if (self._answered) return;
      self._answered = true;
      markOptionButtons(btns, self._correctIdx, idx);
      ctx.answer(opt.isCorrect, opt.label);
    });
    self._buttons = result.buttons;
  },
  handleKeydown: function(e, ctx) {
    if (this._answered) return false;
    var keyMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
    var idx = keyMap[e.key];
    if (idx !== undefined && this._buttons && this._buttons[idx]) {
      e.preventDefault();
      this._buttons[idx].click();
      return true;
    }
    return false;
  },
  destroy: function() {
    this._buttons = null;
    this._answered = false;
  }
});

})(window.VocabGym);
