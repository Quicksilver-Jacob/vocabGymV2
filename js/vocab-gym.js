// VocabGym - Namespace & Bootstrap
window.VocabGym = window.VocabGym || {};

(function(ns) {
  // Unified modal close — single Escape handler for all popovers
  function closeAllModals() {
    // Priority: word card → search dropdown → profile manager → share → upload
    var wordcard = document.getElementById('wordcard-overlay');
    var searchDrop = document.getElementById('dict-dropdown');
    var searchInput = document.getElementById('header-dict-search');
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
    ns.db.init().then(function() {
      // Step 2: Migrate from localStorage if needed (one-time)
      if (ns.db.needsMigration()) {
        return ns.db.migrateFromLocalStorage().then(function(migrated) {
          if (migrated) console.log('[Bootstrap] Migration from localStorage complete');
        });
      }
    }).then(function() {
      // Step 3: Init dictionary (sync)
      if (!ns.centralDictionary.init()) {
        alert('Failed to load dictionary. Please refresh the page.');
        return;
      }

      // Step 4: Init all modules
      ns.speech.init();
      ns.dashboard.init();
      ns.ledger.init();
      ns.dictation.init();
      ns.multipleChoice.init();
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

      // Restore selected lists or auto-select first available
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
        if (dictSub) dictSub.classList.toggle('hidden', mode !== 'dictation');
        if (mcSub) mcSub.classList.toggle('hidden', mode !== 'multipleChoice');
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

      // Restore saved mode + submode selection on load
      (function() {
        var savedMode;
        try { savedMode = localStorage.getItem('english_vocab_gym_session_mode'); } catch (_) {}
        var btnId = savedMode === 'multipleChoice' ? 'mode-btn-mc' : 'mode-btn-dictation';
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

      // Session keyboard routing (delegates to active mode)
      document.addEventListener('keydown', function(e) {
        var dv = document.getElementById('dictation-view');
        if (!dv || dv.classList.contains('hidden')) return;
        if (ns.sessionCore) ns.sessionCore.handleInputKeydowns(e);
      });

      // Register unified Escape handler after all modules initialized
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeAllModals();
      });

      // Hide loading screen after full initialization
      var loader = document.getElementById('app-loader');
      if (loader) loader.classList.add('hidden');
    }).catch(function(e) {
      console.error('[Bootstrap] Init failed:', e);
      var loader = document.getElementById('app-loader');
      if (loader) loader.classList.add('hidden');
      alert('Failed to initialize the app. Please refresh the page.');
    });
  });
})(window.VocabGym);
