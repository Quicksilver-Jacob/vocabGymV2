// VocabGym - Keyboard shortcuts modal
window.VocabGym = window.VocabGym || {};
(function(ns) {

ns.keyboard = {
  init: function() {
    this._modal = document.getElementById('keyboard-modal');
    if (!this._modal) return;

    var btnClose = document.getElementById('btn-keyboard-close');
    if (btnClose) btnClose.addEventListener('click', function() { ns.keyboard.close(); });

    this._modal.addEventListener('click', function(e) {
      if (e.target === ns.keyboard._modal) ns.keyboard.close();
    });

    this._buildKeyboardLayout();
  },

  toggle: function() {
    if (this._modal.classList.contains('hidden')) this.open();
    else this.close();
  },

  open: function() {
    this._buildKeyboardLayout();
    this._buildShortcutList();
    this._modal.classList.remove('hidden');
  },

  close: function() {
    this._modal.classList.add('hidden');
    if (ns.keybindings) ns.keybindings.cancelCapture();
  },

  _normalizeKeyLabel: function(k) {
    if (k === 'ArrowLeft') return '←';
    if (k === 'ArrowRight') return '→';
    if (k === 'ArrowUp') return '↑';
    if (k === 'ArrowDown') return '↓';
    return k;
  },

  _buildKeyboardLayout: function() {
    var container = document.getElementById('keyboard-layout');
    if (!container) return;

    var bindings = ns.keybindings.getAllBindings();
    var keyMap = {};
    var hasCtrl = false, hasAlt = false;
    var self = this;

    bindings.forEach(function(b) {
      var k = b.key;
      if (k.indexOf('+') !== -1) {
        var parts = k.split('+');
        for (var pi = 0; pi < parts.length; pi++) {
          var p = parts[pi].trim();
          if (p === 'Ctrl') hasCtrl = true;
          else if (p === 'Alt') hasAlt = true;
        }
        var mainKey = self._normalizeKeyLabel(parts[parts.length - 1]);
        if (mainKey === 'Space') keyMap[mainKey] = b;
        else if (mainKey.length === 1) keyMap[mainKey.toUpperCase()] = b;
        else keyMap[mainKey] = b;
      } else {
        var norm = self._normalizeKeyLabel(k);
        if (norm.length === 1) keyMap[norm.toUpperCase()] = b;
        else keyMap[norm] = b;
      }
    });
    if (hasCtrl) keyMap['Ctrl'] = { group: 'system', description: 'Modifier' };
    if (hasAlt) keyMap['Alt'] = { group: 'system', description: 'Modifier' };

    // Helper: render a single key
    function keyHTML(label, w, h, fontSize) {
      w = w || 7; h = h || 7; fontSize = fontSize || '10px';
      var keyInfo = keyMap[label] || null;
      var color = keyInfo ? ns.keybindings.getGroupColor(keyInfo.group) : null;
      var style = 'width:' + (w * 0.25) + 'rem;height:' + (h * 0.25) + 'rem;font-size:' + fontSize;
      var cls = 'rounded-md border flex items-center justify-center font-mono font-bold flex-shrink-0 leading-none';
      if (color) {
        return '<div class="' + cls + ' ' + color.bg + ' ' + color.border + ' ' + color.text +
          ' shadow-inner shadow-white/5 cursor-default relative" style="' + style + '" title="' + ns.keyboard._esc(keyInfo.description) + '">' + label + '</div>';
      }
      return '<div class="' + cls + ' bg-zinc-800/30 border-zinc-700/30 text-zinc-600" style="' + style + '">' + label + '</div>';
    }

    // Helper: render a row of keys with 2px gap
    function rowHTML(keys) {
      var h = '<div class="flex items-center" style="gap:2px">';
      for (var i = 0; i < keys.length; i++) {
        if (keys[i] === '|') { h += '<div class="flex-shrink-0" style="width:10px"></div>'; continue; }
        var def = keys[i].split(':');
        var label = def[0];
        var w = def[1] ? parseFloat(def[1].replace(/^\D+/, '')) : 7;
        var fs = def[2] || null;
        h += keyHTML(label, w, 7, fs);
      }
      h += '</div>';
      return h;
    }

    // Three columns: main keyboard | nav + arrows | numpad
    // All columns have 6 rows each, vertically aligned

    // Key width: 1u = 7 units. Each row totals exactly 15u = 105 units.
    // Standard:7  1.25u:8.75  1.5u:10.5  1.75u:12.25  2u:14  2.25u:15.75  2.75u:19.25  6.25u:43.75

    // --- Main keyboard (6 rows) ---
    var mainRows = [
      // Row 0: Function keys (F1-F12 in groups of 4, Esc separated)
      ['Esc', '|', 'F1','F2','F3','F4', '|', 'F5','F6','F7','F8', '|', 'F9','F10','F11','F12'],
      // Row 1: 13×7 + Backspace(2u=14) = 105
      ['`','1','2','3','4','5','6','7','8','9','0','-','=','Backspace:14:8px'],
      // Row 2: Tab(1.5u=10.5) + 10×7 + [](7+7) + \(1.5u=10.5) = 105
      ['Tab:10.5:9px','Q','W','E','R','T','Y','U','I','O','P','[',']','\\:10.5:9px'],
      // Row 3: Caps(1.75u=12.25) + 9×7 + ;'(7+7) + Enter(2.25u=15.75) = 105
      ['Caps:12.25:8px','A','S','D','F','G','H','J','K','L',';',"'",'Enter:15.75:8px'],
      // Row 4: LShift(2.25u=15.75) + 7×7 + ,./(7+7+7) + RShift(2.75u=19.25) = 105
      ['Shift:15.75:8px','Z','X','C','V','B','N','M',',','.','/','Shift:19.25:8px'],
      // Row 5: Ctrl(1.25u=8.75)×2 + Win(1.25u=8.75)×2 + Alt(1.25u=8.75)×2 + Menu(1.25u=8.75) + Space(6.25u=43.75) = 105
      ['Ctrl:8.75:8px','Win:8.75:8px','Alt:8.75:8px','Space:43.75:8px','Alt:8.75:8px','Win:8.75:8px','Menu:8.75:7px','Ctrl:8.75:8px']
    ];

    // --- Nav + arrows column (6 rows) ---
    var navRows = [
      // Row 0: System keys above nav cluster — standard 1u each
      ['PrtSc:7:7px','ScrLk:7:7px','Pause:7:7px'],
      // Row 1: Nav top
      ['Ins','Home','PgUp'],
      // Row 2: Nav bottom
      ['Del','End','PgDn'],
      // Row 3: empty — natural gap between nav cluster and arrow keys
      [],
      // Row 4: Up arrow centered
      ['↑'],
      // Row 5: Left, Down, Right
      ['←','↓','→']
    ];

    // --- Numpad column (6 rows) ---
    var numRows = [
      // Row 0: empty above numpad
      [],
      // Row 1: NumLock row
      ['NumLk', '/', '*', '-'],
      // Row 2
      ['7','8','9','+'],
      // Row 3
      ['4','5','6','+'],
      // Row 4 — numpad Enter spans 2 rows on real keyboard (single row here)
      ['1','2','3','Enter:7:7px'],
      // Row 5 — numpad 0 is 2u wide
      ['0:14:8px','.','Enter:7:7px']
    ];

    var html = '<div class="bg-zinc-900/50 rounded-xl border border-zinc-800/60 p-4 shadow-lg overflow-x-auto">';
    html += '<div class="flex justify-center" style="gap:16px">';

    // Column 1: Main keyboard
    html += '<div style="display:flex;flex-direction:column;gap:2px">';
    for (var r = 0; r < mainRows.length; r++) {
      html += rowHTML(mainRows[r]);
    }
    html += '</div>';

    // Column 2: Nav cluster + arrow keys
    html += '<div style="display:flex;flex-direction:column;gap:2px">';
    for (var r = 0; r < navRows.length; r++) {
      if (navRows[r].length === 0) {
        // Empty spacer row (row 3: gap between nav cluster and arrows)
        html += '<div style="height:28px"></div>';
      } else if (navRows[r][0] === '↑') {
        // Center the up arrow
        html += '<div class="flex justify-center" style="gap:2px">';
        html += keyHTML('↑', 7, 7, '12px');
        html += '</div>';
      } else {
        html += rowHTML(navRows[r]);
      }
    }
    html += '</div>';

    // Column 3: Numpad
    html += '<div style="display:flex;flex-direction:column;gap:2px">';
    for (var r = 0; r < numRows.length; r++) {
      if (numRows[r].length === 0) {
        html += '<div style="height:28px"></div>';
      } else {
        html += rowHTML(numRows[r]);
      }
    }
    html += '</div>';

    html += '</div>'; // end flex row
    html += '</div>'; // end container

    // Legend
    html += '<div class="flex justify-center gap-3 mt-4 flex-wrap">';
    var shown = {};
    var ordered = ['session','audio','navigation','proficiency','answer','system'];
    for (var gi = 0; gi < ordered.length; gi++) {
      var g = ordered[gi];
      if (shown[g]) continue;
      var hasBindings = bindings.some(function(b) { return b.group === g; });
      if (!hasBindings) continue;
      shown[g] = true;
      var c = ns.keybindings.getGroupColor(g);
      html += '<span class="flex items-center gap-1.5 text-[10px] text-zinc-500"><span class="w-3 h-3 rounded ' + c.bg + ' border ' + c.border + '"></span>' + c.label + '</span>';
    }
    html += '</div>';

    container.innerHTML = html;
  },

  _buildShortcutList: function() {
    var container = document.getElementById('keyboard-shortcut-list');
    if (!container) return;

    var bindings = ns.keybindings.getAllBindings();
    var groups = {};
    bindings.forEach(function(b) {
      if (!groups[b.group]) groups[b.group] = [];
      groups[b.group].push(b);
    });

    var keyUsage = {};
    bindings.forEach(function(b) {
      if (!keyUsage[b.key]) keyUsage[b.key] = [];
      keyUsage[b.key].push(b.id);
    });

    var order = ['session', 'audio', 'navigation', 'proficiency', 'answer', 'system'];
    var labels = {
      session: 'During Session', audio: 'Audio Controls', navigation: 'Navigation',
      proficiency: 'Proficiency', answer: 'Answer Selection', system: 'System'
    };

    var html = '';
    for (var gi = 0; gi < order.length; gi++) {
      var g = order[gi];
      var items = groups[g];
      if (!items || items.length === 0) continue;
      var color = ns.keybindings.getGroupColor(g);

      html += '<div class="mb-5">';
      html += '<h4 class="text-xs font-semibold ' + color.text + ' mb-2 flex items-center gap-2"><span class="w-2 h-2 rounded-full ' + color.bg + ' border ' + color.border + '"></span>' + (labels[g] || g) + '</h4>';

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var hasConflict = keyUsage[item.key] && keyUsage[item.key].length > 1;

        html += '<div class="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-zinc-800/30 transition-colors group">' +
          '<kbd class="bg-zinc-800 border border-zinc-700 text-zinc-200 px-2.5 py-0.5 rounded font-mono font-bold text-[11px] min-w-[60px] text-center whitespace-nowrap relative cursor-pointer hover:ring-1 hover:ring-brand-500/30 hover:border-brand-500/50 transition-all btn-rebind-kbd" data-id="' + item.id + '" title="Click to customize shortcut">' +
            ns.keyboard._esc(item.key) +
            (hasConflict ? '<span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border border-amber-400 cursor-help" title="Shortcut conflict: this key is also used by another shortcut"></span>' : '') +
          '</kbd>' +
          '<span class="flex-1 text-xs text-zinc-400">' +
            ns.keyboard._esc(item.description) +
            (hasConflict ? '<span class="inline-block ml-1.5 text-[10px] text-amber-500/80 font-medium">Conflict</span>' : '') +
          '</span>' +
          '<div class="flex items-center gap-1 flex-shrink-0">' +
            '<button class="text-[10px] text-brand-400 hover:text-brand-300 font-medium px-2 py-1 rounded hover:bg-brand-500/10 transition-colors opacity-0 group-hover:opacity-100 btn-rebind" data-id="' + item.id + '">Customize</button>' +
            (item.isCustom ? '<button class="text-[10px] text-zinc-400 hover:text-zinc-200 font-medium px-2 py-1 rounded hover:bg-zinc-700/50 transition-colors bg-zinc-800/50 border border-zinc-700/50 btn-reset-binding" data-id="' + item.id + '" title="Reset to default">Reset</button>' : '') +
          '</div>' +
        '</div>';
      }
      html += '</div>';
    }

    var customCount = Object.keys(ns.keybindings._customMap || {}).length;
    if (customCount > 0) {
      html += '<div class="border-t border-zinc-800 pt-4 mt-2">' +
        '<button id="btn-reset-all-bindings" class="text-xs text-rose-400 hover:text-rose-300 font-medium px-3 py-2 rounded-lg border border-rose-500/20 hover:bg-rose-500/10 transition-all w-full">Reset All Custom Bindings (' + customCount + ' custom)</button>' +
        '</div>';
    }

    container.innerHTML = html;

    var self = this;
    container.querySelectorAll('.btn-rebind').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        self._startRebind(this.getAttribute('data-id'), this);
      });
    });
    container.querySelectorAll('.btn-rebind-kbd').forEach(function(kbd) {
      kbd.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        var row = this.closest('.flex');
        var btn = row ? row.querySelector('.btn-rebind[data-id="' + id + '"]') : null;
        self._startRebind(id, btn || this);
      });
    });
    container.querySelectorAll('.btn-reset-binding').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        ns.keybindings.resetBinding(this.getAttribute('data-id'));
        ns.playSFX('click');
        self._buildShortcutList();
        self._buildKeyboardLayout();
      });
    });

    var resetBtn = document.getElementById('btn-reset-all-bindings');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        if (confirm('Reset all keyboard shortcuts to their default bindings?')) {
          ns.keybindings.resetAll();
          ns.playSFX('click');
          self._buildShortcutList();
          self._buildKeyboardLayout();
        }
      });
    }
  },

  _startRebind: function(id, btnElement) {
    var self = this;
    if (this._rebindActive) return;
    this._rebindActive = true;

    var originalText = btnElement.textContent;
    var originalClasses = btnElement.className;

    btnElement.textContent = 'Press a key...';
    btnElement.classList.add('animate-pulse');
    if (btnElement.disabled !== undefined) btnElement.disabled = true;

    ns.keybindings.startCapture(function(keyStr) {
      self._rebindActive = false;
      btnElement.classList.remove('animate-pulse');

      if (keyStr === null) {
        btnElement.textContent = 'Cannot use this key';
        btnElement.className = originalClasses + ' text-rose-400';
        setTimeout(function() {
          btnElement.textContent = originalText;
          btnElement.className = originalClasses;
          if (btnElement.disabled !== undefined) btnElement.disabled = false;
        }, 1600);
        return;
      }

      var conflicts = ns.keybindings.getConflicts(id, keyStr);
      if (conflicts.length > 0) {
        var conflictNames = conflicts.map(function(c) { return c.description; }).join(', ');
        if (!confirm('"' + keyStr + '" is already used by: ' + conflictNames + '.\n\nAssign anyway?')) {
          btnElement.textContent = originalText;
          btnElement.className = originalClasses;
          if (btnElement.disabled !== undefined) btnElement.disabled = false;
          return;
        }
      }

      ns.keybindings.setCustomKey(id, keyStr);
      ns.playSFX('correct');
      self._buildShortcutList();
      self._buildKeyboardLayout();
    });

    setTimeout(function() {
      if (ns.keybindings._isCapturing) {
        ns.keybindings.cancelCapture();
        self._rebindActive = false;
        btnElement.classList.remove('animate-pulse');
        btnElement.textContent = originalText;
        btnElement.className = originalClasses;
        if (btnElement.disabled !== undefined) btnElement.disabled = false;
      }
    }, 5000);
  },

  _esc: function(text) {
    if (typeof text !== 'string') return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

})(window.VocabGym);
