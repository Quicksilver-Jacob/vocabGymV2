// VocabGym - IndexedDB persistence layer
window.VocabGym = window.VocabGym || {};
(function(ns) {

const DB_NAME = 'VocabGymDB';
const DB_VERSION = 2;
const STORE_PROFILES = 'profiles';
const STORE_PROGRESS = 'wordProgress';
const STORE_LISTS = 'lists';
const STORE_SETTINGS = 'settings';
const STORE_SRS = 'srsData';
const STORE_DAILY_STATS = 'dailyStats';

var _db = null;
var _currentProfileId = null;
var _progressCache = {};   // { wordId: {correct, wrong, status} } for current profile
var _srsCache = {};         // { wordId: {interval, easeFactor, repetitions, nextReview, ...} }
var _listCache = {};        // { listName: {name, wordIds, createdAt} }
var _listNamesCache = [];   // [listName, ...]
var _selectedListsCache = []; // [listName, ...] — per-profile selected book lists
var _dailyStatsCache = {};  // { 'YYYY-MM-DD': {wordsPracticed, correctCount, wrongCount} }

// ── Database open/upgrade ──

function openDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_PROFILES)) {
        var profiles = db.createObjectStore(STORE_PROFILES, { keyPath: 'profileId', autoIncrement: true });
        profiles.createIndex('name', 'name', { unique: true });
      }
      if (!db.objectStoreNames.contains(STORE_PROGRESS)) {
        db.createObjectStore(STORE_PROGRESS, { keyPath: ['profileId', 'wordId'] });
      }
      if (!db.objectStoreNames.contains(STORE_LISTS)) {
        db.createObjectStore(STORE_LISTS, { keyPath: ['profileId', 'listName'] });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: ['profileId', 'key'] });
      }
      if (!db.objectStoreNames.contains(STORE_SRS)) {
        var srs = db.createObjectStore(STORE_SRS, { keyPath: ['profileId', 'wordId'] });
        srs.createIndex('profileId', 'profileId', { unique: false });
        srs.createIndex('nextReview', 'nextReview', { unique: false });
      }
      if (e.oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE_DAILY_STATS)) {
          var dailyStats = db.createObjectStore(STORE_DAILY_STATS, { keyPath: ['profileId', 'date'] });
          dailyStats.createIndex('profileId', 'profileId', { unique: false });
        }
      }
    };
    req.onsuccess = function(e) { _db = e.target.result; resolve(_db); };
    req.onerror = function(e) { reject(e.target.error); };
  });
}

function txn(storeName, mode) {
  var tx = _db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

function promiseReq(req) {
  return new Promise(function(resolve, reject) {
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function(e) { reject(e.target.error); };
  });
}

function promiseTx(tx) {
  return new Promise(function(resolve, reject) {
    tx.oncomplete = function() { resolve(); };
    tx.onerror = function(e) { reject(e.target.error); };
  });
}

// ── Public API ──

ns.db = {
  init: function() {
    var self = this;
    return openDB().then(function() {
      return self._loadCurrentProfileId();
    }).then(function() {
      return Promise.all([self._loadProgressCache(), self._loadListCache(_currentProfileId), self._loadSelectedListsCache(), self._loadSRSCache(), self._loadDailyStatsCache()]);
    });
  },

  // ── Profiles ──

  createProfile: function(name) {
    var store = txn(STORE_PROFILES, 'readwrite');
    return promiseReq(store.add({ name: name, createdAt: Date.now() })).then(function(id) {
      // Pre-populate settings defaults
      var settingsStore = txn(STORE_SETTINGS, 'readwrite');
      var defaults = [
        { profileId: id, key: 'selectedLists', value: [] },
        { profileId: id, key: 'tts_source', value: 'youdao' },
        { profileId: id, key: 'audio_preference', value: 'us' },
        { profileId: id, key: 'reveal_layout', value: 'vertical' },
        { profileId: id, key: 'session_order', value: 'shuffled' }
      ];
      defaults.forEach(function(s) { settingsStore.add(s); });
      return id;
    });
  },

  getProfiles: function() {
    return promiseReq(txn(STORE_PROFILES, 'readonly').getAll());
  },

  getProfile: function(profileId) {
    return promiseReq(txn(STORE_PROFILES, 'readonly').get(profileId));
  },

  updateProfile: function(profileId, updates) {
    var store = txn(STORE_PROFILES, 'readwrite');
    return promiseReq(store.get(profileId)).then(function(profile) {
      if (!profile) throw new Error('Profile not found');
      if (updates.name !== undefined) profile.name = updates.name;
      return promiseReq(store.put(profile));
    });
  },

  deleteProfile: function(profileId) {
    var self = this;
    return Promise.all([
      promiseReq(txn(STORE_PROFILES, 'readwrite').delete(profileId)),
      self._clearAllInStore(STORE_PROGRESS, profileId),
      self._clearAllInStore(STORE_LISTS, profileId),
      self._clearAllInStore(STORE_SETTINGS, profileId),
      self._clearAllInStore(STORE_SRS, profileId)
    ]);
  },

  mergeProfiles: function(sourceId, targetId) {
    var self = this;
    // Merge word progress
    return self._getAllInStore(STORE_PROGRESS, sourceId).then(function(srcRows) {
      return self._getAllInStore(STORE_PROGRESS, targetId).then(function(tgtRows) {
        var tgtMap = {};
        tgtRows.forEach(function(r) { tgtMap[r.wordId] = r; });
        var store = txn(STORE_PROGRESS, 'readwrite');
        srcRows.forEach(function(s) {
          var t = tgtMap[s.wordId];
          var sProf = s.manualProficiency || '';
          var tProf = t ? (t.manualProficiency || '') : '';
          var profRank = { mastered: 4, reviewing: 3, learning: 2, unlearned: 1 };
          var sRank = sProf ? (profRank[sProf] || 0) : 0;
          var tRank = tProf ? (profRank[tProf] || 0) : 0;
          var useSource = !t || sRank > tRank || (sRank === tRank && sRank > 0 && (s.correct + s.wrong) > (t.correct + t.wrong));
          store.put({
            profileId: targetId, wordId: s.wordId,
            correct: t ? Math.max(s.correct, t.correct) : s.correct,
            wrong: t ? Math.max(s.wrong, t.wrong) : s.wrong,
            status: useSource ? s.status : t.status,
            manualProficiency: useSource ? (s.manualProficiency || '') : (t.manualProficiency || '')
          });
        });
        return promiseTx(store.transaction);
      });
    }).then(function() {
      // Merge SRS data
      return self._getAllInStore(STORE_SRS, sourceId).then(function(srcSRS) {
        return self._getAllInStore(STORE_SRS, targetId).then(function(tgtSRS) {
          var tgtMap = {};
          tgtSRS.forEach(function(r) { tgtMap[r.wordId] = r; });
          var store = txn(STORE_SRS, 'readwrite');
          srcSRS.forEach(function(s) {
            var t = tgtMap[s.wordId];
            if (!t) {
              store.put({ profileId: targetId, wordId: s.wordId, interval: s.interval, easeFactor: s.easeFactor, repetitions: s.repetitions, nextReview: s.nextReview, lastReview: s.lastReview, correctCount: s.correctCount || 0, wrongCount: s.wrongCount || 0, lastQuality: s.lastQuality });
            } else if ((s.easeFactor * s.repetitions) > (t.easeFactor * t.repetitions)) {
              store.put({ profileId: targetId, wordId: s.wordId, interval: s.interval, easeFactor: s.easeFactor, repetitions: s.repetitions, nextReview: s.nextReview, lastReview: s.lastReview, correctCount: Math.max(s.correctCount || 0, t.correctCount || 0), wrongCount: Math.max(s.wrongCount || 0, t.wrongCount || 0), lastQuality: Math.max(s.lastQuality || 0, t.lastQuality || 0) });
            }
          });
          return promiseTx(store.transaction);
        });
      });
    }).then(function() {
      // Merge lists — copy source list entries under target profileId
      return self.getListNames(sourceId).then(function(srcNames) {
        return self.getListNames(targetId).then(function(tgtNames) {
          var tgtSet = {};
          tgtNames.forEach(function(n) { tgtSet[n] = true; });
          var mergePromises = srcNames.map(function(name) {
            return self.loadList(sourceId, name).then(function(srcList) {
              if (!srcList) return;
              if (tgtSet[name]) {
                // List exists in both — merge wordIds (union)
                return self.loadList(targetId, name).then(function(tgtList) {
                  var merged = tgtList ? tgtList.wordIds.slice() : [];
                  var existing = {};
                  merged.forEach(function(id) { existing[id] = true; });
                  (srcList.wordIds || []).forEach(function(id) {
                    if (!existing[id]) merged.push(id);
                  });
                  return self.saveList(targetId, name, merged);
                });
              } else {
                // List only in source — copy under target
                return self.saveList(targetId, name, srcList.wordIds || []);
              }
            });
          });
          return Promise.all(mergePromises);
        });
      });
    });
  },

  // ── Word Progress ──

  getWordProgress: function(profileId, wordId) {
    if (_progressCache && profileId === _currentProfileId && _progressCache[wordId]) {
      return Promise.resolve(_progressCache[wordId] || { correct: 0, wrong: 0, status: 'unlearned', manualProficiency: '' });
    }
    return promiseReq(txn(STORE_PROGRESS, 'readonly').get([profileId, wordId])).then(function(row) {
      return row || { correct: 0, wrong: 0, status: 'unlearned', manualProficiency: '' };
    });
  },

  getWordProgressSync: function(wordId) {
    // Synchronous read from cache — only valid for current profile after cache loaded
    var entry = _progressCache[wordId];
    return entry ? { correct: entry.correct, wrong: entry.wrong, status: entry.status, manualProficiency: entry.manualProficiency || '' } : { correct: 0, wrong: 0, status: 'unlearned', manualProficiency: '' };
  },

  // Get all cached progress entries (for export)
  getAllProgressCacheSync: function() {
    var result = {};
    var keys = Object.keys(_progressCache);
    for (var i = 0; i < keys.length; i++) {
      var e = _progressCache[keys[i]];
      if (e.correct > 0 || e.wrong > 0 || e.status !== 'unlearned' || (e.manualProficiency && e.manualProficiency !== 'unlearned')) {
        result[keys[i]] = { correct: e.correct, wrong: e.wrong, status: e.status, manualProficiency: e.manualProficiency || '' };
      }
    }
    return result;
  },

  updateWordProgress: function(profileId, wordId, updates) {
    var self = this;
    var store = txn(STORE_PROGRESS, 'readwrite');
    return promiseReq(store.get([profileId, wordId])).then(function(row) {
      var entry = row || { profileId: profileId, wordId: wordId, correct: 0, wrong: 0, status: 'unlearned' };
      if (updates.correct !== undefined) entry.correct = updates.correct;
      if (updates.wrong !== undefined) entry.wrong = updates.wrong;
      if (updates.status !== undefined) entry.status = updates.status;
      if (updates.manualProficiency !== undefined) entry.manualProficiency = updates.manualProficiency;
      return promiseReq(store.put(entry));
    }).then(function() {
    });
  },

  // Sync: update progress cache immediately (caller must fire async persist separately)
  setProgressCacheSync: function(profileId, wordId, updates) {
    if (profileId !== _currentProfileId) return;
    var key = wordId;
    if (!_progressCache[key]) _progressCache[key] = { correct: 0, wrong: 0, status: 'unlearned' };
    if (updates.correct !== undefined) _progressCache[key].correct = updates.correct;
    if (updates.wrong !== undefined) _progressCache[key].wrong = updates.wrong;
    if (updates.status !== undefined) _progressCache[key].status = updates.status;
    if (updates.manualProficiency !== undefined) _progressCache[key].manualProficiency = updates.manualProficiency;
  },

  // Sync SRS data cache (populated on load / after session)
  getSRSDataSync: function(wordId) {
    var entry = _srsCache[wordId];
    return entry || null;
  },

  setSRSCacheSync: function(wordId, srsData) {
    _srsCache[wordId] = srsData;
  },

  // ── Daily Stats ──

  _loadDailyStatsCache: function() {
    var self = this;
    _dailyStatsCache = {};
    if (!_currentProfileId) return Promise.resolve();
    return self._getAllInStore(STORE_DAILY_STATS, _currentProfileId).then(function(rows) {
      rows.forEach(function(r) {
        _dailyStatsCache[r.date] = {
          wordsPracticed: r.wordsPracticed,
          correctCount: r.correctCount,
          wrongCount: r.wrongCount
        };
      });
    });
  },

  getDailyStatsSync: function(date) {
    return _dailyStatsCache[date] || { wordsPracticed: 0, correctCount: 0, wrongCount: 0 };
  },

  upsertDailyStats: function(profileId, date, delta) {
    var store = txn(STORE_DAILY_STATS, 'readwrite');
    return promiseReq(store.get([profileId, date])).then(function(row) {
      var entry = row || { profileId: profileId, date: date, wordsPracticed: 0, correctCount: 0, wrongCount: 0 };
      entry.wordsPracticed += (delta.wordsPracticed || 0);
      entry.correctCount += (delta.correctCount || 0);
      entry.wrongCount += (delta.wrongCount || 0);
      return promiseReq(store.put(entry)).then(function() {
        if (profileId === _currentProfileId) {
          _dailyStatsCache[date] = {
            wordsPracticed: entry.wordsPracticed,
            correctCount: entry.correctCount,
            wrongCount: entry.wrongCount
          };
        }
      });
    });
  },

  getAllDailyStats: function(profileId) {
    return this._getAllInStore(STORE_DAILY_STATS, profileId).then(function(rows) {
      return rows.sort(function(a, b) { return a.date.localeCompare(b.date); });
    });
  },

  getDailyStatsRange: function(profileId, startDate, endDate) {
    return this._getAllInStore(STORE_DAILY_STATS, profileId).then(function(rows) {
      return rows.filter(function(r) {
        return r.date >= startDate && r.date <= endDate;
      }).sort(function(a, b) { return a.date.localeCompare(b.date); });
    });
  },

  _loadSRSCache: function() {
    var self = this;
    _srsCache = {};
    if (!_currentProfileId) return Promise.resolve();
    return self._getAllInStore(STORE_SRS, _currentProfileId).then(function(rows) {
      rows.forEach(function(r) {
        _srsCache[r.wordId] = {
          interval: r.interval,
          easeFactor: r.easeFactor,
          repetitions: r.repetitions,
          nextReview: r.nextReview,
          lastReview: r.lastReview,
          correctCount: r.correctCount,
          wrongCount: r.wrongCount,
          lastQuality: r.lastQuality
        };
      });
    });
  },

  // Batch import word progress (for share/import) — sync cache update + async persist
  batchImportProgress: function(profileId, wordProgressMap) {
    var self = this;
    var entries = [];
    var wordIds = Object.keys(wordProgressMap);
    wordIds.forEach(function(wid) {
      var wp = wordProgressMap[wid];
      entries.push({
        profileId: profileId,
        wordId: Number(wid),
        correct: wp.correct || 0,
        wrong: wp.wrong || 0,
        status: wp.status || 'unlearned',
        manualProficiency: wp.manualProficiency || ''
      });
      if (profileId === _currentProfileId) {
        _progressCache[Number(wid)] = { correct: wp.correct || 0, wrong: wp.wrong || 0, status: wp.status || 'unlearned', manualProficiency: wp.manualProficiency || '' };
      }
    });
    return self._batchWrite(STORE_PROGRESS, entries);
  },

  // Sync: get all cached lists for current profile
  getListNamesSync: function() {
    return _listNamesCache || [];
  },

  loadListSync: function(listName) {
    return (_listCache && _listCache[listName]) || null;
  },

  // Sync cache write for lists (caller must fire async persist separately)
  setListCacheSync: function(listName, listData) {
    if (!_listCache) _listCache = {};
    if (!_listNamesCache) _listNamesCache = [];
    _listCache[listName] = listData;
    if (_listNamesCache.indexOf(listName) === -1) {
      _listNamesCache.push(listName);
    }
  },

  removeListCacheSync: function(listName) {
    if (_listCache) delete _listCache[listName];
    if (_listNamesCache) {
      _listNamesCache = _listNamesCache.filter(function(n) { return n !== listName; });
    }
  },

  _loadListCache: function(profileId) {
    var self = this;
    _listCache = {};
    _listNamesCache = [];
    return self._getAllInStore(STORE_LISTS, profileId).then(function(rows) {
      rows.forEach(function(r) {
        _listCache[r.listName] = { name: r.listName, wordIds: r.wordIds, createdAt: r.createdAt };
        _listNamesCache.push(r.listName);
      });
    });
  },

  _loadSelectedListsCache: function() {
    var self = this;
    _selectedListsCache = [];
    if (!_currentProfileId) return Promise.resolve();
    return self.getSetting(_currentProfileId, 'selectedLists', []).then(function(v) {
      _selectedListsCache = v || [];
    });
  },

  getSelectedListsSync: function() {
    return _selectedListsCache;
  },

  setSelectedListsSync: function(profileId, listNames) {
    _selectedListsCache = listNames.slice();
    this.setSetting(profileId, 'selectedLists', listNames).catch(function(e) {
      console.warn('[DB] Failed to persist selectedLists:', e);
    });
  },

  getWordsByStatus: function(profileId, status) {
    return this._getAllInStore(STORE_PROGRESS, profileId).then(function(rows) {
      return rows.filter(function(r) { return r.status === status; }).map(function(r) { return r.wordId; });
    });
  },

  	getProgressStats: function(profileId) {
	    // Use SRS-derived proficiency when cache is loaded
	    if (profileId === _currentProfileId && _progressCache) {
	      var keys = Object.keys(_progressCache);
	      var stats = { unlearned: 0, learning: 0, reviewing: 0, mastered: 0, total: keys.length };
	      for (var i = 0; i < keys.length; i++) {
	        var prog = _progressCache[keys[i]];
	        if (prog.manualProficiency) { stats[prog.manualProficiency]++; continue; }
	        var attempts = (prog.correct || 0) + (prog.wrong || 0);
	        if (attempts === 0) { stats.unlearned++; continue; }
	        var srs = _srsCache[keys[i]];
	        if (srs && srs.repetitions >= 2 && srs.interval >= 30) { stats.mastered++; }
	        else if (srs && srs.repetitions >= 1) { stats.reviewing++; }
	        else { stats.learning++; }
	      }
	      return Promise.resolve(stats);
	    }
	    var self = this;
	    return this._getAllInStore(STORE_PROGRESS, profileId).then(function(rows) {
	      return self._getAllInStore(STORE_SRS, profileId).then(function(srsRows) {
	        var srsMap = {};
	        srsRows.forEach(function(s) { srsMap[s.wordId] = s; });
	        var stats = { unlearned: 0, learning: 0, reviewing: 0, mastered: 0, total: rows.length };
	        rows.forEach(function(r) {
	          if (r.manualProficiency) { stats[r.manualProficiency]++; return; }
	          var attempts = (r.correct || 0) + (r.wrong || 0);
	          if (attempts === 0) { stats.unlearned++; return; }
	          var srs = srsMap[r.wordId];
	          if (srs && srs.repetitions >= 2 && srs.interval >= 30) { stats.mastered++; }
	          else if (srs && srs.repetitions >= 1) { stats.reviewing++; }
	          else { stats.learning++; }
	        });
	        return stats;
	      });
	    });
	  },

  // ── Lists ──

  getListNames: function(profileId) {
    return this._getAllInStore(STORE_LISTS, profileId).then(function(rows) {
      return rows.map(function(r) { return r.listName; });
    });
  },

  loadList: function(profileId, listName) {
    return promiseReq(txn(STORE_LISTS, 'readonly').get([profileId, listName]));
  },

  saveList: function(profileId, listName, wordIds) {
    return promiseReq(txn(STORE_LISTS, 'readwrite').put({
      profileId: profileId, listName: listName, wordIds: wordIds, createdAt: Date.now()
    }));
  },

  deleteList: function(profileId, listName) {
    return promiseReq(txn(STORE_LISTS, 'readwrite').delete([profileId, listName]));
  },

  mergeList: function(profileId, listName, newWordIds) {
    var self = this;
    return promiseReq(txn(STORE_LISTS, 'readonly').get([profileId, listName])).then(function(row) {
      if (!row) {
        return self.saveList(profileId, listName, newWordIds);
      }
      var existing = new Set(row.wordIds);
      newWordIds.forEach(function(id) { existing.add(id); });
      row.wordIds = Array.from(existing);
      return promiseReq(txn(STORE_LISTS, 'readwrite').put(row));
    });
  },

  // ── Settings ──

  getSetting: function(profileId, key, defaultVal) {
    return promiseReq(txn(STORE_SETTINGS, 'readonly').get([profileId, key])).then(function(row) {
      return row ? row.value : (defaultVal !== undefined ? defaultVal : null);
    });
  },

  setSetting: function(profileId, key, value) {
    return promiseReq(txn(STORE_SETTINGS, 'readwrite').put({ profileId: profileId, key: key, value: value }));
  },

  getSelectedLists: function(profileId) {
    return this.getSetting(profileId, 'selectedLists', []);
  },

  setSelectedLists: function(profileId, listNames) {
    return this.setSetting(profileId, 'selectedLists', listNames);
  },

  // ── SRS Data ──

  getSRSData: function(profileId, wordId) {
    return promiseReq(txn(STORE_SRS, 'readonly').get([profileId, wordId]));
  },

  updateSRSData: function(profileId, wordId, data) {
    var store = txn(STORE_SRS, 'readwrite');
    var self = this;
    return promiseReq(store.get([profileId, wordId])).then(function(row) {
      var entry = row || { profileId: profileId, wordId: wordId };
      entry.interval = data.interval;
      entry.easeFactor = data.easeFactor;
      entry.repetitions = data.repetitions;
      entry.nextReview = data.nextReview;
      entry.lastReview = data.lastReview;
      if (data.correctCount !== undefined) entry.correctCount = data.correctCount;
      if (data.wrongCount !== undefined) entry.wrongCount = data.wrongCount;
      if (data.lastQuality !== undefined) entry.lastQuality = data.lastQuality;
      return promiseReq(store.put(entry)).then(function() {
        // Update sync cache
        if (profileId === _currentProfileId) {
          _srsCache[wordId] = {
            interval: entry.interval,
            easeFactor: entry.easeFactor,
            repetitions: entry.repetitions,
            nextReview: entry.nextReview,
            lastReview: entry.lastReview,
            correctCount: entry.correctCount,
            wrongCount: entry.wrongCount,
            lastQuality: entry.lastQuality
          };
        }
      });
    });
  },

  _normalizeReviewDate: function(nextReview) {
    if (typeof nextReview === 'number') {
      return new Date(nextReview).toISOString().split('T')[0];
    }
    if (typeof nextReview === 'string') return nextReview;
    if (nextReview instanceof Date) return nextReview.toISOString().split('T')[0];
    return '';
  },

  getDueWords: function(profileId, limit) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayStr = today.toISOString().split('T')[0];
    var self = this;
    return this._getAllInStore(STORE_SRS, profileId).then(function(rows) {
      return rows.filter(function(r) {
          var nr = self._normalizeReviewDate(r.nextReview);
          return nr && nr <= todayStr;
        })
        .sort(function(a, b) {
          var na = self._normalizeReviewDate(a.nextReview);
          var nb = self._normalizeReviewDate(b.nextReview);
          return na.localeCompare(nb);
        })
        .slice(0, limit || 50)
        .map(function(r) { return r.wordId; });
    });
  },

  getSRSStats: function(profileId) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayStr = today.toISOString().split('T')[0];
    var weekEnd = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0];
    var self = this;
    return this._getAllInStore(STORE_SRS, profileId).then(function(rows) {
      var dueToday = 0, dueWeek = 0, totalCorrect = 0, totalReviews = 0;
      var totalEF = 0, efCount = 0;
      rows.forEach(function(r) {
        var nr = self._normalizeReviewDate(r.nextReview);
        if (nr && nr <= todayStr) dueToday++;
        if (nr && nr <= weekEnd) dueWeek++;
        if (r.correctCount) totalCorrect += r.correctCount;
        if (r.wrongCount) totalReviews += r.wrongCount;
        totalReviews += (r.correctCount || 0);
        if (r.easeFactor) { totalEF += r.easeFactor; efCount++; }
      });
      return {
        dueToday: dueToday,
        dueWeek: dueWeek,
        totalInRotation: rows.length,
        avgRetention: totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0,
        avgEaseFactor: efCount > 0 ? Math.round(totalEF / efCount * 100) / 100 : 2.5
      };
    });
  },

  getAllSRSRows: function(profileId) {
    return this._getAllInStore(STORE_SRS, profileId);
  },

  // ── Profile switching ──

  getCurrentProfileId: function() {
    return Promise.resolve(_currentProfileId);
  },

  getCurrentProfileIdSync: function() {
    return _currentProfileId;
  },

  setCurrentProfileId: function(profileId) {
    _currentProfileId = profileId;
    try { localStorage.setItem('english_vocab_gym_current_profile', String(profileId)); } catch (_) {}
    return Promise.all([this._loadProgressCache(), this._loadSRSCache(), this._loadListCache(profileId), this._loadSelectedListsCache(), this._loadDailyStatsCache()]);
  },

  _loadCurrentProfileId: function() {
    var self = this;
    // Check localStorage for saved preference, then IndexedDB
    var saved = null;
    try { saved = localStorage.getItem('english_vocab_gym_current_profile'); } catch (_) {}
    if (saved) {
      _currentProfileId = Number(saved);
      return Promise.resolve();
    }
    return self._ensureDefaultProfile();
  },

  _ensureDefaultProfile: function() {
    var self = this;
    return promiseReq(txn(STORE_PROFILES, 'readonly').getAll()).then(function(profiles) {
      if (profiles.length === 0) {
        return self.createProfile('Default').then(function(id) {
          _currentProfileId = id;
          try { localStorage.setItem('english_vocab_gym_current_profile', String(id)); } catch (_) {}
          return self._loadListCache(id);
        });
      }
      _currentProfileId = profiles[0].profileId;
      try { localStorage.setItem('english_vocab_gym_current_profile', String(_currentProfileId)); } catch (_) {}
      return self._loadListCache(_currentProfileId);
    });
  },

  _loadProgressCache: function() {
    var self = this;
    _progressCache = {};
    if (!_currentProfileId) return Promise.resolve();
    return self._getAllInStore(STORE_PROGRESS, _currentProfileId).then(function(rows) {
      rows.forEach(function(r) {
        _progressCache[r.wordId] = { correct: r.correct, wrong: r.wrong, status: r.status, manualProficiency: r.manualProficiency || '' };
      });
    });
  },

  // ── Migration from localStorage ──

  needsMigration: function() {
    try {
      if (!localStorage.getItem('english_vocab_gym_user_progress')) return false;
      return !localStorage.getItem('english_vocab_gym_migrated_v3');
    } catch (_) { return false; }
  },

  migrateFromLocalStorage: function() {
    var self = this;
    try {
      var raw = localStorage.getItem('english_vocab_gym_user_progress');
      if (!raw) return Promise.resolve(false);
      var progress = JSON.parse(raw);

      // Create Default profile if needed
      return self._ensureDefaultProfile().then(function() {
        var pid = _currentProfileId;

        // Migrate word progress in batches
        var wordProgress = progress.wordProgress || {};
        var entries = Object.keys(wordProgress).map(function(wid) {
          return {
            profileId: pid,
            wordId: Number(wid),
            correct: wordProgress[wid].correct || 0,
            wrong: wordProgress[wid].wrong || 0,
            status: wordProgress[wid].status || 'unlearned'
          };
        });

        return self._batchWrite(STORE_PROGRESS, entries).then(function() {
          // Migrate lists
          var listNames = progress.lists || [];
          var listJobs = listNames.map(function(name) {
            try {
              var rawList = localStorage.getItem('english_vocab_gym_list_' + name);
              if (rawList) {
                var list = JSON.parse(rawList);
                return self.saveList(pid, name, list.wordIds || []);
              }
            } catch (_) {}
            return Promise.resolve();
          });
          return Promise.all(listJobs);
        }).then(function() {
          // Migrate settings
          var settingsStore = txn(STORE_SETTINGS, 'readwrite');
          var selectedLists = [];
          try {
            selectedLists = JSON.parse(localStorage.getItem('english_vocab_gym_selected_lists') || '[]');
          } catch (_) {}
          settingsStore.put({ profileId: pid, key: 'selectedLists', value: selectedLists });

          var tts = 'youdao';
          try { tts = localStorage.getItem('english_vocab_gym_tts_source') || 'youdao'; } catch (_) {}
          var accent = 'us';
          try { accent = localStorage.getItem('english_vocab_gym_audio_preference') || 'us'; } catch (_) {}
          var layout = 'vertical';
          try { layout = localStorage.getItem('english_vocab_gym_reveal_layout') || 'vertical'; } catch (_) {}
          var order = 'shuffled';
          try { order = localStorage.getItem('english_vocab_gym_user_progress_order') || 'shuffled'; } catch (_) {}

          settingsStore.put({ profileId: pid, key: 'tts_source', value: tts });
          settingsStore.put({ profileId: pid, key: 'audio_preference', value: accent });
          settingsStore.put({ profileId: pid, key: 'reveal_layout', value: layout });
          settingsStore.put({ profileId: pid, key: 'session_order', value: order });

          return promiseTx(settingsStore.transaction);
        }).then(function() {
          // Set migration marker
          return self.setSetting('__system__', 'migrationComplete', true);
        }).then(function() {
          return Promise.all([self._loadProgressCache(), self._loadListCache(pid), self._loadSelectedListsCache()]);
        }).then(function() {
          try { localStorage.setItem('english_vocab_gym_migrated_v3', '1'); } catch (_) {}
          return true;
        });
      });
    } catch (e) {
      console.error('[DB] Migration failed:', e);
      return Promise.resolve(false);
    }
  },

  isMigrationComplete: function() {
    return this.getSetting('__system__', 'migrationComplete', false);
  },

  // ── Internal helpers ──

  _getAllInStore: function(storeName, profileId) {
    var store = txn(storeName, 'readonly');
    if (store.indexNames.contains('profileId')) {
      return promiseReq(store.index('profileId').getAll(profileId));
    }
    // For stores without index, scan all then filter by compound key
    return promiseReq(store.getAll()).then(function(rows) {
      return rows.filter(function(r) { return r.profileId === profileId; });
    });
  },

  _clearAllInStore: function(storeName, profileId) {
    var self = this;
    return self._getAllInStore(storeName, profileId).then(function(rows) {
      var store = txn(storeName, 'readwrite');
      rows.forEach(function(r) {
        store.delete(r.profileId !== undefined ? [r.profileId, r.wordId || r.listName || r.key || r.profileId] : r.profileId);
      });
      // For compound key stores, try delete by range
      return promiseTx(store.transaction);
    });
  },

  _batchWrite: function(storeName, entries) {
    if (entries.length === 0) return Promise.resolve();
    return new Promise(function(resolve, reject) {
      var i = 0;
      function writeBatch() {
        var tx = _db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        var end = Math.min(i + 1000, entries.length);
        for (; i < end; i++) { store.put(entries[i]); }
        tx.oncomplete = function() {
          if (i < entries.length) { writeBatch(); }
          else { resolve(); }
        };
        tx.onerror = function(e) { reject(e.target.error); };
      }
      writeBatch();
    });
  }
};

})(window.VocabGym);
