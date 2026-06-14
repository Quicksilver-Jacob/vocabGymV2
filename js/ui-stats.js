// VocabGym - Learning stats view
window.VocabGym = window.VocabGym || {};
(function(ns) {

ns.stats = {
  _viewDays: 7,

  init: function() {
    this._container = document.getElementById('stats-view');
    if (!this._container) return;

    var tabLedger = document.getElementById('tab-ledger');
    var tabStats = document.getElementById('tab-stats');
    var ledgerContainer = document.getElementById('word-ledger-container');
    var cheatsheet = document.getElementById('keyboard-cheatsheet-panel');

    if (tabLedger && tabStats) {
      tabLedger.addEventListener('click', function() {
        if (ledgerContainer) ledgerContainer.classList.remove('hidden');
        if (cheatsheet) cheatsheet.classList.remove('hidden');
        ns.stats._container.classList.add('hidden');
        ns.stats._updateTabStyles('ledger');
      });
      tabStats.addEventListener('click', function() {
        if (ledgerContainer) ledgerContainer.classList.add('hidden');
        ns.stats._container.classList.remove('hidden');
        ns.stats._updateTabStyles('stats');
        ns.stats.render();
      });
    }

    var btn7d = document.getElementById('btn-stats-7d');
    var btn30d = document.getElementById('btn-stats-30d');
    if (btn7d) btn7d.addEventListener('click', function() { ns.stats._setView(7); });
    if (btn30d) btn30d.addEventListener('click', function() { ns.stats._setView(30); });

    var goalInput = document.getElementById('daily-goal-input');
    if (goalInput) {
      goalInput.addEventListener('change', function() {
        var val = parseInt(this.value) || 20;
        if (val < 1) val = 1;
        if (val > 500) val = 500;
        this.value = val;
        ns.state.setDailyGoal(val);
        if (ns.dashboard && ns.dashboard.updateGoalProgress) ns.dashboard.updateGoalProgress();
        ns.stats._updateGoalPresets(val);
        ns.stats.render();
      });
    }

    // Preset goal buttons
    var presets = document.querySelectorAll('.stats-goal-preset');
    for (var i = 0; i < presets.length; i++) {
      presets[i].addEventListener('click', function() {
        var val = parseInt(this.getAttribute('data-goal')) || 20;
        ns.state.setDailyGoal(val);
        if (ns.dashboard && ns.dashboard.updateGoalProgress) ns.dashboard.updateGoalProgress();
        var input = document.getElementById('daily-goal-input');
        if (input) input.value = val;
        ns.stats._updateGoalPresets(val);
        ns.stats.render();
      });
    }
  },

  _setView: function(days) {
    this._viewDays = days;
    var btn7d = document.getElementById('btn-stats-7d');
    var btn30d = document.getElementById('btn-stats-30d');
    var on = 'text-[11px] font-semibold px-3 py-1 rounded-md transition-all bg-brand-500/15 text-brand-400';
    var off = 'text-[11px] font-semibold px-3 py-1 rounded-md transition-all text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50';
    if (btn7d) btn7d.className = days === 7 ? on : off;
    if (btn30d) btn30d.className = days === 30 ? on : off;
    this.render();
  },

  _updateTabStyles: function(active) {
    var tabLedger = document.getElementById('tab-ledger');
    var tabStats = document.getElementById('tab-stats');
    var on = 'text-xs font-semibold px-4 py-2 border-b-2 transition-all cursor-pointer text-brand-400 border-brand-500';
    var off = 'text-xs font-semibold px-4 py-2 border-b-2 transition-all cursor-pointer text-zinc-500 border-transparent hover:text-zinc-300 hover:border-zinc-700';
    if (tabLedger) tabLedger.className = active === 'ledger' ? on : off;
    if (tabStats) tabStats.className = active === 'stats' ? on : off;
  },

  _updateGoalPresets: function(currentGoal) {
    var presets = document.querySelectorAll('.stats-goal-preset');
    for (var i = 0; i < presets.length; i++) {
      var val = parseInt(presets[i].getAttribute('data-goal'));
      var isActive = val === currentGoal;
      presets[i].className = 'text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all ' +
        (isActive ? 'bg-brand-500/15 text-brand-400 border-brand-500/30' : 'text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700');
    }
  },

  render: function() {
    this._renderSummary();
    this._renderChart();
    this._renderWeeklyHeatmap();
    this._renderGoalSettings();
  },

  _renderSummary: function() {
    var pid = ns.db.getCurrentProfileIdSync();
    if (!pid) return;

    var today = (new Date()).toISOString().split('T')[0];
    var todayStats = ns.db.getDailyStatsSync(today);
    var goal = ns.state.getDailyGoal();

    var elTodayWords = document.getElementById('stats-today-words');
    var elTodayAccuracy = document.getElementById('stats-today-accuracy');
    var elTodayGoalPct = document.getElementById('stats-today-goal-pct');

    if (elTodayWords) elTodayWords.textContent = todayStats.wordsPracticed;
    if (elTodayAccuracy) {
      var total = todayStats.correctCount + todayStats.wrongCount;
      elTodayAccuracy.textContent = total > 0 ? Math.round((todayStats.correctCount / total) * 100) + '%' : '--';
    }
    if (elTodayGoalPct) {
      elTodayGoalPct.textContent = goal > 0 ? Math.round((todayStats.wordsPracticed / goal) * 100) + '%' : '--';
    }

    ns.state.getStreakAsync().then(function(s) {
      var elStreak = document.getElementById('stats-streak');
      if (elStreak) elStreak.textContent = s.streak + ' day' + (s.streak !== 1 ? 's' : '');
    });
  },

  _renderChart: function() {
    var pid = ns.db.getCurrentProfileIdSync();
    if (!pid) return;

    var days = this._viewDays;
    var today = new Date();
    var startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (days - 1));
    var startStr = startDate.toISOString().split('T')[0];
    var endStr = today.toISOString().split('T')[0];

    ns.db.getDailyStatsRange(pid, startStr, endStr).then(function(rows) {
      var dateMap = {};
      rows.forEach(function(r) { dateMap[r.date] = r; });

      var dayData = [];
      var maxCount = 0;
      for (var i = 0; i < days; i++) {
        var d = new Date(today);
        d.setDate(d.getDate() - (days - 1 - i));
        var ds = d.toISOString().split('T')[0];
        var stats = dateMap[ds] || { wordsPracticed: 0, correctCount: 0, wrongCount: 0 };
        var acc = (stats.correctCount + stats.wrongCount) > 0
          ? Math.round((stats.correctCount / (stats.correctCount + stats.wrongCount)) * 100) : 0;
        dayData.push({
          date: ds,
          label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
          dateNum: d.getDate(),
          wordsPracticed: stats.wordsPracticed,
          accuracy: acc,
          correctCount: stats.correctCount,
          wrongCount: stats.wrongCount
        });
        if (stats.wordsPracticed > maxCount) maxCount = stats.wordsPracticed;
      }
      if (maxCount < 1) maxCount = 5; // Minimum height for visual structure

      var chartArea = document.getElementById('stats-chart-area');
      if (!chartArea) return;

      var goal = ns.state.getDailyGoal();
      var isCompact = days > 7;
      var barW = isCompact ? '4px' : '22px';
      var gap = isCompact ? '3px' : '6px';
      var minW = isCompact ? '10px' : '32px';

      // Grid lines
      var gridHtml = '';
      var gridSteps = 4;
      for (var g = gridSteps; g > 0; g--) {
        var yPct = (g / gridSteps) * 100;
        gridHtml += '<div class="absolute left-8 right-4 border-t border-zinc-800/60" style="bottom:' + yPct + '%"></div>';
      }

      var html = '<div class="relative h-48" style="padding-left:28px;padding-right:16px">' + gridHtml +
        '<div class="flex items-end h-full ' + (isCompact ? 'gap-[3px]' : 'gap-1.5') + '">';

      for (var j = 0; j < dayData.length; j++) {
        var dd = dayData[j];
        var barH = maxCount > 0 ? Math.round((dd.wordsPracticed / maxCount) * 100) : 0;
        if (barH < 2 && dd.wordsPracticed > 0) barH = 3;

        var barColor;
        if (dd.wordsPracticed === 0) barColor = 'bg-zinc-800';
        else if (dd.accuracy >= 80) barColor = 'bg-emerald-500';
        else if (dd.accuracy >= 50) barColor = 'bg-amber-500';
        else barColor = 'bg-rose-500';

        // Today's bar gets a subtle glow
        var isToday = j === dayData.length - 1;
        var barStyle = isToday ? 'box-shadow:0 0 8px rgba(20,184,166,0.3)' : '';

        html += '<div class="flex flex-col items-center gap-1 group" style="min-width:' + minW + ';flex:1">' +
          '<span class="text-[9px] text-zinc-500 font-mono tabular-nums leading-none">' + dd.wordsPracticed + '</span>' +
          '<div class="w-full max-w-[' + barW + '] rounded-t ' + barColor + ' transition-all hover:opacity-80 cursor-default relative" style="height:' + barH + '%;' + barStyle + '" title="' + dd.label + ': ' + dd.wordsPracticed + ' words @ ' + dd.accuracy + '%">' +
            '<div class="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-zinc-800 text-zinc-200 text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-10 pointer-events-none">' +
              dd.wordsPracticed + 'w · ' + dd.accuracy + '%' +
            '</div>' +
          '</div>' +
          '<span class="text-[9px] text-zinc-600 ' + (isCompact ? 'hidden' : '') + '">' + dd.dayLabel + '</span>' +
        '</div>';
      }
      html += '</div></div>';

      // Chart summary
      var totalPracticed = dayData.reduce(function(acc, d) { return acc + d.wordsPracticed; }, 0);
      var daysActive = dayData.filter(function(d) { return d.wordsPracticed > 0; }).length;
      html += '<div class="flex items-center justify-between mt-3 px-2 text-xs">' +
        '<span class="text-zinc-500">' + totalPracticed + ' words · ' + daysActive + '/' + days + ' days active</span>' +
        '<span class="text-zinc-600">avg ' + (days > 0 ? Math.round(totalPracticed / days) : 0) + '/day</span>' +
        '</div>';

      chartArea.innerHTML = html;
    });
  },

  _renderWeeklyHeatmap: function() {
    var pid = ns.db.getCurrentProfileIdSync();
    if (!pid) return;

    var today = new Date();
    var startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 6); // Last 7 days including today
    var startStr = startDate.toISOString().split('T')[0];
    var endStr = today.toISOString().split('T')[0];

    var goal = ns.state.getDailyGoal();

    ns.db.getDailyStatsRange(pid, startStr, endStr).then(function(rows) {
      var dateMap = {};
      rows.forEach(function(r) { dateMap[r.date] = r; });

      var dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      var weekData = [];
      var bestDay = null;
      var weeklyTotal = 0;

      for (var i = 0; i < 7; i++) {
        var d = new Date(today);
        d.setDate(d.getDate() - (6 - i));
        var ds = d.toISOString().split('T')[0];
        var dayIdx = d.getDay(); // 0=Sun, 1=Mon, ...
        var dayName = dayNames[dayIdx === 0 ? 6 : dayIdx - 1]; // Mon-Sun
        var stats = dateMap[ds] || { wordsPracticed: 0, correctCount: 0, wrongCount: 0 };
        weeklyTotal += stats.wordsPracticed;
        weekData.push({ date: ds, dayName: dayName, wordsPracticed: stats.wordsPracticed, correctCount: stats.correctCount, wrongCount: stats.wrongCount });
        if (bestDay === null || stats.wordsPracticed > bestDay.wordsPracticed) {
          bestDay = { dayName: dayName, wordsPracticed: stats.wordsPracticed };
        }
      }

      // Render heatmap
      var heatmapEl = document.getElementById('stats-weekly-heatmap');
      if (!heatmapEl) return;

      var maxWords = Math.max(goal, 1);
      for (var k = 0; k < weekData.length; k++) {
        if (weekData[k].wordsPracticed > maxWords) maxWords = weekData[k].wordsPracticed;
      }

      var html = '';
      for (var j = 0; j < weekData.length; j++) {
        var wd = weekData[j];
        var isToday = wd.date === endStr;
        var ratio = wd.wordsPracticed / maxWords;
        var bg;
        if (wd.wordsPracticed === 0) bg = 'bg-zinc-800/60';
        else if (ratio >= 0.8) bg = 'bg-emerald-500/80';
        else if (ratio >= 0.5) bg = 'bg-emerald-500/50';
        else if (ratio >= 0.2) bg = 'bg-emerald-500/25';
        else bg = 'bg-emerald-500/10';

        html += '<div class="flex items-center gap-3">' +
          '<span class="text-[10px] text-zinc-500 w-8 ' + (isToday ? 'text-zinc-300 font-bold' : '') + '">' + wd.dayName + '</span>' +
          '<div class="flex-1 h-7 rounded-md border border-zinc-800/50 ' + bg + ' flex items-center px-2.5 justify-between group relative cursor-default transition-colors hover:border-zinc-700/50">' +
            '<span class="text-[10px] font-mono text-zinc-300 font-bold">' + wd.wordsPracticed + '</span>' +
            (wd.wordsPracticed > 0 ? '<span class="text-[9px] text-zinc-500">' + (wd.correctCount + wd.wrongCount > 0 ? Math.round((wd.correctCount / (wd.correctCount + wd.wrongCount)) * 100) + '% acc' : '') + '</span>' : '<span class="text-[9px] text-zinc-600">--</span>') +
          '</div>' +
        '</div>';
      }
      heatmapEl.innerHTML = html;

      // Best day + weekly total
      var elBest = document.getElementById('stats-best-day');
      var elTotal = document.getElementById('stats-weekly-total');
      if (elBest) elBest.textContent = bestDay && bestDay.wordsPracticed > 0 ? bestDay.dayName + ' · ' + bestDay.wordsPracticed + ' words' : '--';
      if (elTotal) elTotal.textContent = weeklyTotal + ' words';
    });
  },

  _renderGoalSettings: function() {
    var input = document.getElementById('daily-goal-input');
    var goal = ns.state.getDailyGoal();
    if (input) input.value = goal;
    this._updateGoalPresets(goal);
  }
};

})(window.VocabGym);
