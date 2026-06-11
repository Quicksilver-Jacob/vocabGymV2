// VocabGym - Profile Management UI
window.VocabGym = window.VocabGym || {};
(function(ns) {

ns.profiles = {
  init: function() {
    this._populateSwitcher();
    this._bindEvents();
  },

  _populateSwitcher: function() {
    var self = this;
    var select = document.getElementById('profile-select');
    if (!select) return;
    ns.db.getProfiles().then(function(profiles) {
      select.innerHTML = '';
      profiles.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.profileId;
        opt.textContent = p.name;
        select.appendChild(opt);
      });
      var currentId = ns.db.getCurrentProfileIdSync();
      if (currentId) select.value = String(currentId);
    });
  },

  _bindEvents: function() {
    var self = this;
    var select = document.getElementById('profile-select');
    var btnNew = document.getElementById('btn-new-profile');
    var btnManage = document.getElementById('btn-manage-profiles');

    if (select) {
      select.addEventListener('change', function() {
        var id = Number(this.value);
        if (id === ns.db.getCurrentProfileIdSync()) return;
        self.switchProfile(id);
      });
    }

    if (btnNew) {
      btnNew.addEventListener('click', function() { self._createNewProfile(); });
    }

    if (btnManage) {
      btnManage.addEventListener('click', function() { self._openManageModal(); });
    }

    // Manage modal buttons
    var modal = document.getElementById('profile-manage-modal');
    if (modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.classList.add('hidden');
      });

      document.getElementById('btn-profile-rename')?.addEventListener('click', function() { self._renameProfile(); });
      document.getElementById('btn-profile-delete')?.addEventListener('click', function() { self._deleteProfile(); });
      document.getElementById('btn-profile-export')?.addEventListener('click', function() { self._exportProfile(); });
      document.getElementById('btn-profile-import')?.addEventListener('click', function() { self._importProfile(); });
      document.getElementById('btn-profile-merge')?.addEventListener('click', function() { self._mergeProfiles(); });
      document.getElementById('btn-profile-close-manage')?.addEventListener('click', function() { modal.classList.add('hidden'); });
    }
  },

  switchProfile: function(profileId) {
    var self = this;
    ns.db.setCurrentProfileId(profileId).then(function() {
      self._populateSwitcher();
      ns.state._userProgress = null; // Invalidate legacy cache
      // Refresh dashboard (syncSelectionToState also calls updateStats/updateHeaderStats)
      if (ns.dashboard && ns.dashboard.syncSelectionToState) ns.dashboard.syncSelectionToState();
      if (ns.ledger && ns.ledger.render) ns.ledger.render();
      if (ns.playSFX) ns.playSFX('click');
    });
  },

  _createNewProfile: function() {
    var self = this;
    var name = prompt('Enter profile name:', 'Profile ' + new Date().getFullYear());
    if (!name || !name.trim()) return;
    name = name.trim();
    ns.db.createProfile(name).then(function(id) {
      self._populateSwitcher();
      var select = document.getElementById('profile-select');
      if (select) select.value = String(id);
      ns.db.setCurrentProfileId(id).then(function() {
        ns.state._userProgress = null;
        if (ns.dashboard && ns.dashboard.syncSelectionToState) ns.dashboard.syncSelectionToState();
        if (ns.ledger && ns.ledger.render) ns.ledger.render();
      });
      ns.playSFX && ns.playSFX('click');
    });
  },

  _openManageModal: function() {
    var modal = document.getElementById('profile-manage-modal');
    if (!modal) return;
    var self = this;
    // Populate profile list in modal
    ns.db.getProfiles().then(function(profiles) {
      var currentId = ns.db.getCurrentProfileIdSync();
      var currentProfile = profiles.find(function(p) { return p.profileId === currentId; });

      var infoEl = document.getElementById('profile-manage-current');
      if (infoEl && currentProfile) {
        infoEl.textContent = 'Current: ' + currentProfile.name + ' (' + Object.keys(ns.db.getAllProgressCacheSync()).length + ' words with progress)';
      }

      var mergeSelect = document.getElementById('profile-merge-source');
      if (mergeSelect) {
        mergeSelect.innerHTML = '';
        profiles.forEach(function(p) {
          if (p.profileId !== currentId) {
            var opt = document.createElement('option');
            opt.value = p.profileId;
            opt.textContent = p.name;
            mergeSelect.appendChild(opt);
          }
        });
      }

      var deleteSelect = document.getElementById('profile-delete-select');
      if (deleteSelect) {
        deleteSelect.innerHTML = '';
        profiles.forEach(function(p) {
          var opt = document.createElement('option');
          opt.value = p.profileId;
          opt.textContent = p.name + (p.profileId === currentId ? ' (current)' : '');
          if (p.profileId === currentId) opt.disabled = true;
          deleteSelect.appendChild(opt);
        });
      }

      modal.classList.remove('hidden');
    });
  },

  _renameProfile: function() {
    var self = this;
    var currentId = ns.db.getCurrentProfileIdSync();
    ns.db.getProfile(currentId).then(function(profile) {
      var newName = prompt('Rename profile:', profile.name);
      if (!newName || !newName.trim()) return;
      ns.db.updateProfile(currentId, { name: newName.trim() }).then(function() {
        self._populateSwitcher();
        ns.playSFX && ns.playSFX('click');
      });
    });
  },

  _deleteProfile: function() {
    var self = this;
    var select = document.getElementById('profile-delete-select');
    if (!select || !select.value) return;
    var id = Number(select.value);
    ns.db.getProfile(id).then(function(profile) {
      if (!confirm('Delete profile "' + profile.name + '" and ALL its progress?\n\nThis CANNOT be undone.')) return;
      var input = prompt('Type DELETE to confirm permanent erasure of profile "' + profile.name + '":', '');
      if (input !== 'DELETE') { alert('Deletion cancelled.'); return; }
      ns.db.deleteProfile(id).then(function() {
        // Switch to another profile if we deleted the current one
        if (id === ns.db.getCurrentProfileIdSync()) {
          ns.db.getProfiles().then(function(profiles) {
            if (profiles.length > 0) {
              ns.db.setCurrentProfileId(profiles[0].profileId).then(function() {
                ns.state._userProgress = null;
                self._populateSwitcher();
                self._openManageModal();
                if (ns.dashboard && ns.dashboard.syncSelectionToState) ns.dashboard.syncSelectionToState();
                if (ns.ledger && ns.ledger.render) ns.ledger.render();
              });
            }
          });
        } else {
          self._populateSwitcher();
          self._openManageModal();
        }
        ns.playSFX && ns.playSFX('click');
      });
    });
  },

  _exportProfile: function() {
    if (ns.share && ns.share.openExportModal) {
      ns.share.openExportModal();
    }
    var modal = document.getElementById('profile-manage-modal');
    if (modal) modal.classList.add('hidden');
  },

  _importProfile: function() {
    if (ns.share && ns.share.openImportModal) {
      ns.share.openImportModal();
    }
    var modal = document.getElementById('profile-manage-modal');
    if (modal) modal.classList.add('hidden');
  },

  _mergeProfiles: function() {
    var self = this;
    var select = document.getElementById('profile-merge-source');
    if (!select || !select.value) return;
    var sourceId = Number(select.value);
    var targetId = ns.db.getCurrentProfileIdSync();
    ns.db.getProfile(sourceId).then(function(srcProfile) {
      ns.db.getProfile(targetId).then(function(tgtProfile) {
        if (!confirm('Merge all progress from "' + srcProfile.name + '" into "' + tgtProfile.name + '"?\n\n' +
            'Best stats will be kept for each word.')) return;
        ns.db.mergeProfiles(sourceId, targetId).then(function() {
          alert('Profiles merged successfully!');
          ns.db.setCurrentProfileId(targetId).then(function() {
            ns.state._userProgress = null;
            self._populateSwitcher();
            self._openManageModal();
            if (ns.dashboard && ns.dashboard.syncSelectionToState) ns.dashboard.syncSelectionToState();
            if (ns.ledger && ns.ledger.render) ns.ledger.render();
          });
          ns.playSFX && ns.playSFX('correct');
        });
      });
    });
  }
};

})(window.VocabGym);
