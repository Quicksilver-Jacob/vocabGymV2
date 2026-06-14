// VocabGym - Namespace & Bootstrap
window.VocabGym = window.VocabGym || {};

(function(ns) {
  // Unified modal close — single Escape handler for all popovers
  function closeAllModals() {
    // Priority: word card → search dropdown → keyboard modal → profile manager → share → upload
    var wordcard = document.getElementById('wordcard-overlay');
    var searchDrop = document.getElementById('dict-dropdown');
    var searchInput = document.getElementById('header-dict-search');
    var keyboardModal = document.getElementById('keyboard-modal');
    var upload = document.getElementById('upload-modal');
    var share = document.getElementById('share-modal');
    var profileMgr = document.getElementById('profile-manage-modal');

    if (wordcard && !wordcard.classList.contains('hidden')) {
      if (ns.wordcard && ns.wordcard.close) ns.wordcard.close();
      return;
    }
    if (searchDrop && !searchDrop.classList.contains('hidden')) {
      if (ns.dictionaryLookup && ns.dictionaryLookup.closeDropdown) {
        ns.dictionaryLookup.closeDropdown(true);
      } else {
        searchDrop.classList.add('hidden');
        if (searchInput) searchInput.blur();
      }
      return;
    }
    if (keyboardModal && !keyboardModal.classList.contains('hidden')) {
      if (ns.keyboard && ns.keyboard.close) ns.keyboard.close();
      return;
    }
    if (profileMgr && !profileMgr.classList.contains('hidden')) {
      profileMgr.classList.add('hidden');
      return;
    }
    if (share && !share.classList.contains('hidden')) {
      if (ns.share && ns.share.closeModal) ns.share.closeModal();
      return;
    }
    if (upload && !upload.classList.contains('hidden')) {
      upload.classList.add('hidden');
      return;
    }
    // No modal open — if session is active, Esc quits the session
    var dv = document.getElementById('dictation-view');
    if (dv && !dv.classList.contains('hidden') && ns.sessionCore && ns.sessionCore.isSessionActive()) {
      ns.sessionCore.quitSession();
    }
  }

  // Register all keyboard shortcuts with the centralized registry
  function _registerKeybindings() {
    var kb = ns.keybindings;

    kb.register('open_shortcuts', 'system', '?', 'Open keyboard shortcuts panel', function() {
      if (ns.keyboard && ns.keyboard.toggle) ns.keyboard.toggle();
    });
    kb.register('focus_search', 'system', 'Ctrl+K', 'Focus dictionary search bar', function() {
      var el = document.getElementById('header-dict-search');
      if (el) { el.focus(); el.select(); }
    });

    kb.register('submit_answer', 'session', 'Enter', 'Submit answer / Advance to next word', null);
    kb.register('prev_word', 'navigation', 'ArrowLeft', 'Go to previous word (during review)', null);
    kb.register('next_word', 'navigation', 'ArrowRight', 'Go to next word (during review)', null);
    kb.register('cycle_proficiency', 'proficiency', '`', 'Cycle proficiency level', null);
    kb.register('mc_option_1', 'answer', '1', 'Select answer option 1', null);
    kb.register('mc_option_2', 'answer', '2', 'Select answer option 2', null);
    kb.register('mc_option_3', 'answer', '3', 'Select answer option 3', null);
    kb.register('mc_option_4', 'answer', '4', 'Select answer option 4', null);
    kb.register('sentence_audio', 'audio', 'F2', 'Play sample sentence audio', null);
    kb.register('word_audio', 'audio', 'Ctrl+Space', 'Replay word pronunciation audio', null);
  }

  // Update loading screen status message + progress bar
  function updateLoaderStatus(msg, pct) {
    var el = document.getElementById('loader-status');
    var bar = document.getElementById('loader-progress-bar');
    if (el) el.textContent = msg;
    if (bar && typeof pct === 'number') bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
  }

  // Delete all local progress with multi-step confirmation
  ns.deleteProgress = function() {
    var step1 = confirm('Delete ALL learning progress?\n\nThis includes mastery status, attempt counts, and word statistics for every word.\n\nThis CANNOT be undone.');
    if (!step1) return;

    var input = prompt('Type DELETE to confirm permanent erasure of all progress:', '');
    if (input !== 'DELETE') {
      alert('Deletion cancelled. Type exactly DELETE to confirm.');
      return;
    }

    // Delete current profile's progress from IndexedDB
    var pid = ns.db.getCurrentProfileIdSync();
    ns.db.deleteProfile(pid).then(function() {
      // Re-create a fresh default profile
      return ns.db.createProfile('Default');
    }).then(function(newId) {
      return ns.db.setCurrentProfileId(newId);
    }).then(function() {
      if (ns.dashboard && ns.dashboard.updateStats) ns.dashboard.updateStats();
      if (ns.dashboard && ns.dashboard.updateHeaderStats) ns.dashboard.updateHeaderStats();
      if (ns.ledger && ns.ledger.render) ns.ledger.render();
      alert('All progress has been deleted. The page will now refresh.');
      location.reload();
    });
  };

  document.addEventListener('DOMContentLoaded', function() {
    // Step 1: Init IndexedDB (async)
    updateLoaderStatus('Initializing database…', 5);
    ns.db.init().then(function() {
      updateLoaderStatus('Database ready', 20);
      // Step 2: Migrate from localStorage if needed (one-time)
      if (ns.db.needsMigration()) {
        updateLoaderStatus('Migrating from legacy storage…', 25);
        return ns.db.migrateFromLocalStorage().then(function(migrated) {
          if (migrated) console.log('[Bootstrap] Migration from localStorage complete');
          updateLoaderStatus('Migration complete', 35);
        });
      }
    }).then(function() {
      // Step 3: Init dictionary (sync)
      updateLoaderStatus('Loading dictionary…', 40);
      if (!ns.centralDictionary.init()) {
        alert('Failed to load dictionary. Please refresh the page.');
        return;
      }

      // Step 4: Init all modules
      updateLoaderStatus('Starting speech engine…', 50);
      ns.speech.init();
      updateLoaderStatus('Preparing dashboard…', 55);
      ns.dashboard.init();
      ns.ledger.init();
      updateLoaderStatus('Loading practice modes…', 60);
      ns.dictation.init();
      ns.multipleChoice.init();
      ns.mixedMode.init();
      updateLoaderStatus('Starting search engine…', 65);
      ns.dictionaryLookup.init();
      ns.wordcard.init();
      ns.share.init();
      ns.profiles.init();

      try {
        ns.fileUploader.init();
      } catch (e) {
        console.error('File uploader init failed:', e);
      }
      ns.sw.init();

      // Init keyboard shortcuts modal + stats view
      updateLoaderStatus('Loading shortcuts panel…', 72);
      ns.keyboard.init();
      // ns.stats.init(); // Learning Stats disabled for now

      // Restore selected lists or auto-select first available
      updateLoaderStatus('Restoring your session…', 75);
      var selected = ns.state.getSelectedLists();
      if (selected.length === 0) {
        var listNames = ns.state.getListNames();
        if (listNames.length > 0) {
          ns.state.setSelectedLists([listNames[0]]);
        }
      }
      ns.dashboard.refreshListPicker();

      // Render SRS panel
      if (ns.srs && ns.srs.renderPanel) ns.srs.renderPanel();

      // Bind SRS review button
      var btnSRSReview = document.getElementById('btn-start-srs-review');
      if (btnSRSReview) {
        btnSRSReview.addEventListener('click', function() {
          if (ns.srs && ns.srs.startSRSReview) ns.srs.startSRSReview();
        });
      }

      // Bind SM-2 review ratio slider
      var srsSlider = document.getElementById('srs-ratio-slider');
      var srsRatioVal = document.getElementById('srs-ratio-value');
      if (srsSlider) {
        // Restore saved ratio (default 0)
        var savedRatio = parseInt(localStorage.getItem('english_vocab_gym_srs_ratio')) || 0;
        if (isNaN(savedRatio) || savedRatio < 0) savedRatio = 0;
        if (savedRatio > 100) savedRatio = 100;
        srsSlider.value = savedRatio;
        if (srsRatioVal) srsRatioVal.textContent = savedRatio;
        srsSlider.addEventListener('input', function() {
          var val = parseInt(srsSlider.value) || 0;
          if (srsRatioVal) srsRatioVal.textContent = val;
          localStorage.setItem('english_vocab_gym_srs_ratio', val);
        });
      }

      // Bind dashboard mode selection buttons
      function applyModeBtnStyle(btn, isActive) {
        btn.className = 'mode-select-btn text-xs font-semibold px-3 py-1.5 rounded-md transition-all ' +
          (isActive ? 'bg-brand-500/15 text-brand-400' : 'text-zinc-500 hover:text-zinc-200');
      }

      function showSubOptions(mode) {
        var dictSub = document.getElementById('dictation-sub-options');
        var mcSub = document.getElementById('mc-sub-options');
        var mixCfg = document.getElementById('mixed-type-config');
        if (dictSub) dictSub.classList.toggle('active', mode === 'dictation');
        if (mcSub) mcSub.classList.toggle('active', mode === 'multipleChoice');
        if (mixCfg) mixCfg.classList.toggle('active', mode === 'mixed');
        // Update mode hint
        var hint = document.getElementById('mode-hint');
        if (hint) {
          if (mode === 'dictation') hint.textContent = 'Listen & spell the word';
          else if (mode === 'multipleChoice') hint.textContent = 'Pick the correct definition';
          else hint.textContent = 'Mixed question types by weight';
        }
      }

      document.querySelectorAll('.mode-select-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var modeName = this.getAttribute('data-mode');
          document.querySelectorAll('.mode-select-btn').forEach(function(b) {
            applyModeBtnStyle(b, b === btn);
          });
          showSubOptions(modeName);
          try { localStorage.setItem('english_vocab_gym_session_mode', modeName); } catch (_) {}
          ns.playSFX('click');
        });
      });

      // Submode toggle buttons
      function applySubmodeToggleStyle(btn, isActive) {
        btn.className = 'submode-toggle-btn text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all ' +
          (isActive ? 'bg-brand-500/15 text-brand-400' : 'text-zinc-500 hover:text-zinc-300');
      }

      document.querySelectorAll('.submode-toggle-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var mode = this.getAttribute('data-mode');
          var value = this.getAttribute('data-value');
          document.querySelectorAll('.submode-toggle-btn[data-mode="' + mode + '"]').forEach(function(b) {
            applySubmodeToggleStyle(b, b.getAttribute('data-value') === value);
          });
          var key = mode === 'mc' ? 'english_vocab_gym_mc_submode' : 'english_vocab_gym_dictation_submode';
          try { localStorage.setItem(key, value); } catch (_) {}
          ns.playSFX('click');
        });
      });

      // Filter toggle buttons — sync hidden radio inputs
      function applyFilterToggleStyle(btn, isActive) {
        btn.className = 'filter-toggle-btn text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all ' +
          (isActive ? 'bg-brand-500/15 text-brand-400' : 'text-zinc-500 hover:text-zinc-300');
      }

      document.querySelectorAll('.filter-toggle-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var filter = this.getAttribute('data-filter');
          document.querySelectorAll('.filter-toggle-btn').forEach(function(b) {
            applyFilterToggleStyle(b, b.getAttribute('data-filter') === filter);
          });
          var radio = document.querySelector('input[name="session-filter"][value="' + filter + '"]');
          if (radio) radio.checked = true;
          var accRow = document.getElementById('accuracy-threshold-row');
          if (accRow) accRow.classList.toggle('active', filter === 'low-accuracy');
          ns.playSFX('click');
        });
      });

      // Order toggle buttons — sync hidden radio inputs
      function applyOrderToggleStyle(btn, isActive) {
        btn.className = 'order-toggle-btn text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all ' +
          (isActive ? 'bg-brand-500/15 text-brand-400' : 'text-zinc-500 hover:text-zinc-300');
      }

      document.querySelectorAll('.order-toggle-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var order = this.getAttribute('data-order');
          document.querySelectorAll('.order-toggle-btn').forEach(function(b) {
            applyOrderToggleStyle(b, b.getAttribute('data-order') === order);
          });
          var radio = document.querySelector('input[name="session-order"][value="' + order + '"]');
          if (radio) radio.checked = true;
          ns.playSFX('click');
        });
      });

      // ── Mixed mode weight config UI ──
      (function() {
        var grid = document.getElementById('mixed-type-grid');
        if (!grid || !ns.questionTypes) return;

        function renderWeightGrid() {
          var types = ns.questionTypes.ALL;
          var weights = ns.mixedMode.getWeights();
          var html = '';
          for (var id in types) {
            var type = types[id];
            var w = weights[id] !== undefined ? weights[id] : 5;
            var enabled = w > 0;
            html +=
              '<div class="flex items-center gap-2.5 bg-zinc-900/50 border ' + (enabled ? 'border-zinc-700/60' : 'border-zinc-800/40') + ' rounded-lg px-3 py-2 transition-all duration-200 hover:border-zinc-600/60 group">' +
                // Toggle pill
                '<button class="mixed-toggle-btn flex-shrink-0 w-8 h-[18px] rounded-full transition-all duration-200 border ' +
                  (enabled ? 'bg-brand-500/30 border-brand-500/50 shadow-[0_0_6px_rgba(20,184,166,0.2)]' : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600') +
                  '" data-type="' + id + '" title="' + (enabled ? 'Disable' : 'Enable') + ' ' + escHtml(type.label) + '">' +
                  '<div class="w-3 h-3 rounded-full transition-all duration-200 ' +
                    (enabled ? 'bg-brand-400 translate-x-[14px] shadow-[0_0_4px_rgba(20,184,166,0.5)]' : 'bg-zinc-500 translate-x-[2px]') + '"></div>' +
                '</button>' +
                // Label
                '<span class="text-[11px] font-medium text-zinc-300 flex-1 min-w-0 truncate">' + escHtml(type.icon) + ' ' + escHtml(type.label) + '</span>' +
                // Weight slider
                '<input type="range" min="0" max="10" value="' + w + '" class="mixed-weight-slider w-14 h-1 accent-brand-500 cursor-pointer ' + (enabled ? '' : 'opacity-30 pointer-events-none') + '" data-type="' + id + '" title="Weight: ' + w + '" />' +
                // Weight badge
                '<span class="mixed-weight-val text-[10px] font-mono font-bold w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ' +
                  (enabled ? 'bg-brand-500/15 text-brand-400' : 'bg-zinc-800 text-zinc-600') + '" data-type="' + id + '">' + w + '</span>' +
              '</div>';
          }
          grid.innerHTML = html;

          // Bind toggle clicks
          grid.querySelectorAll('.mixed-toggle-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              var typeId = this.getAttribute('data-type');
              ns.mixedMode.toggleType(typeId);
              renderWeightGrid();
              ns.playSFX('click');
            });
          });

          // Bind slider inputs
          grid.querySelectorAll('.mixed-weight-slider').forEach(function(slider) {
            slider.addEventListener('input', function() {
              var typeId = this.getAttribute('data-type');
              var val = parseInt(this.value) || 0;
              ns.mixedMode.setWeight(typeId, val);
              var card = slider.parentElement;
              var toggle = grid.querySelector('.mixed-toggle-btn[data-type="' + typeId + '"]');
              var valBadge = grid.querySelector('.mixed-weight-val[data-type="' + typeId + '"]');
              if (valBadge) valBadge.textContent = val;
              if (val === 0) {
                if (card) { card.classList.remove('border-zinc-700/60'); card.classList.add('border-zinc-800/40'); }
                if (toggle) {
                  toggle.classList.remove('bg-brand-500/30', 'border-brand-500/50', 'shadow-[0_0_6px_rgba(20,184,166,0.2)]');
                  toggle.classList.add('bg-zinc-800', 'border-zinc-700');
                  var dot = toggle.querySelector('div');
                  if (dot) { dot.classList.remove('bg-brand-400', 'shadow-[0_0_4px_rgba(20,184,166,0.5)]'); dot.classList.add('bg-zinc-500'); dot.style.transform = 'translateX(2px)'; }
                }
                slider.classList.add('opacity-30', 'pointer-events-none');
                if (valBadge) { valBadge.classList.remove('bg-brand-500/15', 'text-brand-400'); valBadge.classList.add('bg-zinc-800', 'text-zinc-600'); }
              } else {
                if (card) { card.classList.add('border-zinc-700/60'); card.classList.remove('border-zinc-800/40'); }
                if (toggle) {
                  toggle.classList.add('bg-brand-500/30', 'border-brand-500/50', 'shadow-[0_0_6px_rgba(20,184,166,0.2)]');
                  toggle.classList.remove('bg-zinc-800', 'border-zinc-700');
                  var dot = toggle.querySelector('div');
                  if (dot) { dot.classList.add('bg-brand-400', 'shadow-[0_0_4px_rgba(20,184,166,0.5)]'); dot.classList.remove('bg-zinc-500'); dot.style.transform = 'translateX(14px)'; }
                }
                slider.classList.remove('opacity-30', 'pointer-events-none');
                if (valBadge) { valBadge.classList.add('bg-brand-500/15', 'text-brand-400'); valBadge.classList.remove('bg-zinc-800', 'text-zinc-600'); }
              }
            });
          });
        }

        function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

        renderWeightGrid();
      })();

      // Restore saved mode + submode selection on load
      (function() {
        var savedMode;
        try { savedMode = localStorage.getItem('english_vocab_gym_session_mode'); } catch (_) {}
        var btnId;
        if (savedMode === 'multipleChoice') btnId = 'mode-btn-mc';
        else if (savedMode === 'mixed') btnId = 'mode-btn-mixed';
        else btnId = 'mode-btn-dictation';
        var modeBtn = document.getElementById(btnId);
        if (modeBtn) {
          document.querySelectorAll('.mode-select-btn').forEach(function(b) {
            applyModeBtnStyle(b, b === modeBtn);
          });
          showSubOptions(savedMode || 'dictation');
        }

        var dictSubmode, mcSubmode;
        try {
          dictSubmode = localStorage.getItem('english_vocab_gym_dictation_submode') || 'standard';
          mcSubmode = localStorage.getItem('english_vocab_gym_mc_submode') || 'audio';
        } catch (_) { dictSubmode = 'standard'; mcSubmode = 'audio'; }

        document.querySelectorAll('.submode-toggle-btn[data-mode="dictation"]').forEach(function(b) {
          applySubmodeToggleStyle(b, b.getAttribute('data-value') === dictSubmode);
        });
        document.querySelectorAll('.submode-toggle-btn[data-mode="mc"]').forEach(function(b) {
          applySubmodeToggleStyle(b, b.getAttribute('data-value') === mcSubmode);
        });
      })();

      // Register all keyboard shortcuts in the centralized registry
      _registerKeybindings();

      // Global keydown: capture mode > Escape > session > input guard > registry
      document.addEventListener('keydown', function(e) {
        // Check if key rebind capture is active (always process this)
        if (ns.keybindings && ns.keybindings._handleCapture(e)) return;
        // Escape always closes topmost modal
        if (e.key === 'Escape') { closeAllModals(); return; }
        // During session, delegate to session-core for mode-specific handling
        // Must come BEFORE input guard so session keys (Enter, F2, etc.) work while typing
        var dv = document.getElementById('dictation-view');
        if (dv && !dv.classList.contains('hidden')) {
          if (ns.sessionCore) ns.sessionCore.handleInputKeydowns(e);
          return;
        }
        // Don't hijack shortcuts when user is typing in an input (dashboard mode only)
        var tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (document.activeElement && document.activeElement.isContentEditable)) return;
        // Otherwise try the centralized registry
        if (ns.keybindings) ns.keybindings.handleKeydown(e);
      });

      // Wire up keyboard modal entry buttons
      var btnHeaderKb = document.getElementById('header-keyboard-btn');
      var btnFooterKb = document.getElementById('btn-footer-keyboard');
      if (btnHeaderKb) {
        btnHeaderKb.addEventListener('click', function() {
          if (ns.keyboard && ns.keyboard.open) ns.keyboard.open();
        });
      }
      if (btnFooterKb) {
        btnFooterKb.addEventListener('click', function() {
          if (ns.keyboard && ns.keyboard.open) ns.keyboard.open();
        });
      }

      // Hide loading screen after full initialization
      updateLoaderStatus('Ready!', 100);
      var loader = document.getElementById('app-loader');
      if (loader) {
        setTimeout(function() { loader.classList.add('hidden'); }, 200);
      }
    }).catch(function(e) {
      console.error('[Bootstrap] Init failed:', e);
      var loader = document.getElementById('app-loader');
      if (loader) loader.classList.add('hidden');
      alert('Failed to initialize the app. Please refresh the page.');
    });
  });
})(window.VocabGym);
