// VocabGym - Service Worker Registration & PWA UI
window.VocabGym = window.VocabGym || {};
(function(ns) {

var _installPrompt = null;

ns.sw = {
  init: function() {
    // Inject manifest link (only for HTTP — file:// causes CORS noise)
    if (window.location.protocol !== 'file:') {
      var manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.href = '/manifest.json';
      document.head.appendChild(manifestLink);
    }

    if (!('serviceWorker' in navigator)) return;
    // file:// protocol can't register service workers — skip silently
    if (window.location.protocol === 'file:') return;
    this._register();
    this._listenForInstall();
    this._listenForConnectivity();
  },

  _register: function() {
    navigator.serviceWorker.register('/sw.js').then(function(reg) {
      console.log('[SW] Registered');

      // Listen for updates
      reg.addEventListener('updatefound', function() {
        var newWorker = reg.installing;
        newWorker.addEventListener('statechange', function() {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            ns.sw._showUpdatePrompt();
          }
        });
      });
    }).catch(function(e) {
      // Expected on file://, HTTP servers without HTTPS, etc.
      console.warn('[SW] Registration unavailable:', e.message);
    });
  },

  _listenForInstall: function() {
    var self = this;
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      _installPrompt = e;
      self._showInstallButton();
    });

    window.addEventListener('appinstalled', function() {
      _installPrompt = null;
      self._hideInstallButton();
      console.log('[PWA] App installed');
    });
  },

  _listenForConnectivity: function() {
    var indicator = document.getElementById('offline-indicator');
    if (!indicator) return;

    var updateStatus = function() {
      if (navigator.onLine) {
        indicator.classList.add('hidden');
      } else {
        indicator.classList.remove('hidden');
      }
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
  },

  _showInstallButton: function() {
    var btn = document.getElementById('btn-install-app');
    if (btn) {
      btn.classList.remove('hidden');
      btn.addEventListener('click', function() {
        if (_installPrompt) {
          _installPrompt.prompt();
          _installPrompt.userChoice.then(function(result) {
            console.log('[PWA] Install:', result.outcome);
            _installPrompt = null;
            btn.classList.add('hidden');
          });
        }
      });
    }
  },

  _hideInstallButton: function() {
    var btn = document.getElementById('btn-install-app');
    if (btn) btn.classList.add('hidden');
  },

  _showUpdatePrompt: function() {
    var banner = document.getElementById('update-banner');
    if (!banner) return;
    banner.classList.remove('hidden');
    document.getElementById('btn-update-reload').addEventListener('click', function() {
      window.location.reload();
    });
    document.getElementById('btn-update-dismiss').addEventListener('click', function() {
      banner.classList.add('hidden');
    });
  }
};

})(window.VocabGym);
