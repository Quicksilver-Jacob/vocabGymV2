// VocabGym - speech
window.VocabGym = window.VocabGym || {};
(function(ns) {

ns.speech = {
  voices: [],
  _syncGuard: false,

  init() {
    if (!window.speechSynthesis) return;

    this.bindAccentToggles();
    this.bindTTSSourceToggles();

    const loadVoices = () => {
      this.voices = window.speechSynthesis.getVoices();
      this.refreshAllVoiceSelectors();
    };

    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();

    // Popover toggle
    const btnSettings = document.getElementById('btn-voice-settings');
    const popover = document.getElementById('voice-popover');
    if (btnSettings && popover) {
      btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !popover.classList.contains('hidden');
        if (isOpen) {
          popover.classList.add('hidden');
        } else {
          this.populateVoicePopover();
          popover.classList.remove('hidden');
        }
      });

      // Close popover on outside click
      document.addEventListener('mousedown', (e) => {
        if (!popover.classList.contains('hidden') &&
            !popover.contains(e.target) &&
            e.target !== btnSettings &&
            !btnSettings.contains(e.target)) {
          popover.classList.add('hidden');
        }
      });

      // Close popover on Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !popover.classList.contains('hidden')) {
          popover.classList.add('hidden');
        }
      });
    }

    // Sync: ns.dashboard voice select <-> hidden session select
    const dashboardSelect = document.getElementById('voice-selector');
    const sessionSelect = document.getElementById('session-voice-selector');

    if (dashboardSelect && sessionSelect) {
      dashboardSelect.addEventListener('change', () => {
        if (this._syncGuard) return;
        this._syncGuard = true;
        sessionSelect.value = dashboardSelect.value;
        this.updateVoiceLabels();
        this._syncGuard = false;
      });
      sessionSelect.addEventListener('change', () => {
        if (this._syncGuard) return;
        this._syncGuard = true;
        dashboardSelect.value = sessionSelect.value;
        this.updateVoiceLabels();
        this._syncGuard = false;
      });
    }

    // Sync: popover rate <-> hidden session rate <-> ns.dashboard rate
    const popoverRate = document.getElementById('popover-voice-rate');
    const rateSlider = document.getElementById('voice-rate');
    const sessionRate = document.getElementById('session-voice-rate');
    const popoverRateVal = document.getElementById('popover-rate-value');

    if (popoverRate && sessionRate) {
      popoverRate.addEventListener('input', () => {
        sessionRate.value = popoverRate.value;
        if (rateSlider) rateSlider.value = popoverRate.value;
        const rateText = parseFloat(popoverRate.value).toFixed(1) + 'x';
        if (popoverRateVal) popoverRateVal.textContent = rateText;
        const rateValue = document.getElementById('rate-value');
        if (rateValue) rateValue.textContent = rateText;
        this.updateVoiceLabels();
      });
    }
    if (rateSlider && sessionRate) {
      rateSlider.addEventListener('input', () => {
        if (this._syncGuard) return;
        this._syncGuard = true;
        sessionRate.value = rateSlider.value;
        if (popoverRate) popoverRate.value = rateSlider.value;
        const rateText = parseFloat(rateSlider.value).toFixed(1) + 'x';
        if (popoverRateVal) popoverRateVal.textContent = rateText;
        this.updateVoiceLabels();
        this._syncGuard = false;
      });
    }

    // Set initial TTS source UI state
    this._updateTTSSourceUI();
  },

  bindAccentToggles() {
    const self = this;
    const accentButtons = document.querySelectorAll('.accent-toggle-btn');

    function updateAllAccentButtons(accent) {
      accentButtons.forEach(function(btn) {
        if (btn.dataset.accent === accent) {
          btn.classList.add('bg-brand-500/15', 'border-brand-500/30', 'text-brand-400');
          btn.classList.remove('bg-zinc-800/60', 'border-zinc-700', 'text-zinc-400');
        } else {
          btn.classList.remove('bg-brand-500/15', 'border-brand-500/30', 'text-brand-400');
          btn.classList.add('bg-zinc-800/60', 'border-zinc-700', 'text-zinc-400');
        }
      });
    }

    // Set initial state
    var current = self.getAudioPreference();
    updateAllAccentButtons(current);

    accentButtons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var accent = this.dataset.accent;
        self.setAudioPreference(accent);
        updateAllAccentButtons(accent);
        ns.playSFX && ns.playSFX('click');
      });
    });
  },

  bindTTSSourceToggles() {
    var self = this;
    var buttons = document.querySelectorAll('.tts-source-btn');
    buttons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var source = this.dataset.source;
        self.setTTSSource(source);
        self._updateTTSSourceUI();
        ns.playSFX && ns.playSFX('click');
      });
    });
  },

  refreshAllVoiceSelectors() {
    this.populateVoiceSelector('voice-selector');
    this.populateVoiceSelector('session-voice-selector');

    // Sync hidden session selector from ns.dashboard if not yet set
    const dashboardSelect = document.getElementById('voice-selector');
    const sessionSelect = document.getElementById('session-voice-selector');
    if (dashboardSelect && sessionSelect && !sessionSelect.value) {
      sessionSelect.value = dashboardSelect.value;
    }
    this.populateVoicePopover();
    this.updateVoiceLabels();

    // Init popover rate and session rate from ns.dashboard rate
    const rateSlider = document.getElementById('voice-rate');
    const sessionRate = document.getElementById('session-voice-rate');
    const popoverRate = document.getElementById('popover-voice-rate');
    const popoverRateVal = document.getElementById('popover-rate-value');
    if (rateSlider && sessionRate) sessionRate.value = rateSlider.value;
    if (rateSlider && popoverRate) popoverRate.value = rateSlider.value;
    if (popoverRateVal) popoverRateVal.textContent = parseFloat(popoverRate?.value || 1).toFixed(1) + 'x';
  },

  populateVoiceSelector(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const prevKey = select.value;
    select.innerHTML = '';

    const enVoices = this.voices.filter(v => /^en[-_]/i.test(v.lang));

    const offline = enVoices.filter(v => v.localService);
    const online = enVoices.filter(v => !v.localService);
    offline.sort((a, b) => {
      const aGoogle = /google/i.test(a.name);
      const bGoogle = /google/i.test(b.name);
      if (aGoogle && !bGoogle) return -1;
      if (!aGoogle && bGoogle) return 1;
      return 0;
    });

    const voicesToUse = [...offline, ...online];

    if (voicesToUse.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No English voices';
      select.appendChild(opt);
      return;
    }

    const voiceKey = v => v.name + '\x00' + v.lang;

    // Default: prefer Google, then first offline
    let selectedIdx = 0;
    const google = voicesToUse.findIndex(v => /google/i.test(v.name));
    if (google >= 0) selectedIdx = google;

    // Keep previously selected voice by composite key
    if (prevKey) {
      const kept = voicesToUse.findIndex(v => voiceKey(v) === prevKey);
      if (kept >= 0) selectedIdx = kept;
    }

    voicesToUse.forEach((v, index) => {
      const opt = document.createElement('option');
      opt.value = voiceKey(v);

      let label = v.name;
      label += v.localService ? ' (Offline)' : ' (Online)';
      opt.textContent = label;
      if (index === selectedIdx) opt.selected = true;
      select.appendChild(opt);
    });
  },

  populateVoicePopover() {
    const list = document.getElementById('voice-popover-list');
    if (!list) return;

    const sessionSelect = document.getElementById('session-voice-selector');
    const currentKey = sessionSelect?.value || document.getElementById('voice-selector')?.value || '';

    const enVoices = this.voices.filter(v => /^en[-_]/i.test(v.lang));
    const offline = enVoices.filter(v => v.localService);
    const online = enVoices.filter(v => !v.localService);
    offline.sort((a, b) => {
      const aGoogle = /google/i.test(a.name);
      const bGoogle = /google/i.test(b.name);
      if (aGoogle && !bGoogle) return -1;
      if (!aGoogle && bGoogle) return 1;
      return 0;
    });
    const voicesToUse = [...offline, ...online];
    const voiceKey = v => v.name + '\x00' + v.lang;

    list.innerHTML = '';

    let section = '';
    voicesToUse.forEach(v => {
      const type = v.localService ? 'Offline' : 'Online';
      if (type !== section) {
        section = type;
        const header = document.createElement('div');
        header.className = 'px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500';
        header.textContent = type;
        list.appendChild(header);
      }

      const key = voiceKey(v);
      const isSelected = key === currentKey;

      const item = document.createElement('div');
      item.className = 'flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-zinc-800/60 transition-colors text-xs';
      item.dataset.voiceKey = key;

      const check = document.createElement('span');
      check.className = 'w-4 text-center flex-shrink-0 text-brand-400 text-[10px]';
      check.textContent = isSelected ? '✓' : '';

      const name = document.createElement('span');
      name.className = 'text-zinc-300 truncate';
      name.textContent = v.name;

      item.appendChild(check);
      item.appendChild(name);

      item.addEventListener('click', () => {
        this.selectVoice(key);
        document.getElementById('voice-popover').classList.add('hidden');
      });

      list.appendChild(item);
    });

    // Update popover rate
    const popoverRate = document.getElementById('popover-voice-rate');
    const sessionRate = document.getElementById('session-voice-rate');
    if (popoverRate && sessionRate) popoverRate.value = sessionRate.value;
    const popoverRateVal = document.getElementById('popover-rate-value');
    if (popoverRateVal) popoverRateVal.textContent = parseFloat(popoverRate?.value || 1).toFixed(1) + 'x';

    // Update TTS source toggle UI
    this._updateTTSSourceUI();
  },

  _updateTTSSourceUI() {
    var source = this.getTTSSource();
    var activeClass = 'bg-brand-500/15 border-brand-500/30 text-brand-400';
    var inactiveClass = 'bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200';
    var baseClass = 'text-xs font-semibold py-1.5 px-2 rounded-lg border transition-all tts-source-btn whitespace-nowrap';

    // Update all TTS source button pairs (dashboard + session popover)
    var pairs = [
      ['popover-source-youdao', 'popover-source-webspeech'],
      ['dashboard-source-youdao', 'dashboard-source-webspeech']
    ];
    pairs.forEach(function(pair) {
      var youdaoBtn = document.getElementById(pair[0]);
      var webspeechBtn = document.getElementById(pair[1]);
      if (youdaoBtn && webspeechBtn) {
        if (source === 'youdao') {
          youdaoBtn.className = baseClass + ' ' + activeClass;
          webspeechBtn.className = baseClass + ' ' + inactiveClass;
        } else {
          webspeechBtn.className = baseClass + ' ' + activeClass;
          youdaoBtn.className = baseClass + ' ' + inactiveClass;
        }
      }
    });

    // Toggle Youdao vs Web Speech settings sections in both locations
    ['popover', 'dashboard'].forEach(function(prefix) {
      var youdaoSettings = document.getElementById(prefix + '-youdao-settings');
      var webspeechSettings = document.getElementById(prefix + '-webspeech-settings');
      if (youdaoSettings) {
        youdaoSettings.classList.toggle('hidden', source !== 'youdao');
      }
      if (webspeechSettings) {
        webspeechSettings.classList.toggle('hidden', source !== 'webspeech');
      }
    });

    this._updateVoiceLabel();
  },

  _updateVoiceLabel() {
    var label = document.getElementById('active-voice-label');
    if (!label) return;
    var source = this.getTTSSource();
    if (source === 'youdao') {
      label.textContent = 'Youdao';
      label.classList.remove('text-zinc-500');
      label.classList.add('text-zinc-300');
    } else {
      var key = document.getElementById('session-voice-selector')?.value || '';
      var voices = window.speechSynthesis.getVoices();
      var voice = voices.find(function(v) { return (v.name + '\x00' + v.lang) === key; });
      if (voice) {
        var shortName = voice.name.length > 16 ? voice.name.substring(0, 15) + '…' : voice.name;
        label.textContent = shortName;
        label.classList.remove('text-zinc-500');
        label.classList.add('text-zinc-300');
      } else {
        label.textContent = 'Web Speech';
        label.classList.add('text-zinc-500');
        label.classList.remove('text-zinc-300');
      }
    }
  },

  selectVoice(key) {
    const dashboardSelect = document.getElementById('voice-selector');
    const sessionSelect = document.getElementById('session-voice-selector');

    this._syncGuard = true;
    if (dashboardSelect) dashboardSelect.value = key;
    if (sessionSelect) sessionSelect.value = key;
    this._syncGuard = false;

    this.updateVoiceLabels();
    this.populateVoicePopover();
  },

  updateVoiceLabels() {
    this._updateVoiceLabel();
    const rateLabel = document.getElementById('active-rate-label');
    const rate = document.getElementById('session-voice-rate')?.value || '1.0';
    if (rateLabel) rateLabel.textContent = '· ' + parseFloat(rate).toFixed(1) + 'x';
  },

  getActiveVoice() {
    // Use session selector during dictation, dashboard selector otherwise
    const dictView = document.getElementById('dictation-view');
    const inSession = dictView && !dictView.classList.contains('hidden');
    const select = inSession ?
                    document.getElementById('session-voice-selector') :
                    document.getElementById('voice-selector');

    if (select && select.value && select.value !== 'default') {
      const fresh = window.speechSynthesis.getVoices();
      const byKey = fresh.find(v => (v.name + '\x00' + v.lang) === select.value);
      if (byKey) return byKey;
    }
    const fresh = window.speechSynthesis.getVoices();
    return fresh.find(v => /^en[-_]/i.test(v.lang) && v.localService)
        || fresh.find(v => /^en[-_]/i.test(v.lang))
        || null;
  },

  getActiveRate() {
    const sessionRate = document.getElementById('session-voice-rate');
    if (sessionRate && sessionRate.value) return parseFloat(sessionRate.value) || 1.0;
    const rateSlider = document.getElementById('voice-rate');
    if (rateSlider) return parseFloat(rateSlider.value) || 1.0;
    return 1.0;
  },

  pronounce(text, onEnd) {
    if (!window.speechSynthesis) {
      if (typeof onEnd === 'function') onEnd();
      return;
    }
    window.speechSynthesis.cancel();

    if (this.voices.length === 0) {
      this.voices = window.speechSynthesis.getVoices();
      if (this.voices.length === 0) {
        if (typeof onEnd === 'function') onEnd();
        return;
      }
      this.refreshAllVoiceSelectors();
    }

    const textToSpeak = text.replace(/[\[\](){}\/\\⟨⟩‿ˈˌː.]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    const voice = this.getActiveVoice();
    if (voice) utterance.voice = voice;

    utterance.rate = this.getActiveRate();
    utterance.pitch = 1.0;

    if (typeof onEnd === 'function') {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }

    // Chrome drops utterances spoken immediately after cancel()
    setTimeout(() => window.speechSynthesis.speak(utterance), 20);
  },

  speakSentence(text) {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();

    const cleaned = text.replace(/[\[\](){}\/\\⟨⟩‿ˈˌː.]/g, '').trim();
    if (!cleaned) return;

    const utterance = new SpeechSynthesisUtterance(cleaned);

    const voice = this.getActiveVoice();
    if (voice) utterance.voice = voice;

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Chrome drops utterances spoken immediately after cancel()
    setTimeout(() => window.speechSynthesis.speak(utterance), 20);
  },

  // ── TTS Source ──
  // 'youdao' = Youdao DictVoice (default), 'webspeech' = Web Speech API

  TTS_SOURCE_KEY: 'english_vocab_gym_tts_source',

  getTTSSource() {
    try { return localStorage.getItem(this.TTS_SOURCE_KEY) || 'youdao'; }
    catch (_) { return 'youdao'; }
  },

  setTTSSource(source) {
    try { localStorage.setItem(this.TTS_SOURCE_KEY, source); } catch (_) {}
  },

  // ── Youdao dictvoice API ──

  _dictvoiceCache: {},
  _dictvoiceAudio: null,
  _audioPreference: null,

  AUDIO_PREF_KEY: 'english_vocab_gym_audio_preference',

  getAudioPreference() {
    if (this._audioPreference) return this._audioPreference;
    try {
      this._audioPreference = localStorage.getItem(this.AUDIO_PREF_KEY) || 'us';
    } catch (_) { this._audioPreference = 'us'; }
    return this._audioPreference;
  },

  setAudioPreference(pref) {
    this._audioPreference = pref;
    try { localStorage.setItem(this.AUDIO_PREF_KEY, pref); } catch (_) {}
  },

  // Unified play: respects TTS source setting
  playWord(word, onEnd) {
    if (this.getTTSSource() === 'webspeech') {
      this.pronounce(word, onEnd);
    } else {
      this.playDictvoice(word, null, onEnd);
    }
  },

  // Unified preload: respects TTS source setting
  preloadWord(word) {
    if (this.getTTSSource() === 'youdao') {
      this.preloadDictvoice(word);
    }
    // Web Speech doesn't need preloading
  },

  // Play word pronunciation via Youdao dictvoice (free, no API key)
  // accent: 'uk' (type=1) or 'us' (type=2)
  playDictvoice(word, accent, onEnd) {
    accent = accent || this.getAudioPreference();
    var type = accent === 'uk' ? 1 : 2;
    var cacheKey = word.toLowerCase() + '|' + accent;

    if (this._dictvoiceCache[cacheKey]) {
      this._playDictvoiceCached(cacheKey, word, onEnd);
      return;
    }

    var url = 'https://dict.youdao.com/dictvoice?type=' + type + '&audio=' + encodeURIComponent(word);
    var audio = new Audio(url);
    var self = this;
    if (typeof onEnd === 'function') audio.onended = onEnd;
    audio.play().catch(function() {
      self.pronounce(word);
      if (typeof onEnd === 'function') onEnd();
    });
  },

  // Preload audio blob for dictation sessions
  preloadDictvoice(word) {
    var accent = this.getAudioPreference();
    var cacheKey = word.toLowerCase() + '|' + accent;
    if (this._dictvoiceCache[cacheKey]) return;

    var type = accent === 'uk' ? 1 : 2;
    var url = 'https://dict.youdao.com/dictvoice?type=' + type + '&audio=' + encodeURIComponent(word);
    var self = this;
    fetch(url).then(function(r) { return r.blob(); }).then(function(blob) {
      self._dictvoiceCache[cacheKey] = URL.createObjectURL(blob);
      // Limit cache to 100 entries
      var keys = Object.keys(self._dictvoiceCache);
      if (keys.length > 100) {
        URL.revokeObjectURL(self._dictvoiceCache[keys[0]]);
        delete self._dictvoiceCache[keys[0]];
      }
    }).catch(function() {});
  },

  _playDictvoiceCached(cacheKey, word, onEnd) {
    var audio = new Audio(this._dictvoiceCache[cacheKey]);
    var self = this;
    if (typeof onEnd === 'function') audio.onended = onEnd;
    audio.play().catch(function() {
      self.pronounce(word || '');
      if (typeof onEnd === 'function') onEnd();
    });
  }
};
})(window.VocabGym);
