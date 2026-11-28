// ===== HomeLeaderboard =====
  (function () {
    'use strict';

    const LB_STATE = {
      data: null,
      loading: false,
      lastFetchTs: 0
    };

    const RANK_CONFIG = {
      1: {
        color: '#facc15',
        scoreCls: 'text-[#facc15]',
        hexStroke: '#facc15',
        hexFill: 'rgba(250, 204, 21, 0.14)',
        icon: '<path d="M5 16L3.5 8l4.5 3.5L12 6l4 5.5L20.5 8 19 16H5zm0 2h14v1.5H5V18z" fill="#facc15"/>'
      },
      2: {
        color: '#e2e8f0',
        scoreCls: 'text-[#e2e8f0]',
        hexStroke: '#94a3b8',
        hexFill: 'rgba(148, 163, 184, 0.14)',
        icon: '<rect x="6" y="8" width="12" height="9" rx="2" fill="#cbd5e1"/><line x1="12" y1="5" x2="12" y2="8" stroke="#cbd5e1" stroke-width="1.8"/><circle cx="12" cy="4.2" r="1.3" fill="#e2e8f0"/><circle cx="9.5" cy="12" r="1.3" fill="#070d19"/><circle cx="14.5" cy="12" r="1.3" fill="#070d19"/><rect x="9.5" y="14.5" width="5" height="1.2" rx="0.6" fill="#070d19"/><rect x="4" y="11" width="1.6" height="3.5" rx="0.8" fill="#94a3b8"/><rect x="18.4" y="11" width="1.6" height="3.5" rx="0.8" fill="#94a3b8"/>'
      },
      3: {
        color: '#fb923c',
        scoreCls: 'text-[#e2e8f0]',
        hexStroke: '#38bdf8',
        hexFill: 'rgba(56, 189, 248, 0.12)',
        icon: '<path d="M11.9 5c-2.6 0-2.5 1.1-2.5 1.1v1.2h2.6v.5H8.2S6.5 7.6 6.5 10.3c0 2.7 1.5 2.6 1.5 2.6h.9v-1.3s-.1-1.5 1.5-1.5h2.5s1.4 0 1.4-1.4V6.4S14.5 5 11.9 5zm-1.4.8a.55.55 0 1 1 0 1.1.55.55 0 0 1 0-1.1z" fill="#38bdf8"/><path d="M12.1 19c2.6 0 2.5-1.1 2.5-1.1v-1.2H12v-.5h3.8s1.7.2 1.7-2.5c0-2.7-1.5-2.6-1.5-2.6h-.9v1.3s.1 1.5-1.5 1.5h-2.5s-1.4 0-1.4 1.4v2.3S9.5 19 12.1 19zm1.4-.8a.55.55 0 1 1 0-1.1.55.55 0 0 1 0 1.1z" fill="#facc15"/>'
      },
      4: {
        color: '#38bdf8',
        scoreCls: 'text-[#e2e8f0]',
        hexStroke: '#38bdf8',
        hexFill: 'rgba(56, 189, 248, 0.12)',
        icon: '<polygon points="13 4 7 13 11.5 13 10.5 20 17 10.5 12.5 10.5 13 4" fill="#22d3ee"/>'
      },
      5: {
        color: '#38bdf8',
        scoreCls: 'text-[#e2e8f0]',
        hexStroke: '#38bdf8',
        hexFill: 'rgba(56, 189, 248, 0.10)',
        icon: '<polyline points="9 8 5 12 9 16" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="15 8 19 12 15 16" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="13.2" y1="6.8" x2="10.8" y2="17.2" stroke="#22d3ee" stroke-width="1.8" stroke-linecap="round"/>'
      }
    };

    function esc(s) {
      return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function hasPositiveScore(item) {
      if (!item) return false;
      const m = String(item.score || '').match(/\d+/);
      return m ? Number(m[0]) > 0 : false;
    }

    function laurelRankSvg(rank) {
      const palette = rank === 1
        ? { main: '#facc15', hi: '#fef08a', glow: 'rgba(250,204,21,0.58)' }
        : rank === 2
          ? { main: '#cbd5e1', hi: '#f8fafc', glow: 'rgba(203,213,225,0.48)' }
          : { main: '#d98c53', hi: '#fed7aa', glow: 'rgba(217,119,6,0.48)' };
      return `
        <svg class="w-full h-full" viewBox="0 0 64 36" fill="none" style="filter:drop-shadow(0 0 5px ${palette.glow});" aria-hidden="true">
          <!-- Left Laurel -->
          <path d="M18 31C10 27 8 18 13 8" stroke="${palette.main}" stroke-width="1.5" stroke-linecap="round"/>
          <ellipse cx="10" cy="13" rx="3.4" ry="1.6" transform="rotate(-36 10 13)" fill="${palette.hi}"/>
          <ellipse cx="9" cy="19" rx="3.6" ry="1.6" transform="rotate(-14 9 19)" fill="${palette.main}"/>
          <ellipse cx="11" cy="25" rx="3.5" ry="1.6" transform="rotate(14 11 25)" fill="${palette.hi}"/>
          <ellipse cx="15" cy="29.5" rx="3.3" ry="1.5" transform="rotate(34 15 29.5)" fill="${palette.main}"/>
          <!-- Right Laurel -->
          <path d="M46 31C54 27 56 18 51 8" stroke="${palette.main}" stroke-width="1.5" stroke-linecap="round"/>
          <ellipse cx="54" cy="13" rx="3.4" ry="1.6" transform="rotate(36 54 13)" fill="${palette.hi}"/>
          <ellipse cx="55" cy="19" rx="3.6" ry="1.6" transform="rotate(14 55 19)" fill="${palette.main}"/>
          <ellipse cx="53" cy="25" rx="3.5" ry="1.6" transform="rotate(-14 53 25)" fill="${palette.hi}"/>
          <ellipse cx="49" cy="29.5" rx="3.3" ry="1.5" transform="rotate(-34 49 29.5)" fill="${palette.main}"/>
          <!-- Rank Number -->
          <text x="32" y="25.5" text-anchor="middle" fill="${palette.hi}" font-family="'Space Grotesk','IBM Plex Mono',sans-serif" font-size="22" font-weight="800">${rank}</text>
        </svg>
      `;
    }

    function hexRankSvg(rank) {
      return `
        <svg class="w-full h-full" viewBox="0 0 64 36" fill="none" style="filter:drop-shadow(0 0 5px rgba(56,189,248,0.42));" aria-hidden="true">
          <polygon points="32,3 45,10.5 45,25.5 32,33 19,25.5 19,10.5" fill="rgba(14,32,60,0.92)" stroke="#38bdf8" stroke-width="1.4"/>
          <polygon points="32,6.5 41.5,12 41.5,24 32,29.5 22.5,24 22.5,12" fill="rgba(56,189,248,0.14)" stroke="rgba(125,211,252,0.45)" stroke-width="0.8"/>
          <text x="32" y="24" text-anchor="middle" fill="#f8fafc" font-family="'Space Grotesk','IBM Plex Mono',sans-serif" font-size="16" font-weight="800">${rank}</text>
        </svg>
      `;
    }

    function renderBoardRows(containerId, myRankId, rawList, myInfo) {
      const box = document.getElementById(containerId);
      const myEl = document.getElementById(myRankId);
      if (!box) return;

      const list = (rawList || []).filter(hasPositiveScore).slice(0, 5);
      if (list.length === 0) {
        box.innerHTML = '<div class="py-4 text-center font-mono-code text-xs text-[#64748b]">暫未有上榜紀錄</div>';
      } else {
        const rowsHtml = list.map((item, idx) => {
          const rank = idx + 1;
          const badgeSvg = rank <= 3 ? laurelRankSvg(rank) : hexRankSvg(rank);
          const rowTierCls = `is-rank-${rank}`;
          const nameCls = rank === 1 ? 'text-[#fef9c3]' : 'text-[#e2e8f0]';
          const scoreCls = rank === 1
            ? 'text-[#fde047] drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]'
            : rank === 2
              ? 'text-[#e2e8f0]'
              : rank === 3
                ? 'text-[#fdba74]'
                : 'text-[#7dd3fc]';
          return `
            <div class="cyber-hud-row ${rowTierCls}">
              <div class="cyber-rank-slot">${badgeSvg}</div>
              <span class="cyber-player-name font-display ${nameCls}" title="${esc(item.name)}">${esc(item.name)}</span>
              <span class="cyber-score-zone ${scoreCls}">${esc(item.score)}</span>
            </div>
          `;
        }).join('');

        box.innerHTML = `<div class="lb-compact-list">${rowsHtml}</div>`;
      }

      if (myEl) {
        if (myInfo && myInfo.rank && hasPositiveScore(myInfo)) {
          myEl.textContent = `你的排名：#${myInfo.rank}（${myInfo.score}）`;
        } else {
          myEl.textContent = '';
        }
      }
    }

    function renderLeaderboard() {
      if (!LB_STATE.data || !LB_STATE.data.leaderboards) return;
      const lbs = LB_STATE.data.leaderboards;
      const mr = LB_STATE.data.myRank || {};
      renderBoardRows('lbOverallList', 'lbOverallMyRank', lbs.overall || [], mr.overall || null);
      renderBoardRows('lbSelfList', 'lbSelfMyRank', lbs.self || lbs.textbook || [], mr.self || mr.textbook || null);
    }

    async function fetchLeaderboard(force = false) {
      if (LB_STATE.loading) return;
      const now = Date.now();
      if (!force && LB_STATE.data && (now - LB_STATE.lastFetchTs) < 20000) {
        renderLeaderboard();
        return;
      }

      const url = (typeof getGasUrl === 'function' ? getGasUrl() : '') || (typeof GAS_WEBAPP_URL !== 'undefined' ? GAS_WEBAPP_URL : '');
      if (!url) return;

      const email = (typeof state !== 'undefined' && state && state.student && state.student.email) ? state.student.email : '';
      const idToken = (typeof state !== 'undefined' && state && state.student && state.student.idToken) ? state.student.idToken : '';

      LB_STATE.loading = true;
      const icon = document.getElementById('lbRefreshIcon');
      if (icon) icon.classList.add('animate-spin');

      try {
        let res = null;
        if (typeof callCloudGrader === 'function') {
          res = await callCloudGrader({ action: 'getLeaderboard', email, idToken });
        }
        if (!res || !res.ok) {
          const sep = url.includes('?') ? '&' : '?';
          const qs = `action=getLeaderboard${email ? '&email=' + encodeURIComponent(email) : ''}&t=${Date.now()}`;
          const r = await fetch(url + sep + qs, { cache: 'no-store' });
          if (r.ok) res = await r.json();
        }
        if (res && res.ok && res.leaderboards) {
          LB_STATE.data = res;
          LB_STATE.lastFetchTs = Date.now();
        } else if (!LB_STATE.data) {
          ['lbOverallList', 'lbSelfList'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="py-4 text-center font-mono-code text-xs text-[#94a3b8]">未能載入排行榜，請確認已部署最新版 Apps Script</div>';
          });
        }
      } catch (e) {
        if (!LB_STATE.data) {
          ['lbOverallList', 'lbSelfList'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="py-4 text-center font-mono-code text-xs text-[#94a3b8]">暫時未能連線至排行榜伺服器</div>';
          });
        }
      } finally {
        LB_STATE.loading = false;
        if (icon) icon.classList.remove('animate-spin');
        renderLeaderboard();
      }
    }

    function initLeaderboardUI() {
      const refBtn = document.getElementById('lbRefreshBtn');
      if (refBtn && !refBtn.dataset.lbBound) {
        refBtn.dataset.lbBound = '1';
        refBtn.addEventListener('click', async () => {
          await fetchLeaderboard(true);
          if (typeof window.showToast === 'function') window.showToast('排行榜已更新', 'info', 2200);
        });
      }
      fetchLeaderboard(true);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initLeaderboardUI);
    } else {
      initLeaderboardUI();
    }

    window.HomeLeaderboard = { refresh: fetchLeaderboard, render: renderLeaderboard };
  })();

// ===== CourseMapUI =====
  (function () {
    'use strict';

    const COURSE_MAP_NODES = [
      {
        lv: 1, title: 'Basics', hex: '#22d3ee', chStart: 1, chEnd: 2,
        icon: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>'
      },
      {
        lv: 2, title: 'Data & Ops', hex: '#38bdf8', chStart: 3, chEnd: 6,
        icon: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>'
      },
      {
        lv: 3, title: 'Control', hex: '#facc15', chStart: 7, chEnd: 11,
        icon: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 6 2 12 8 18"/><polyline points="16 6 22 12 16 18"/><line x1="14" y1="4" x2="10" y2="20"/></svg>'
      },
      {
        lv: 4, title: 'Functions', hex: '#c084fc', chStart: 12, chEnd: 16,
        icon: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 20 6.5v11L12 22 4 17.5v-11L12 2z"/><path d="M12 22V11.5"/><path d="M20 6.5 12 11.5 4 6.5"/></svg>'
      },
      {
        lv: 5, title: 'Structures', hex: '#e879f9', chStart: 17, chEnd: 19,
        icon: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/></svg>'
      },
      {
        lv: 6, title: 'Algorithms', hex: '#fb923c', chStart: 20, chEnd: 23,
        icon: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l2-10 4.5 4.5L12 5l2.5 6.5L19 7l2 10H3z"/><line x1="3" y1="20" x2="21" y2="20"/></svg>'
      }
    ];

    function getNodeStats(node) {
      if (typeof LEVELS === 'undefined' || typeof state === 'undefined') {
        return { done: 0, total: (node.chEnd - node.chStart + 1) * 6, firstId: null };
      }
      const items = LEVELS.filter((lv) => lv.ch >= node.chStart && lv.ch <= node.chEnd);
      const done = items.filter((lv) => Boolean(state.completed && state.completed[lv.id])).length;
      const firstTodo = items.find((lv) => !(state.completed && state.completed[lv.id]));
      return {
        done,
        total: items.length,
        firstId: (firstTodo || items[0] || {}).id || null
      };
    }

    function renderCourseMap() {
      const row = document.getElementById('courseMapNodesRow');
      if (!row) return;

      row.innerHTML = COURSE_MAP_NODES.map((node, idx) => {
        const st = getNodeStats(node);
        const pct = st.total > 0 ? Math.round((st.done / st.total) * 100) : 0;
        const isComplete = st.total > 0 && st.done >= st.total;

        // Strictly: 100% -> green circular checkmark; 0-99% -> mini progress bar (NO checkmark!)
        const statusHtml = isComplete
          ? `<div class="mt-1.5 flex items-center justify-center gap-1.5">
               <span class="font-mono-code text-[11px] font-bold text-white tabular-nums">${st.done} / ${st.total}</span>
               <span class="w-4 h-4 rounded-full bg-[#10b981]/20 border border-[#10b981] text-[#34d399] inline-flex items-center justify-center shadow-[0_0_8px_rgba(16,185,129,0.55)]">
                 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
               </span>
             </div>`
          : `<div class="mt-1.5 w-full max-w-[104px] mx-auto space-y-1">
               <div class="h-1.5 w-full rounded-full bg-[#0a1222] border border-[#1d2b40] overflow-hidden">
                 <div class="h-full rounded-full transition-all duration-300" style="width:${pct}%;background:${node.hex};box-shadow:0 0 8px ${node.hex};"></div>
               </div>
               <div class="font-mono-code text-[10px] font-bold text-[#94a3b8] tabular-nums text-center">${st.done} / ${st.total} (${pct}%)</div>
             </div>`;

        const arrowHtml = idx < COURSE_MAP_NODES.length - 1
          ? `<div class="flex items-center self-center -mt-9 shrink-0 px-0.5" style="color:${node.hex};filter:drop-shadow(0 0 6px ${node.hex});">
               <svg width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="9" x2="20" y2="9"/><polyline points="14 3 21 9 14 15"/></svg>
             </div>`
          : '';

        return `
          <button type="button" data-cm-jump="${st.firstId || ''}" class="group flex-1 min-w-[108px] flex flex-col items-center text-center focus:outline-none">
            <!-- Top Level Capsule -->
            <span class="font-mono-code text-[10px] font-bold tracking-wider px-2.5 py-0.5 rounded-sm text-[#040914] mb-2 transition-transform group-hover:scale-105" style="background:${node.hex};box-shadow:0 0 12px ${node.hex}88;">LVL ${node.lv}</span>

            <!-- Glowing Circle + Cyber Pedestal Base -->
            <div class="relative flex flex-col items-center">
              <div class="w-[66px] h-[66px] rounded-full flex items-center justify-center border-2 bg-[#071020] transition-transform duration-200 group-hover:-translate-y-1" style="border-color:${node.hex};color:${node.hex};box-shadow:0 0 ${isComplete ? '24px' : '14px'} ${node.hex}${isComplete ? '88' : '44'}, inset 0 0 14px ${node.hex}2e;">
                ${node.icon}
              </div>
              <div class="w-14 h-2.5 -mt-1.5 rounded-full border transition-opacity" style="border-color:${node.hex}99;background:radial-gradient(ellipse at center, ${node.hex}44 0%, rgba(7,11,24,0.1) 75%);box-shadow:0 4px 12px ${node.hex}44;"></div>
            </div>

            <!-- Pure English Label & Status -->
            <div class="mt-2.5 font-display text-xs sm:text-[13px] font-bold text-white tracking-wide group-hover:text-[#38bdf8] transition">${node.title}</div>
            ${statusHtml}
          </button>
          ${arrowHtml}
        `;
      }).join('');

      row.querySelectorAll('[data-cm-jump]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-cm-jump');
          if (typeof switchMode === 'function') switchMode('quest');
          if (targetId && typeof loadLevel === 'function') {
            const targetIdx = (typeof LEVELS !== 'undefined' && Array.isArray(LEVELS))
              ? LEVELS.findIndex((lv) => lv && lv.id === targetId)
              : -1;
            if (targetIdx >= 0) loadLevel(targetIdx);
          }
        });
      });
    }

    function syncCharacterCards() {
      // 1. Quest progress bar
      const qPctEl = document.getElementById('masteryPct');
      const qBar = document.getElementById('questSidebarBar');
      if (qPctEl && qBar) qBar.style.width = (qPctEl.textContent || '0%').trim();

      // 2. Textbook progress bar + Lv.0-6 Craftsman badge + Collapsed Compact HUD
      const tbPctEl = document.getElementById('tbMasteryPct');
      const tbPctStr = (tbPctEl ? tbPctEl.textContent : '0%').trim();
      const tbBar = document.getElementById('tbSidebarBar');
      if (tbBar) tbBar.style.width = tbPctStr;
      const tbMobBar = document.getElementById('tbMobProgressFill');
      if (tbMobBar) tbMobBar.style.width = tbPctStr;
      const tbMobPct = document.getElementById('tbMobMasteryPct');
      if (tbMobPct) tbMobPct.textContent = tbPctStr;
      if (typeof tbState !== 'undefined' && tbState && tbState.done) {
        const doneN = Object.keys(tbState.done).length;
        const tbLv = doneN >= 90 ? 6 : doneN >= 70 ? 5 : doneN >= 50 ? 4 : doneN >= 30 ? 3 : doneN >= 15 ? 2 : doneN >= 1 ? 1 : 0;
        const lvTxt = tbLv === 6 ? 'Lv.6 ★' : `Lv.${tbLv}`;
        const tbBadge = document.getElementById('tbCharLvBadge');
        if (tbBadge) tbBadge.textContent = lvTxt;
        const tbMobLv = document.getElementById('tbMobLvBadge');
        if (tbMobLv) tbMobLv.textContent = lvTxt;
        const tbMobCnt = document.getElementById('tbMobDoneCount');
        if (tbMobCnt) tbMobCnt.textContent = `${doneN} / 95`;
      }

      // 3. Extra Practice progress bar + Lv.0-6 Brain badge + Collapsed Compact HUD
      const prPctEl = document.getElementById('prMasteryPct');
      const prPctStr = (prPctEl ? prPctEl.textContent : '0%').trim();
      const prBar = document.getElementById('prSidebarBar');
      if (prBar) prBar.style.width = prPctStr;
      const prMobBar = document.getElementById('prMobProgressFill');
      if (prMobBar) prMobBar.style.width = prPctStr;
      const prMobPct = document.getElementById('prMobMasteryPct');
      if (prMobPct) prMobPct.textContent = prPctStr;
      if (typeof practiceState !== 'undefined' && practiceState && practiceState.done) {
        const doneN = Object.keys(practiceState.done).length;
        const slLv = window.SelfLearningCardEngine ? window.SelfLearningCardEngine.getLevel(practiceState.done) : 0;
        const lvTxt = slLv === 6 ? 'Lv.6 ★' : `Lv.${slLv}`;
        const prBadge = document.getElementById('prCharLvBadge');
        if (prBadge) prBadge.textContent = lvTxt;
        const prMobLv = document.getElementById('prMobLvBadge');
        if (prMobLv) prMobLv.textContent = lvTxt;
        const prMobCnt = document.getElementById('prMobDoneCount');
        if (prMobCnt) prMobCnt.textContent = `${doneN} / 521`;
      }
    }

    function initCourseMapUI() {
      const toggleBtn = document.getElementById('toggleDetailedLessonsBtn');
      const wrap = document.getElementById('homeDetailedRoadmapWrap');
      if (toggleBtn && wrap && !toggleBtn.dataset.bound) {
        toggleBtn.dataset.bound = '1';
        toggleBtn.addEventListener('click', () => {
          const isHidden = wrap.classList.toggle('hidden');
          toggleBtn.textContent = isHidden ? '23 LESSONS ▾' : '23 LESSONS ▴';
        });
      }
      renderCourseMap();
      syncCharacterCards();
      // Keep bars & Course Map synced whenever progress updates
      setInterval(() => {
        syncCharacterCards();
      }, 900);
      const origRenderRoadmap = window.renderHomeRoadmap;
      if (typeof origRenderRoadmap === 'function' && !window._cmHooked) {
        window._cmHooked = true;
        window.renderHomeRoadmap = function () {
          origRenderRoadmap.apply(this, arguments);
          renderCourseMap();
          syncCharacterCards();
        };
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCourseMapUI);
    } else {
      initCourseMapUI();
    }

    window.CourseMapUI = { render: renderCourseMap, syncCards: syncCharacterCards };
  })();

// ===== StudentProfileUI =====
  (function () {
    'use strict';

    let profBusy = false;
    let selectedTargetEmail = '';
    let teacherProfilesMap = null;

    function clampPct(v) {
      if (v === null || v === undefined || isNaN(Number(v))) return 0;
      return Math.max(0, Math.min(100, Number(v)));
    }

    function setScoreDisplay(valId, barId, miniBarId, miniPctId, val) {
      const hasVal = val !== null && val !== undefined && !isNaN(Number(val));
      const pct = hasVal ? clampPct(val) : 0;
      const vEl = document.getElementById(valId);
      const bEl = document.getElementById(barId);
      const mbEl = document.getElementById(miniBarId);
      const mpEl = document.getElementById(miniPctId);
      if (vEl) vEl.textContent = hasVal ? String(val) : '--';
      if (bEl) bEl.style.width = `${pct}%`;
      if (mbEl) mbEl.style.width = `${pct}%`;
      if (mpEl) mpEl.textContent = hasVal ? `${Math.round(pct)}%` : '--%';
      return pct;
    }

    function updateRadar(pTop, pRight, pBottom, pLeft) {
      const cx = 140, cy = 118, maxR = 74;
      const topY = cy - (maxR * pTop) / 100;
      const rightX = cx + (maxR * pRight) / 100;
      const botY = cy + (maxR * pBottom) / 100;
      const leftX = cx - (maxR * pLeft) / 100;
      const poly = document.getElementById('profRadarPoly');
      if (poly) poly.setAttribute('points', `${cx},${topY} ${rightX},${cy} ${cx},${botY} ${leftX},${cy}`);
      const dt = document.getElementById('profDotTop'); if (dt) dt.setAttribute('cy', String(topY));
      const dr = document.getElementById('profDotRight'); if (dr) dr.setAttribute('cx', String(rightX));
      const db = document.getElementById('profDotBottom'); if (db) db.setAttribute('cy', String(botY));
      const dl = document.getElementById('profDotLeft'); if (dl) dl.setAttribute('cx', String(leftX));
    }

    function renderProfile(p) {
      // 3-module progress bars
      const qTot = Number(p.questTotal || 138), qDone = Number(p.questDone || 0);
      const tTot = Number(p.tbTotal || 95), tDone = Number(p.tbDone || 0);
      const prTot = Number(p.prTotal || 521), prDone = Number(p.prDone || 0);
      const setMod = (statId, barId, d, tot) => {
        const s = document.getElementById(statId), b = document.getElementById(barId);
        if (s) s.textContent = `${d} / ${tot}`;
        if (b) b.style.width = `${tot > 0 ? Math.min(100, Math.round((d / tot) * 100)) : 0}%`;
      };
      setMod('profQuestStat', 'profQuestBar', qDone, qTot);
      setMod('profTbStat', 'profTbBar', tDone, tTot);
      setMod('profPrStat', 'profPrBar', prDone, prTot);

      // A2 Hero Score
      const gr = p.grades || {};
      const hasA2 = gr.a2Score !== null && gr.a2Score !== undefined && !isNaN(Number(gr.a2Score));
      const a2El = document.getElementById('profA2Score');
      const a2Bar = document.getElementById('profA2Bar');
      const a2Badge = document.getElementById('profA2GradeBadge');
      if (a2El) a2El.textContent = hasA2 ? String(gr.a2Score) : '--';
      if (a2Bar) a2Bar.style.width = `${hasA2 ? clampPct(gr.a2Score) : 0}%`;
      const A2_TIER_POOLS = [
        {
          key: '95_100', min: 95, badge: '👑 頂尖表現',
          comments: [
            '表現非常出色，實力穩紮穩打，繼續保持！',
            '高水準發揮，每個範疇都處理得乾淨俐落，讚！',
            '基本功同實戰力都好強，已經係班入面嘅模範水準！',
            '幾乎無可挑剔，保持呢份專注同細心，公開試一定穩陣！',
            '實力超班，可以試下挑戰多啲進階演算法題目！',
            '非常穩健嘅頂尖成績，繼續維持呢個好狀態！'
          ]
        },
        {
          key: '90_94', min: 90, badge: '🏆 表現極佳',
          comments: [
            '表現極佳，距離滿分只差一步，繼續加油！',
            '成績相當亮眼，整體掌握度好高，保持節奏！',
            '做得好出色，再微調返少少細節就可以衝上 95+！',
            '無論概念定實戰都好紮實，繼續向滿分進發！',
            '好有水準嘅發揮，睇得出你落咗唔少心機！',
            '穩企 90 分以上好唔容易，繼續保持呢股氣勢！'
          ]
        },
        {
          key: '85_89', min: 85, badge: '🔥 表現優秀',
          comments: [
            '表現優秀，基礎好穩，再推高多小小就上到 90+！',
            '成績好理想，睇得出你對課題已經相當熟手！',
            '做得好有條理，再多執一執細微位就可以再上層樓！',
            '整體表現相當出色，保持穩定練習好快衝破 90 分！',
            '實力一直喺度提升，好快就會見到你企上 90+！',
            '好穩陣嘅優秀表現，繼續保持呢份熱誠！'
          ]
        },
        {
          key: '80_84', min: 80, badge: '🚀 表現優良',
          comments: [
            '做得好，成績穩步上揚，保持呢個節奏！',
            '已經穩穩企喺 80 分以上，表現令人滿意！',
            '理解力唔錯，針對弱項再多練幾題就會衝上 85+！',
            '進步睇得到，繼續維持穩定輸出就無問題！',
            '整體發揮均衡，再細心少少檢查細節分數會更高！',
            '好有潛力再進一步，保持住呢個好勢頭！'
          ]
        },
        {
          key: '75_79', min: 75, badge: '🎯 良好發揮',
          comments: [
            '表現良好，再多操練下弱項好快就會突破 80 分！',
            '距離 80 分大關只差幾步，加把勁一定衝得到！',
            '大部份重點都掌握到，多做幾題實戰就會更穩陣！',
            '整體表現唔錯，睇返雷達圖補一補較弱嗰環就掂！',
            '已經建立到好好嘅底子，繼續堅持好快見成果！',
            '穩步向前緊，再多花少少時間溫習就會有大突破！'
          ]
        },
        {
          key: '70_74', min: 70, badge: '📈 穩健進步',
          comments: [
            '表現穩陣，基本功有掌握，繼續多做練習會更進一步！',
            '企穩 70 分以上係好開始，一步步向上推就啱啦！',
            '核心概念都明白，再多練多試就會越做越順手！',
            '狀態越嚟越好，保持每星期做少少題目好快上 75+！',
            '睇得出你有跟住進度學，繼續努力會有更大回報！',
            '表現平穩可靠，試下針對唔熟嘅題型重點操練！'
          ]
        },
        {
          key: '65_69', min: 65, badge: '⚡ 漸入佳境',
          comments: [
            '開始上手啦，再鞏固多小小就上到 70+，加油！',
            '距離 70 分只差少少，多做幾題練習好快就跨過去！',
            '表現越嚟越有起色，繼續保持呢份投入感！',
            '基本方向已經啱晒，再熟習下語法細節分數即刻升！',
            '睇得出你開始掌握到竅門，千祈唔好停落嚟！',
            '穩步進步緊，多參考返例題做法會更有信心！'
          ]
        },
        {
          key: '60_64', min: 60, badge: '👍 表現不錯',
          comments: [
            '表現不錯，已經跨過 60 分門檻，繼續保持努力！',
            '做得幾好，已經打好基本功，再多練下會更上一層樓！',
            '唔錯呀！穩住 60 分以上，下一步就向 65+ 進發！',
            '睇得出你有努力跟進，保持信心繼續做多啲練習！',
            '已經掌握到基礎概念，多花少少時間操練實有進步！',
            '表現不錯，有唔明嘅位隨時問老師，好快會再升！'
          ]
        },
        {
          key: '50_59', min: 50, badge: '🌱 潛力無限',
          comments: [
            '已經合格啦，多溫習返唔熟嘅部分，下次一定會進步！',
            '跨過合格線係第一步，再多做啲基礎題好快上 60+！',
            '你有進步嘅潛力，逐個課題清返啲唔明嘅位就得！',
            '加油！試下每日抽十幾分鐘做幾題，好快會見到分別！',
            '基礎仲可以再鞏固下，有問題隨時舉手問老師！',
            '已經行出好重要嘅一步，繼續堅持落去一定會越做越好！'
          ]
        },
        {
          key: '0_49', min: -1, badge: '💪 繼續加油',
          comments: [
            '唔好氣餒，由基本題目一步步做起，有唔明隨時問老師！',
            '萬事起頭難，先由課本例題慢慢跟住打一次，好快會上手！',
            '每個人起步節奏唔同，只要肯開始做就已經係進步！',
            '唔洗急，逐課清返基本概念，老師同平台都會幫你追返上嚟！',
            '加油呀！先揀最簡單嘅計分練習熱身，建立返信心先！',
            '而家只係起步階段，肯多練多問，下次一定會有明顯進步！'
          ]
        }
      ];

      function pickNonRepeatingComment(tierKey, comments) {
        if (!Array.isArray(comments) || !comments.length) return '繼續保持！';
        const bagKey = `pylab_prof_bag_v1_${tierKey}`;
        const lastKey = `pylab_prof_last_v1_${tierKey}`;
        let bag = [];
        let lastIdx = -1;
        try {
          bag = JSON.parse(localStorage.getItem(bagKey) || '[]');
          lastIdx = Number(localStorage.getItem(lastKey) ?? -1);
        } catch (e) {}
        bag = Array.isArray(bag) ? bag.filter((i) => Number.isInteger(i) && i >= 0 && i < comments.length) : [];
        if (bag.length === 0) {
          bag = comments.map((_, i) => i);
          for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
          }
          if (bag.length > 1 && bag[0] === lastIdx) {
            const swapIdx = 1 + Math.floor(Math.random() * (bag.length - 1));
            [bag[0], bag[swapIdx]] = [bag[swapIdx], bag[0]];
          }
        }
        const chosen = bag.shift();
        try {
          localStorage.setItem(bagKey, JSON.stringify(bag));
          localStorage.setItem(lastKey, String(chosen));
        } catch (e) {}
        return comments[chosen];
      }

      function getA2TierInfo(score) {
        const s = Number(score);
        const tier = A2_TIER_POOLS.find((t) => s >= t.min) || A2_TIER_POOLS[A2_TIER_POOLS.length - 1];
        return {
          badge: tier.badge,
          comment: pickNonRepeatingComment(tier.key, tier.comments)
        };
      }
      const tierInfo = hasA2 ? getA2TierInfo(gr.a2Score) : null;
      if (a2Badge) {
        a2Badge.textContent = tierInfo ? tierInfo.badge : '尚未公佈';
      }

      // 紙本功課細項（編程題卡內顯示，不公開任何佔比權重）
      const hasPaper = gr.paperHwScore !== null && gr.paperHwScore !== undefined && !isNaN(Number(gr.paperHwScore));
      const pPaperStat = document.getElementById('profPaperHwStat');
      const pPaperBar = document.getElementById('profPaperHwBar');
      if (pPaperStat) pPaperStat.textContent = hasPaper ? `${gr.paperHwScore} / 100` : '-- / 100';
      if (pPaperBar) pPaperBar.style.width = `${hasPaper ? clampPct(gr.paperHwScore) : 0}%`;

      // 4 Sub-Scores + Radar（編程題總分由後端加密加權計算後回傳）
      const pText = setScoreDisplay('profTextScore', 'profTextBar', null, 'profRadarPctTop', gr.textScore);
      const pCode = setScoreDisplay('profCodeScore', 'profCodeBar', null, 'profRadarPctRight', gr.codeScore);
      const pHw = setScoreDisplay('profHwScore', 'profHwBar', null, 'profRadarPctBottom', gr.hwScore);
      const pTest = setScoreDisplay('profTestScore', 'profTestBar', null, 'profRadarPctLeft', gr.testScore);
      updateRadar(pText, pCode, pHw, pTest);

      // Feedback & UpdatedAt
      const fbEl = document.getElementById('profFeedbackText');
      if (fbEl) {
        if (gr.feedback) fbEl.textContent = gr.feedback;
        else if (tierInfo) fbEl.textContent = tierInfo.comment;
        else if (p.hasGrades) fbEl.textContent = '繼續保持！';
        else fbEl.textContent = '老師尚未於「個人成績」工作表輸入你的最新分數，請稍後再按「重新整理成績」。';
      }
      const uEl = document.getElementById('profUpdatedAt');
      if (uEl) uEl.textContent = gr.updatedAt || '即時同步';
    }

    function renderLocalProfilePreview() {
      const st = (typeof state !== 'undefined' && state && state.student) ? state.student : null;
      if (!st || !st.email) return false;

      const qDone = (typeof state !== 'undefined' && state && state.completed) ? Object.keys(state.completed).length : 0;
      const tbDone = (typeof tbState !== 'undefined' && tbState && tbState.done) ? Object.keys(tbState.done).length : 0;
      const prDone = (typeof practiceState !== 'undefined' && practiceState && practiceState.done) ? Object.keys(practiceState.done).length : 0;
      const qTotal = (typeof LEVELS !== 'undefined' && LEVELS.length) ? LEVELS.length : 138;
      const tbTotal = (typeof TEXTBOOK_EXAMPLES !== 'undefined' && TEXTBOOK_EXAMPLES.length) ? TEXTBOOK_EXAMPLES.length : 95;
      const prTotal = (typeof PRACTICE_BANK !== 'undefined' && PRACTICE_BANK.length) ? PRACTICE_BANK.length : 521;

      const setMini = (txtId, barId, done, total) => {
        const t = document.getElementById(txtId);
        const b = document.getElementById(barId);
        if (t) t.textContent = `${done} / ${total}`;
        if (b) b.style.width = `${total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0}%`;
      };
      setMini('profQuestStat', 'profQuestBar', qDone, qTotal);
      setMini('profTbStat', 'profTbBar', tbDone, tbTotal);
      setMini('profPrStat', 'profPrBar', prDone, prTotal);
      return true;
    }

    async function loadProfile(force = false) {
      if (profBusy) return;
      const notice = document.getElementById('profAuthNotice');
      const noticeText = document.getElementById('profAuthNoticeText');
      const reloginBtn = document.getElementById('profReloginBtn');
      const fbEl = document.getElementById('profFeedbackText');
      const teacherBar = document.getElementById('profTeacherBar');
      const sel = document.getElementById('profTeacherStudentSelect');
      const icon = document.getElementById('profRefreshIcon');

      const hasLocalUser = renderLocalProfilePreview();

      const idToken = (typeof getTeacherIdToken === 'function' ? getTeacherIdToken() : '')
        || (typeof state !== 'undefined' && state && state.student && state.student.idToken) || '';

      if (!idToken || (typeof isIdTokenExpiredLocally === 'function' && isIdTokenExpiredLocally(idToken))) {
        if (reloginBtn) reloginBtn.textContent = hasLocalUser ? '重新驗證登入' : '前往登入';
        if (notice && noticeText) {
          noticeText.textContent = hasLocalUser
            ? 'Google 安全登入憑證每 1 小時自動過期。請按右側「重新驗證登入」點選學校 Google 帳戶，即可即時顯示個人成績與老師評語。'
            : '請先以學校 Google 帳戶登入，即可安全檢視你的個人成績檔案。';
          notice.classList.remove('hidden');
        }
        if (fbEl) {
          fbEl.textContent = hasLocalUser
            ? '為保護個人成績私隱，請按上方「重新驗證登入」刷新 Google 安全憑證後即可載入成績與老師評語。'
            : '請先登入學校 Google 帳戶以檢視個人成績與老師評語。';
        }
        return;
      }
      if (notice) notice.classList.add('hidden');
      if (fbEl && !selectedTargetEmail) fbEl.textContent = '載入個人成績與老師評語中...';

      profBusy = true;
      if (icon) icon.classList.add('animate-spin');
      try {
        const payload = { action: 'getStudentProfile', idToken };
        if (selectedTargetEmail) payload.targetEmail = selectedTargetEmail;
        const res = typeof callCloudGrader === 'function' ? await callCloudGrader(payload) : null;

        if (!res || !res.ok) {
          const isExp = Boolean(res && res.expired);
          if (reloginBtn) reloginBtn.textContent = hasLocalUser ? '重新驗證登入' : '前往登入';
          if (notice && noticeText) {
            noticeText.textContent = isExp
              ? 'Google 安全登入憑證已超過 1 小時效期，請按右側「重新驗證登入」刷新憑證。'
              : ((res && res.message) || '未能讀取個人檔案，請確認已部署最新版 Apps Script 或重新驗證登入。');
            notice.classList.remove('hidden');
          }
          if (fbEl) {
            fbEl.textContent = isExp
              ? '請按上方「重新驗證登入」刷新 Google 憑證，即可即時顯示個人成績與老師評語。'
              : '暫時未能取得個人成績，請確認網絡或按「重新整理成績」重試。';
          }
          return;
        }

        if (res.isTeacher && teacherBar && sel) {
          teacherBar.classList.remove('hidden');
          if (res.allProfiles && typeof res.allProfiles === 'object') {
            teacherProfilesMap = res.allProfiles;
          }
          if (Array.isArray(res.studentList)) {
            const prevVal = sel.value;
            sel.innerHTML = '<option value="">-- 檢視目前登入帳戶 --</option>';
            res.studentList.forEach((st) => {
              const opt = document.createElement('option');
              opt.value = st.email;
              opt.textContent = st.label;
              sel.appendChild(opt);
            });
            if (prevVal) sel.value = prevVal;
          }
        } else if (teacherBar) {
          teacherBar.classList.add('hidden');
          teacherProfilesMap = null;
        }

        const activeProf = (selectedTargetEmail && teacherProfilesMap && teacherProfilesMap[selectedTargetEmail])
          ? teacherProfilesMap[selectedTargetEmail]
          : res.profile;
        if (activeProf) renderProfile(activeProf);
      } catch (e) {
        if (notice && noticeText) {
          noticeText.textContent = '讀取個人成績時發生連線錯誤，請按「重新整理成績」重試。';
          notice.classList.remove('hidden');
        }
        if (fbEl) fbEl.textContent = '連線至成績伺服器時發生錯誤，請按「重新整理成績」重試。';
      } finally {
        profBusy = false;
        if (icon) icon.classList.remove('animate-spin');
      }
    }

    function initProfileUI() {
      const navBtn = document.getElementById('modeProfileBtn');
      if (navBtn && !navBtn.dataset.profBound) {
        navBtn.dataset.profBound = '1';
        navBtn.addEventListener('click', () => {
          if (typeof switchMode === 'function') switchMode('profile');
        });
      }
      const refBtn = document.getElementById('profRefreshBtn');
      if (refBtn && !refBtn.dataset.profBound) {
        refBtn.dataset.profBound = '1';
        refBtn.addEventListener('click', async () => {
          await loadProfile(true);
          if (typeof window.showToast === 'function') window.showToast('個人成績已重新整理', 'info', 2200);
        });
      }
      const reloginBtn = document.getElementById('profReloginBtn');
      if (reloginBtn && !reloginBtn.dataset.profBound) {
        reloginBtn.dataset.profBound = '1';
        reloginBtn.addEventListener('click', () => {
          const errEl = document.getElementById('loginErrorMsg');
          const stEl = document.getElementById('loginCloudStatus');
          if (errEl) errEl.classList.add('hidden');
          if (stEl) stEl.classList.add('hidden');
          if (typeof updateGmailModalUI === 'function') updateGmailModalUI(true);
          const modal = document.getElementById('loginModal');
          if (modal) modal.classList.remove('hidden');
        });
      }
      const sel = document.getElementById('profTeacherStudentSelect');
      if (sel && !sel.dataset.profBound) {
        sel.dataset.profBound = '1';
        sel.addEventListener('change', () => {
          selectedTargetEmail = (sel.value || '').trim().toLowerCase();
          const selfEm = (typeof state !== 'undefined' && state && state.student && state.student.email)
            ? String(state.student.email).trim().toLowerCase() : '';
          const lookupKey = selectedTargetEmail || selfEm;
          if (teacherProfilesMap && lookupKey && teacherProfilesMap[lookupKey]) {
            renderProfile(teacherProfilesMap[lookupKey]);
            return;
          }
          loadProfile(true);
        });
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initProfileUI);
    } else {
      initProfileUI();
    }

    window.StudentProfileUI = { load: loadProfile };
  })();

// ===== FloatingUiSystem =====
  // =========================================================================
  // Phase 1 Floating UI System: Modal / Popover / Tooltip / Toast + Telemetry Cards
  // =========================================================================
  (function initPlFloatingUiSystem() {
    if (window.__plFloatingUiInitialized) return;
    window.__plFloatingUiInitialized = true;

    // ---------- 1. Modal: Reusable Promise Confirm Modal ----------
    let confirmResolver = null;
    const confirmModal = document.getElementById('confirmActionModal');
    const confirmTitle = document.getElementById('confirmModalTitle');
    const confirmMsg = document.getElementById('confirmModalMessage');
    const confirmOkBtn = document.getElementById('confirmModalOkBtn');
    const confirmCancelBtn = document.getElementById('confirmModalCancelBtn');
    const confirmCloseBtn = document.getElementById('confirmModalCloseBtn');

    function finishConfirm(result) {
      if (confirmModal) confirmModal.classList.add('hidden');
      const resolve = confirmResolver;
      confirmResolver = null;
      if (typeof resolve === 'function') resolve(Boolean(result));
    }

    window.showConfirmModal = function showConfirmModal({
      title = '確認操作',
      message = '',
      confirmText = '確定',
      cancelText = '取消',
      danger = false
    } = {}) {
      if (confirmResolver) finishConfirm(false);
      if (!confirmModal) return Promise.resolve(false);
      if (typeof window.closePopover === 'function') window.closePopover();

      if (confirmTitle) confirmTitle.textContent = title;
      if (confirmMsg) confirmMsg.textContent = message;
      if (confirmOkBtn) {
        confirmOkBtn.textContent = confirmText;
        confirmOkBtn.className = danger
          ? 'hw-btn px-4 py-1.5 rounded-sm text-xs font-bold text-white bg-[#e11d48] hover:bg-[#be123c] border border-[#fb7185]'
          : 'hw-btn px-4 py-1.5 rounded-sm text-xs font-bold text-white bg-[#2563eb] hover:bg-[#1d4ed8] border border-[#3b82f6]';
      }
      if (confirmCancelBtn) confirmCancelBtn.textContent = cancelText;

      confirmModal.classList.remove('hidden');
      setTimeout(() => confirmOkBtn && confirmOkBtn.focus(), 0);
      return new Promise((resolve) => { confirmResolver = resolve; });
    };

    if (confirmOkBtn) confirmOkBtn.addEventListener('click', () => finishConfirm(true));
    if (confirmCancelBtn) confirmCancelBtn.addEventListener('click', () => finishConfirm(false));
    if (confirmCloseBtn) confirmCloseBtn.addEventListener('click', () => finishConfirm(false));
    if (confirmModal) {
      confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) finishConfirm(false);
      });
    }

    // Unified backdrop click close for #loginModal & #teacherSyncModal
    const loginModalEl = document.getElementById('loginModal');
    const syncModalEl = document.getElementById('teacherSyncModal');
    if (loginModalEl) {
      loginModalEl.addEventListener('click', (e) => {
        if (e.target === loginModalEl) loginModalEl.classList.add('hidden');
      });
    }
    if (syncModalEl) {
      syncModalEl.addEventListener('click', (e) => {
        if (e.target === syncModalEl) syncModalEl.classList.add('hidden');
      });
    }

    // ---------- 2. Popover: Anchored Interactive Bubble ----------
    const popoverHost = document.getElementById('plPopoverHost');
    let activePopover = null; // { anchorEl, cardEl, key }

    function positionPopover() {
      if (!activePopover) return;
      const { anchorEl, cardEl } = activePopover;
      if (!anchorEl || !document.body.contains(anchorEl)) {
        window.closePopover();
        return;
      }
      const rect = anchorEl.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        window.closePopover();
        return;
      }
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
        window.closePopover();
        return;
      }
      const pad = 10;
      const cw = cardEl.offsetWidth || 300;
      const ch = cardEl.offsetHeight || 160;
      let left = rect.left + rect.width / 2 - cw / 2;
      left = Math.max(pad, Math.min(left, window.innerWidth - cw - pad));

      let top = rect.bottom + 8;
      if (top + ch > window.innerHeight - pad && rect.top - ch - 8 >= pad) {
        top = rect.top - ch - 8;
      } else {
        top = Math.max(pad, Math.min(top, window.innerHeight - ch - pad));
      }
      cardEl.style.left = `${Math.round(left)}px`;
      cardEl.style.top = `${Math.round(top)}px`;
    }

    window.closePopover = function closePopover() {
      if (!activePopover) return;
      activePopover.cardEl.remove();
      activePopover = null;
    };

    window.openPopover = function openPopover({ anchorEl, key, html, onBind }) {
      if (!popoverHost || !anchorEl) return;
      if (activePopover && activePopover.key === key && activePopover.anchorEl === anchorEl) {
        window.closePopover();
        return;
      }
      window.closePopover();
      const cardEl = document.createElement('div');
      cardEl.className = 'pl-popover-card p-3.5 space-y-2.5';
      cardEl.innerHTML = html;
      popoverHost.appendChild(cardEl);
      activePopover = { anchorEl, cardEl, key };
      positionPopover();
      if (typeof onBind === 'function') onBind(cardEl, window.closePopover);
    };

    document.addEventListener('pointerdown', (e) => {
      if (!activePopover) return;
      if (activePopover.cardEl.contains(e.target) || activePopover.anchorEl.contains(e.target)) return;
      window.closePopover();
    });
    window.addEventListener('scroll', positionPopover, true);
    window.addEventListener('resize', positionPopover);

    // Global layered Escape key handler
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (confirmModal && !confirmModal.classList.contains('hidden')) {
        finishConfirm(false);
      } else if (syncModalEl && !syncModalEl.classList.contains('hidden')) {
        syncModalEl.classList.add('hidden');
      } else if (loginModalEl && !loginModalEl.classList.contains('hidden')) {
        loginModalEl.classList.add('hidden');
      } else if (activePopover) {
        window.closePopover();
      }
    });

    // Live Telemetry Popover Cards (#xpReadout, #mobXpReadout, #penaltyReadout, #mobPenaltyReadout)
    // Strictly do NOT bind to #levelBadge / #questLvBadge / #mobLevelBadge (reserved for openLevelCardGallery)
    function openXpDetailPopover(anchorEl) {
      const done = (typeof state !== 'undefined' && state && state.completed) ? Object.keys(state.completed).length : 0;
      const total = (typeof LEVELS !== 'undefined' && Array.isArray(LEVELS)) ? LEVELS.length : 138;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const xpVal = (typeof state !== 'undefined' && state) ? (state.xp || 0) : 0;
      const clearedLv = typeof getClearedLessonCount === 'function' ? getClearedLessonCount() : 0;

      window.openPopover({
        anchorEl,
        key: 'xp_detail',
        html: `
          <div class="flex items-center justify-between gap-2 pb-1.5 border-b border-[#1d2b40]">
            <span class="font-mono-code text-[11px] font-bold text-[#fbbf24]">⚡ XP 與完成進度</span>
            <span class="font-mono-code text-[10px] px-1.5 py-0.5 rounded bg-[#00f5ff]/15 text-[#00f5ff] border border-[#00f5ff]/35 font-bold">LV.${clearedLv}</span>
          </div>
          <div class="space-y-1.5 font-mono-code text-xs">
            <div class="flex items-center justify-between text-[#cbd5e1]"><span>目前總分</span><span class="text-[#fbbf24] font-bold">${xpVal} XP</span></div>
            <div class="flex items-center justify-between text-[#cbd5e1]"><span>計分練習完成</span><span class="text-white font-bold">${done} / ${total} (${pct}%)</span></div>
            <div class="h-1.5 w-full rounded-full bg-[#060d1a] border border-[#1d3554] overflow-hidden">
              <div class="h-full rounded-full bg-gradient-to-r from-[#00f5ff] to-[#10b981]" style="width:${pct}%"></div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-1.5 pt-1">
            <button type="button" data-xp-cards class="hw-btn px-2.5 py-1.5 rounded-sm bg-[#0c2236] hover:bg-[#12314d] border border-[#38bdf8]/45 text-[11px] font-bold text-[#38bdf8]">🃏 3D 等級卡</button>
            <button type="button" data-xp-profile class="hw-btn px-2.5 py-1.5 rounded-sm bg-[#0c221b] hover:bg-[#103026] border border-[#10b981]/45 text-[11px] font-bold text-[#34d399]">👤 個人檔案</button>
          </div>
        `,
        onBind: (cardEl, close) => {
          cardEl.querySelector('[data-xp-cards]')?.addEventListener('click', () => {
            close();
            if (typeof window.openLevelCardGallery === 'function') window.openLevelCardGallery();
          });
          cardEl.querySelector('[data-xp-profile]')?.addEventListener('click', () => {
            close();
            if (typeof switchMode === 'function') switchMode('profile');
          });
        }
      });
    }

    function openPenaltyDetailPopover(anchorEl) {
      const penVal = (typeof state !== 'undefined' && state) ? (state.penalty || 0) : 0;
      const switches = (typeof state !== 'undefined' && state) ? (state.tabSwitches || 0) : 0;
      const awaySec = (typeof state !== 'undefined' && state) ? Math.round(state.awaySeconds || 0) : 0;

      window.openPopover({
        anchorEl,
        key: 'penalty_detail',
        html: `
          <div class="flex items-center justify-between gap-2 pb-1.5 border-b border-[#1d2b40]">
            <span class="font-mono-code text-[11px] font-bold text-[#fda4af]">🛡 專注與扣分詳情</span>
            <button type="button" data-pop-close class="text-xs text-[#94a3b8] hover:text-white px-1" aria-label="關閉">✕</button>
          </div>
          <div class="space-y-1.5 font-mono-code text-xs">
            <div class="flex items-center justify-between text-[#cbd5e1]"><span>目前扣分</span><span class="text-[#fda4af] font-bold">${penVal > 0 ? '-' + penVal : '0'} 分</span></div>
            <div class="flex items-center justify-between text-[#cbd5e1]"><span>本節切頁次數</span><span class="text-white font-bold">${switches} 次</span></div>
            <div class="flex items-center justify-between text-[#cbd5e1]"><span>離開視窗秒數</span><span class="text-white font-bold">${awaySec} 秒</span></div>
          </div>
          <p class="text-[11px] text-[#94a3b8] leading-relaxed pt-0.5">保持在課堂分頁專注作答，可避免異常切頁紀錄。</p>
        `,
        onBind: (cardEl, close) => {
          cardEl.querySelector('[data-pop-close]')?.addEventListener('click', close);
        }
      });
    }

    ['xpReadout', 'mobXpReadout'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.dataset.popBound) {
        el.dataset.popBound = '1';
        el.addEventListener('click', (e) => { e.stopPropagation(); openXpDetailPopover(el); });
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openXpDetailPopover(el); } });
      }
    });
    ['penaltyReadout', 'mobPenaltyReadout'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.dataset.popBound) {
        el.dataset.popBound = '1';
        el.addEventListener('click', (e) => { e.stopPropagation(); openPenaltyDetailPopover(el); });
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPenaltyDetailPopover(el); } });
      }
    });

    // ---------- 3. Tooltip: Non-Interactive HUD + Touch Guard ----------
    const tooltipEl = document.getElementById('plTooltip');
    let isTouchDevice = false;
    let activeTipTarget = null;

    function hideTooltip() {
      activeTipTarget = null;
      if (!tooltipEl) return;
      tooltipEl.classList.remove('is-visible');
      tooltipEl.setAttribute('aria-hidden', 'true');
    }

    window.addEventListener('touchstart', () => {
      isTouchDevice = true;
      hideTooltip();
    }, { passive: true });

    window.setPlTooltip = function setPlTooltip(el, text) {
      if (!el) return;
      el.removeAttribute('title');
      if (text) el.setAttribute('data-tooltip', text);
      else el.removeAttribute('data-tooltip');
    };

    function showTooltip(target) {
      if (isTouchDevice || !tooltipEl || !target) return;
      const text = target.getAttribute('data-tooltip');
      if (!text) return;
      activeTipTarget = target;
      tooltipEl.textContent = text;
      tooltipEl.setAttribute('aria-hidden', 'false');
      tooltipEl.classList.add('is-visible');

      const rect = target.getBoundingClientRect();
      const tw = tooltipEl.offsetWidth || 120;
      const th = tooltipEl.offsetHeight || 28;
      const pad = 8;
      let left = rect.left + rect.width / 2 - tw / 2;
      left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
      let top = rect.top - th - 8;
      if (top < pad) top = rect.bottom + 8;
      top = Math.max(pad, Math.min(top, window.innerHeight - th - pad));
      tooltipEl.style.left = `${Math.round(left)}px`;
      tooltipEl.style.top = `${Math.round(top)}px`;
    }

    document.addEventListener('mouseover', (e) => {
      if (isTouchDevice) return;
      const t = e.target && e.target.closest ? e.target.closest('[data-tooltip]') : null;
      if (t) showTooltip(t);
    });
    document.addEventListener('mouseout', (e) => {
      if (!activeTipTarget) return;
      const rel = e.relatedTarget;
      if (!rel || !activeTipTarget.contains(rel)) hideTooltip();
    });
    document.addEventListener('focusin', (e) => {
      if (isTouchDevice) return;
      const t = e.target && e.target.closest ? e.target.closest('[data-tooltip]') : null;
      if (t) showTooltip(t);
    });
    document.addEventListener('focusout', hideTooltip);
    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);

    // 21+ Core Controls unified HUD Tooltip registration
    const CORE_TOOLTIPS = {
      mobileMenuBtn: '收合或展開側邊單元目錄',
      soundToggleBtn: '開關互動音效',
      switchToStudentViewBtn: '以周同學身分體驗 100% 真實學生模式',
      returnTeacherViewBtn: '返回老師模式',
      headerPreviewLvUpBtn: '預覽課堂 3D 升級動畫',
      studentProfileBtn: '帳戶快捷選單與登入設定',
      runPyBtn: '執行測試（不計分，使用下方 STDIN）',
      checkPyBtn: '提交批改並同步雲端進度',
      questTraceBtn: '逐步空運行追蹤變量變化',
      resetStarterBtn: '重設為題目初始程式碼骨架',
      tbRunBtn: '運行課本例題程式碼',
      tbCheckBtn: '核對課本例題預期輸出',
      tbTraceBtn: '逐步空運行追蹤例題變量',
      tbResetCodeBtn: '重設課本例題初始程式碼',
      lbRefreshBtn: '重新整理即時排行榜',
      profRefreshBtn: '重新整理雲端個人成績',
      levelBadge: '點擊欣賞 3D 等級卡牌庫',
      questLvBadge: '點擊欣賞 3D 等級卡牌庫',
      mobLevelBadge: '點擊欣賞 3D 等級卡牌庫',
      xpReadout: '點擊檢視 XP 與完成進度詳情',
      mobXpReadout: '點擊檢視 XP 與完成進度詳情',
      penaltyReadout: '點擊檢視扣分與切頁紀錄',
      mobPenaltyReadout: '點擊檢視扣分與切頁紀錄'
    };
    Object.entries(CORE_TOOLTIPS).forEach(([id, tip]) => {
      const el = document.getElementById(id);
      if (el && !el.getAttribute('data-tooltip')) {
        window.setPlTooltip(el, tip);
      } else if (el) {
        el.removeAttribute('title');
      }
    });

    // ---------- 4. Toast: Non-Blocking Notification Stack (Max 3) ----------
    const toastContainer = document.getElementById('plToastContainer');
    const TOAST_ICONS = { success: '✓', info: 'ℹ', warning: '⚠', error: '✕' };

    window.showToast = function showToast(message, type = 'info', duration = 2600) {
      if (!toastContainer || !message) return;
      while (toastContainer.children.length >= 3) {
        if (toastContainer.firstElementChild) toastContainer.firstElementChild.remove();
      }
      const safeMsg = String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const toast = document.createElement('div');
      toast.className = `pl-toast pl-toast-${type}`;
      toast.innerHTML = `
        <span class="font-mono-code font-bold shrink-0">${TOAST_ICONS[type] || 'ℹ'}</span>
        <span class="flex-1 break-words">${safeMsg}</span>
        <button type="button" class="text-xs opacity-70 hover:opacity-100 shrink-0 pl-1 leading-none" aria-label="關閉">✕</button>
      `;

      let remaining = Math.max(1200, Number(duration) || 2600);
      let startAt = Date.now();
      let timer = null;
      let closed = false;

      const dismiss = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        toast.classList.add('is-leaving');
        setTimeout(() => toast.remove(), 220);
      };
      const startTimer = () => {
        if (closed) return;
        startAt = Date.now();
        timer = setTimeout(dismiss, remaining);
      };
      const pauseTimer = () => {
        clearTimeout(timer);
        remaining = Math.max(300, remaining - (Date.now() - startAt));
      };

      toast.addEventListener('mouseenter', pauseTimer);
      toast.addEventListener('mouseleave', startTimer);
      const closeBtn = toast.querySelector('button');
      if (closeBtn) closeBtn.addEventListener('click', dismiss);

      toastContainer.appendChild(toast);
      startTimer();
    };
  })();
