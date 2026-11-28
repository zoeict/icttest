    // =========================================================================
    // [老師上載 GitHub Pages 前只需在此貼上您的 Google Apps Script Web App 網址]
    // 例如：const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzcC9SMMYZeSBYG01zlJ8whwX8VdtNGB9ebK3ZhscANBm5k5IbpJu4pDeqwl0PbQDwN/exec";
    // =========================================================================
    const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxH9ECHTX-6AmQspSoqz-XTyF50q81NGJPFUzJhOvneoPaC48okmOkAn8nNQ26OmdbV/exec";
    // 教師設定：貼上 Google Cloud Console 取得的 OAuth 2.0 Web Client ID 即可啟用官方「使用 Google 帳戶登入」按鈕
    const GOOGLE_CLIENT_ID = "13333491283-9l610elv8e5vqglneb26nq9risf8i11a.apps.googleusercontent.com";
    // 選填：如只限本校電郵登入可填 "frcss.edu.hk"，留空則接受任何 Google / Gmail 帳戶
    const ALLOWED_DOMAIN = "frcss.edu.hk";


    const ACTIVE_USER_KEY = 'hkdse_py_class_v1_user';
    const GAS_URL_KEY = 'hkdse_py_class_v1_gas_url';
    const GOOGLE_CID_KEY = 'hkdse_py_class_v1_google_cid';
    const ALLOWED_DOM_KEY = 'hkdse_py_class_v1_allowed_dom';
    function getGoogleClientId() { try { return localStorage.getItem(GOOGLE_CID_KEY) || GOOGLE_CLIENT_ID; } catch (e) { return GOOGLE_CLIENT_ID; } }
    function getAllowedDomain() { try { return localStorage.getItem(ALLOWED_DOM_KEY) || ALLOWED_DOMAIN; } catch (e) { return ALLOWED_DOMAIN; } }
    const SPRINT_LB_KEY = 'hkdse_py_class_v1_sprint_lb';

    const state = {
      pyodide: null,
      mode: 'home',
      currentLevelIdx: 0,
      student: null,
      completed: {},
      usedSolution: {},
      attempts: {},
      xp: 0,
      penalty: 0,
      tabSwitches: 0,
      awaySeconds: 0,
      hiddenAt: null,
      sprintBest: 0,
      soundOn: true,
      openChapters: { 1: true },
      sidebarCollapsed: (() => { try { return localStorage.getItem('pl_sidebar_collapsed_v1') === '1'; } catch (e) { return false; } })(),
      tbSidebarCollapsed: (() => { try { return localStorage.getItem('pl_sidebar_collapsed_v1') === '1'; } catch (e) { return false; } })(),
      extraSidebarCollapsed: (() => { try { return localStorage.getItem('pl_sidebar_collapsed_v1') === '1'; } catch (e) { return false; } })(),
      tbSidebarCollapsed: false,
      extraSidebarCollapsed: false,
      demoKey: 'swap',
      demoStep: 0,
      demoTimer: null,
      selectedMcq: null,
      lastPasteBlocked: false
    };

    function getGasUrl() {
      try {
        const saved = localStorage.getItem(GAS_URL_KEY);
        if (saved && (saved.includes('AKfycbzcC9SMMYZeSBYG01zlJ8whwX8VdtNGB9ebK3ZhscANBm5k5IbpJu4pDeqwl0PbQDwN') || saved.includes('AKfycbzezFIv2KTabhEzSCCQD6TqaRYf-xnVQZjfdTRxuTbz2xKPzk-pAmE6l7Kfi1wnZM-7'))) {
          localStorage.removeItem(GAS_URL_KEY);
          return GAS_WEBAPP_URL;
        }
        return saved || GAS_WEBAPP_URL;
      } catch (e) { return GAS_WEBAPP_URL; }
    }

    function updateSyncTag() {
      const url = getGasUrl();
      const el = document.getElementById('syncStatusTag');
      if (url && url.startsWith('https://')) {
        el.textContent = '● Sheet 雲端已連';
        el.className = 'font-mono-code text-[10px] text-[#10d981] font-bold';
      } else {
        el.textContent = '本機儲存（未連 Sheet）';
        el.className = 'font-mono-code text-[10px] text-[#64748b]';
      }
    }

    const pendingCloudSyncQueue = [];
    let _lastReloginPromptAt = 0;

    function isIdTokenExpiredLocally(tok) {
      if (!tok || typeof decodeJwtPayload !== 'function') return false;
      try {
        const info = decodeJwtPayload(tok);
        if (info && info.exp) {
          return (Number(info.exp) * 1000) <= (Date.now() + 15000);
        }
      } catch (e) {}
      return false;
    }

    function queuePendingCloudSync(payload) {
      if (!payload || typeof payload !== 'object') return;
      const dedupeKey = String(payload.levelId || payload.action || '');
      if (dedupeKey) {
        const idx = pendingCloudSyncQueue.findIndex((item) => String(item.levelId || item.action || '') === dedupeKey);
        if (idx >= 0) pendingCloudSyncQueue.splice(idx, 1);
      }
      pendingCloudSyncQueue.push({ ...payload });
      if (pendingCloudSyncQueue.length > 50) pendingCloudSyncQueue.shift();
    }

    function promptTokenExpiredRelogin(reasonMsg = '') {
      try { sessionStorage.removeItem('hkdse_py_id_token'); } catch (e) {}
      if (state.student && state.student.idToken) state.student.idToken = '';
      const queuedCount = pendingCloudSyncQueue.length;
      const bannerMsg = queuedCount > 0
        ? `🔑 Google 登入憑證已過期（尚有 ${queuedCount} 筆進度待補寫），請重新驗證登入`
        : '🔑 Google 登入憑證已過期（超過 1 小時），請重新驗證登入以繼續同步雲端';
      setCloudSyncBanner(bannerMsg, 'warn', 0);

      const errEl = document.getElementById('loginErrorMsg');
      const stEl = document.getElementById('loginCloudStatus');
      if (errEl) errEl.classList.add('hidden');
      if (stEl) {
        stEl.className = 'text-xs font-bold text-[#fbbf24] leading-relaxed';
        stEl.textContent = queuedCount > 0
          ? `🔑 登入憑證已過期（每 1 小時自動到期）。請重新點擊下方 Google 帳戶登入，系統將自動補寫剛才尚未同步的 ${queuedCount} 筆進度。`
          : `🔑 登入憑證已過期（每 1 小時自動到期）。${reasonMsg ? reasonMsg + '，' : ''}請重新點擊下方 Google 帳戶登入。`;
        stEl.classList.remove('hidden');
      }
      if (typeof updateGmailModalUI === 'function') updateGmailModalUI(true);
      const modal = document.getElementById('loginModal');
      if (modal) modal.classList.remove('hidden');

      const now = Date.now();
      if (now - _lastReloginPromptAt > 10000) {
        _lastReloginPromptAt = now;
        try {
          if (typeof google !== 'undefined' && google.accounts && google.accounts.id && typeof google.accounts.id.prompt === 'function') {
            google.accounts.id.prompt();
          }
        } catch (e) {}
      }
    }

    async function flushPendingCloudSyncs() {
      if (!pendingCloudSyncQueue.length) return 0;
      const batch = pendingCloudSyncQueue.splice(0, pendingCloudSyncQueue.length);
      let synced = 0;
      for (let i = 0; i < batch.length; i++) {
        const ok = await syncToGoogleSheet(batch[i]);
        if (ok) {
          synced++;
        } else {
          // If still failed (e.g. network hiccup), preserve remaining items
          for (let j = i + 1; j < batch.length; j++) queuePendingCloudSync(batch[j]);
          break;
        }
      }
      if (synced > 0) {
        setCloudSyncBanner(`✓ 已重新驗證並補寫 ${synced} 筆雲端進度`, 'ok', 4200);
      }
      return synced;
    }

    async function syncToGoogleSheet(payload) {
      if (payload && payload.passed && payload.levelId && payload.code) {
        if (!state.passedCode) state.passedCode = {};
        state.passedCode[payload.levelId] = payload.code;
      }
      const url = getGasUrl();
      if (!url) {
        setCloudSyncBanner('⚠ 尚未設定 Google Apps Script 網址，無法寫入雲端', 'warn', 4500);
        return false;
      }
      const currentToken = getTeacherIdToken();
      const hasLoggedInStudent = Boolean(state.student && state.student.email);
      if (hasLoggedInStudent && (!currentToken || isIdTokenExpiredLocally(currentToken))) {
        queuePendingCloudSync(payload);
        promptTokenExpiredRelogin();
        return false;
      }
      const enriched = {
        ...payload,
        idToken: currentToken,
        email: hasLoggedInStudent ? state.student.email : (payload.email || ''),
        progressSnapshot: {
          xp: state.xp,
          penalty: state.penalty,
          completed: state.completed,
          tbDone: (typeof tbState !== 'undefined' && tbState.done) ? tbState.done : {},
          practiceDone: (typeof practiceState !== 'undefined' && practiceState.done) ? practiceState.done : {}
        }
      };
      setCloudSyncBanner('同步中，請稍候', 'info');
      try {
        const resp = await fetch(url, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(enriched)
        });
        if (!resp.ok) {
          setCloudSyncBanner(`⚠ Google Sheet 寫入失敗（HTTP ${resp.status}）`, 'warn', 5500);
          return false;
        }
        const data = await resp.json().catch(() => null);
        if (data && (data.status === 'ok' || data.status === 'success')) {
          setCloudSyncBanner('✓ 同步完成', 'ok', 2800);
          return true;
        }
        if (data && (data.expired === true || /過期|憑證|重新登入/.test(String(data.message || '')))) {
          queuePendingCloudSync(payload);
          promptTokenExpiredRelogin(String(data.message || ''));
          return false;
        }
        setCloudSyncBanner(`⚠ 雲端拒收：${(data && data.message) || '請確認 GAS 已重新部署最新版本'}`, 'warn', 6000);
        return false;
      } catch (e) {
        setCloudSyncBanner('⚠ 未能寫入 Google Sheet，請檢查網絡或 GAS 部署權限', 'warn', 5500);
        return false;
      }
    }

    function sprintHash(cardId, ans) {
      const norm = String(ans || '').trim().replace(/\s+/g, '').toLowerCase();
      const s = `HKDSE_ICT_2026|${cardId}|${norm}`;
      let h1 = 0x811c9dc5;
      let h2 = 0x01000193;
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ (c + 17), 0x85ebca6b) >>> 0;
      }
      return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
    }

    async function callCloudGrader(payload) {
      const url = getGasUrl();
      if (!url) {
        return {
          status: 'no_gas',
          message: '尚未設定雲端核對伺服器（Google Apps Script 網址）。請老師按左上角標誌 5 下（或 Ctrl+Shift+T）貼上已更新的 GAS 網址。'
        };
      }
      try {
        const resp = await fetch(url, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) {
          return { status: 'error', message: `雲端核對連線失敗（HTTP ${resp.status}），請稍後再試。` };
        }
        const data = await resp.json();
        return data || { status: 'error', message: '雲端核對回應格式異常。' };
      } catch (e) {
        return { status: 'error', message: '未能連線至雲端核對伺服器，請檢查網絡或確認 GAS 已重新部署為最新版本。' };
      }
    }

    let _cloudSyncHideTimer = null;
    function setCloudSyncBanner(msg, tone = 'info', autoHideMs = 0) {
      const wrap = document.getElementById('homeSyncBanner');
      const pill = document.getElementById('homeSyncPill');
      const txt = document.getElementById('homeSyncText');
      const dot = document.getElementById('homeSyncDot');
      if (!wrap || !pill || !txt) return;
      clearTimeout(_cloudSyncHideTimer);
      if (!msg) { wrap.classList.add('hidden'); return; }
      const styleMap = {
        info: {
          bg: 'linear-gradient(135deg, rgba(10, 24, 48, 0.78) 0%, rgba(16, 16, 42, 0.82) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.45)',
          color: '#e0f2fe',
          shadow: '0 0 22px rgba(56, 189, 248, 0.24), inset 0 1px 0 rgba(255,255,255,0.14)',
          dotHtml: '<span class="sync-eq"><span></span><span></span><span></span></span>',
          syncing: true
        },
        ok: {
          bg: 'linear-gradient(135deg, rgba(6, 32, 26, 0.78) 0%, rgba(8, 24, 28, 0.82) 100%)',
          border: '1px solid rgba(52, 211, 153, 0.55)',
          color: '#d1fae5',
          shadow: '0 0 20px rgba(16, 185, 129, 0.25), inset 0 1px 0 rgba(255,255,255,0.14)',
          dotHtml: '<span class="relative inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#10b981]/25 text-[#34d399] text-[11px] font-bold">✓</span>',
          syncing: false
        },
        warn: {
          bg: 'linear-gradient(135deg, rgba(38, 24, 8, 0.8) 0%, rgba(24, 16, 8, 0.84) 100%)',
          border: '1px solid rgba(251, 191, 36, 0.55)',
          color: '#fef3c7',
          shadow: '0 0 20px rgba(245, 158, 11, 0.24), inset 0 1px 0 rgba(255,255,255,0.12)',
          dotHtml: '<span class="w-2.5 h-2.5 rounded-full bg-[#fbbf24] shadow-[0_0_8px_#fbbf24]"></span>',
          syncing: false
        },
        err: {
          bg: 'linear-gradient(135deg, rgba(44, 12, 20, 0.82) 0%, rgba(28, 10, 18, 0.86) 100%)',
          border: '1px solid rgba(248, 113, 113, 0.58)',
          color: '#fee2e2',
          shadow: '0 0 20px rgba(239, 68, 68, 0.25), inset 0 1px 0 rgba(255,255,255,0.12)',
          dotHtml: '<span class="w-2.5 h-2.5 rounded-full bg-[#f87171] shadow-[0_0_8px_#f87171]"></span>',
          syncing: false
        }
      };
      const st = styleMap[tone] || styleMap.info;
      pill.style.background = st.bg;
      pill.style.border = st.border;
      pill.style.color = st.color;
      pill.style.boxShadow = st.shadow;
      pill.classList.toggle('is-syncing', Boolean(st.syncing));
      if (dot) {
        dot.className = 'inline-flex items-center justify-center shrink-0';
        dot.innerHTML = st.dotHtml;
      }
      txt.textContent = msg;
      wrap.classList.remove('hidden');
      if (autoHideMs > 0) {
        _cloudSyncHideTimer = setTimeout(() => { wrap.classList.add('hidden'); }, autoHideMs);
      }
    }

    async function loadCloudProgressByEmail(email, opts = {}) {
      const url = getGasUrl();
      if (!url || !email) return null;
      const showBanner = Boolean(opts.showBanner);
      if (showBanner) setCloudSyncBanner('同步中，請稍候', 'info');

      const parseResp = (data) => {
        if (data && (data.status === 'success' || data.status === 'ok' || data.ok === true)) {
          if (data.found && data.progress) {
            return { ...data.progress, _found: true };
          }
          if (data.found === false) {
            return { _found: false, xp: 0, penalty: 0, completed: {}, tbDone: {}, latestCode: {} };
          }
        }
        return null;
      };

      // 強制使用經 Google ID Token 驗證的 POST load_progress 端點讀取進度
      const idToken = getTeacherIdToken();
      if (!idToken) {
        if (showBanner) setCloudSyncBanner('🔑 登入憑證已過期，請按右上角重新驗證 Google 帳戶以同步雲端進度', 'warn', 7000);
        return null;
      }

      try {
        const postData = await callCloudGrader({
          action: 'load_progress',
          idToken,
          targetEmail: email
        });
        const parsed = parseResp(postData);
        if (parsed) return parsed;

        if (postData && (postData.expired === true || /過期|憑證|重新登入/.test(String(postData.message || '')))) {
          if (showBanner) setCloudSyncBanner('🔑 Google 登入憑證已過期（超過 1 小時），請按右上角重新驗證登入', 'warn', 7000);
          return null;
        }
      } catch (e) {}

      if (showBanner) setCloudSyncBanner('⚠ 未能連線 Google Sheet，請檢查網絡後重試', 'warn', 5500);
      return null;
    }

    // 雲端與本地進度聯集（Union）合併：永不覆蓋離線已完成題目、取最高分、還原最新程式碼
    function mergeCloudProgress(cloud, opts = {}) {
      if (!cloud) return { mergedLevels: Object.keys(state.completed).length, mergedTb: 0 };
      const validLevelIds = new Set((typeof LEVELS !== 'undefined' ? LEVELS : []).map((l) => l.id));
      const validTbIds = new Set((typeof TEXTBOOK_EXAMPLES !== 'undefined' ? TEXTBOOK_EXAMPLES : []).map((t) => t.id));
      const cloudComp = cloud.completed || {};
      const mergedComp = {};
      const strayTb = {};
      [state.completed, cloudComp].forEach((src) => {
        Object.keys(src || {}).forEach((k) => {
          if (!src[k]) return;
          if (validLevelIds.has(k)) mergedComp[k] = true;
          else if (validTbIds.has(k)) strayTb[k] = true;
        });
      });
      state.completed = mergedComp;

      // 以 Google Sheet UserProgress 為準，直接反映真實分數與扣分（不額外重算抬高）
      state.xp = Math.max(Number(state.xp || 0), Number(cloud.xp || 0));
      state.penalty = Math.max(Number(state.penalty || 0), Number(cloud.penalty || 0));

      if (state.student) {
        if (!state.student.cls && cloud.cls) state.student.cls = cloud.cls;
        if (!state.student.no && cloud.no) state.student.no = cloud.no;
        if (!state.student.name && cloud.name) state.student.name = cloud.name;
      }

      let mergedTbCount = 0;
      if (typeof tbState !== 'undefined') {
        const cloudTb = cloud.tbDone || {};
        const mergedTb = { ...strayTb };
        [tbState.done || {}, cloudTb].forEach((src) => {
          Object.keys(src).forEach((k) => {
            if (src[k] && validTbIds.has(k)) mergedTb[k] = true;
          });
        });
        tbState.done = mergedTb;
        mergedTbCount = Object.keys(mergedTb).length;
      }

      if (typeof practiceState !== 'undefined' && typeof PRACTICE_BANK !== 'undefined') {
        const validPrIds = new Set(getVisiblePracticeBank().map((q) => q.id));
        const cloudPr = cloud.practiceDone || {};
        const mergedPr = {};
        [practiceState.done || {}, cloudPr].forEach((src) => {
          Object.keys(src).forEach((k) => {
            if (src[k] && validPrIds.has(k)) mergedPr[k] = true;
          });
        });
        practiceState.done = mergedPr;
        if (typeof renderPracticeList === 'function') renderPracticeList();
        if (typeof updatePracticeDoneBadge === 'function') updatePracticeDoneBadge();
      }

      // 只為「已過關」的題目載入上次通過的正確程式碼（未過關題目維持空白範本）
      const cloudPassedCodes = cloud.latestPassedCode || cloud.latestCode || {};
      if (!state.passedCode) state.passedCode = {};
      Object.keys(cloudPassedCodes).forEach((qid) => {
        const codeStr = cloudPassedCodes[qid];
        if (!codeStr) return;
        if (state.completed[qid] || (typeof tbState !== 'undefined' && tbState.done && tbState.done[qid])) {
          state.passedCode[qid] = codeStr;
        }
      });

      saveProgress();
      if (typeof renderProgressWidgets === 'function') renderProgressWidgets();
      if (typeof renderSidebars === 'function') renderSidebars();
      if (typeof renderHomeRoadmap === 'function') renderHomeRoadmap();
      if (typeof renderTextbookList === 'function') renderTextbookList();

      // 若當前打開的題目已過關且剛從雲端還原正確程式碼，立即顯示於編輯器
      const curLvl = (typeof LEVELS !== 'undefined') ? LEVELS[state.currentLevelIdx] : null;
      if (curLvl && curLvl.type === 'py' && state.completed[curLvl.id] && state.passedCode[curLvl.id]) {
        const ed = document.getElementById('pyInput');
        if (ed) {
          ed.value = state.passedCode[curLvl.id];
          if (typeof updateLineGutter === 'function') updateLineGutter(ed, document.getElementById('pyLineGutter'));
        }
      }
      if (typeof tbState !== 'undefined' && tbState.activeId && tbState.done[tbState.activeId] && state.passedCode[tbState.activeId]) {
        const tbEd = document.getElementById('tbCodeInput');
        if (tbEd) {
          tbEd.value = state.passedCode[tbState.activeId];
          if (typeof updateLineGutter === 'function') updateLineGutter(tbEd, document.getElementById('tbLineGutter'));
        }
      }

      const mergedLevels = Object.keys(state.completed).length;
      if (opts.showBanner) {
        if (cloud._found) {
          setCloudSyncBanner(`✓ 同步完成（計分 ${mergedLevels} 題 · 例題 ${mergedTbCount} 題）`, 'ok', 4500);
        } else {
          setCloudSyncBanner('✓ 同步完成', 'ok', 3500);
        }
      }
      return { mergedLevels, mergedTb: mergedTbCount };
    }

    function decodeJwtPayload(token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(jsonPayload);
      } catch (e) { return null; }
    }

    let pendingGoogleUser = null;

    function updateGmailModalUI(forceSignIn = false) {
      const signedBox = document.getElementById('gmailSignedInBox');
      const signInSec = document.getElementById('gmailSignInSection');
      const fallbackNote = document.getElementById('gmailFallbackNote');
      const user = pendingGoogleUser || (state.student && state.student.email ? state.student : null);

      if (!forceSignIn && user && user.email && user.verifiedGoogle) {
        signedBox.classList.remove('hidden');
        signInSec.classList.add('hidden');
        document.getElementById('gmailNameText').textContent = user.name || user.email;
        document.getElementById('gmailEmailText').textContent = user.email;
        const img = document.getElementById('gmailAvatarImg');
        if (user.picture) { img.src = user.picture; img.classList.remove('hidden'); }
        else img.classList.add('hidden');
      } else {
        signedBox.classList.add('hidden');
        signInSec.classList.remove('hidden');
        const cid = getGoogleClientId();
        const wrap = document.getElementById('googleBtnWrap');
        if (cid && typeof google !== 'undefined' && google.accounts && google.accounts.id) {
          fallbackNote.classList.add('hidden');
          wrap.innerHTML = '';
          google.accounts.id.initialize({
            client_id: cid,
            callback: handleGoogleCredentialResponse
          });
          google.accounts.id.renderButton(wrap, { theme: 'filled_blue', size: 'large', width: 320, text: 'signin_with', locale: 'zh_HK' });
        } else if (cid) {
          fallbackNote.classList.add('hidden');
          wrap.innerHTML = '<div class="text-xs text-[#9aa7b8] py-2 font-mono-code">正在載入 Google 帳戶登入按鈕...</div>';
          if (!window._gsiRetryTimer) {
            let tries = 0;
            window._gsiRetryTimer = setInterval(() => {
              tries++;
              if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
                clearInterval(window._gsiRetryTimer);
                window._gsiRetryTimer = null;
                updateGmailModalUI();
              } else if (tries >= 40) {
                clearInterval(window._gsiRetryTimer);
                window._gsiRetryTimer = null;
                wrap.innerHTML = '<div class="text-xs text-[#fda4af] py-2">無法載入 Google 登入服務，請檢查網絡或改用瀏覽器開啟 GitHub Pages 網址。</div>';
              }
            }, 200);
          }
        } else {
          wrap.innerHTML = '';
          fallbackNote.classList.remove('hidden');
          if (user && user.email) document.getElementById('loginEmailInput').value = user.email;
        }
      }
    }

    async function handleGoogleCredentialResponse(response) {
      const errEl = document.getElementById('loginErrorMsg');
      const stEl = document.getElementById('loginCloudStatus');
      errEl.classList.add('hidden');
      const info = decodeJwtPayload(response.credential);
      if (!info || !info.email) {
        errEl.textContent = 'Google 驗證失敗，請重試。';
        errEl.classList.remove('hidden');
        return;
      }
      const email = String(info.email).trim().toLowerCase();
      const dom = (getAllowedDomain() || 'frcss.edu.hk').trim().toLowerCase();
      const whitelistName = ALLOWED_STUDENT_WHITELIST[email] || '';
      if (dom && !email.endsWith('@' + dom) && !whitelistName) {
        errEl.textContent = `請使用學校帳戶（@${dom}）登入。`;
        errEl.classList.remove('hidden');
        return;
      }
      const isTeacherEmail = TEACHER_EMAILS.includes(email);
      try { sessionStorage.setItem('hkdse_py_id_token', response.credential || ''); } catch (e) {}
      pendingGoogleUser = {
        email,
        name: whitelistName || info.name || email.split('@')[0],
        picture: info.picture || '',
        verifiedGoogle: true,
        idToken: response.credential || '',
        teacherMode: isTeacherEmail
      };
      updateGmailModalUI();

      stEl.className = 'text-xs font-bold text-[#38bdf8]';
      stEl.textContent = '正在載入雲端進度...';
      stEl.classList.remove('hidden');
      const cloud = await loadCloudProgressByEmail(email);
      const cls = isTeacherEmail ? 'TEACHER' : ((cloud && cloud._found && cloud.cls) ? cloud.cls : '');
      const no = isTeacherEmail ? '00' : ((cloud && cloud._found && cloud.no) ? cloud.no : '');
      const displayName = whitelistName || info.name || ((cloud && cloud._found && cloud.name) ? cloud.name : email.split('@')[0]);

      const profile = {
        id: email,
        email,
        cls,
        no,
        name: displayName,
        picture: info.picture || '',
        verifiedGoogle: true,
        teacherMode: isTeacherEmail,
        idToken: response.credential || ''
      };
      loadProfile(profile);

      if (cloud) {
        mergeCloudProgress(cloud, { showBanner: true });
        if (typeof renderDseList === 'function') renderDseList();
        if (typeof loadLevel === 'function' && typeof LEVELS !== 'undefined' && LEVELS.length) loadLevel(state.currentLevelIdx);
      }
      try { localStorage.setItem(LAST_PROFILE_KEY, JSON.stringify(profile)); } catch (e) {}
      stEl.classList.add('hidden');
      document.getElementById('loginModal').classList.add('hidden');
      if (pendingCloudSyncQueue.length > 0) {
        await flushPendingCloudSyncs();
      }
      if (state.mode === 'profile' && typeof window.loadStudentProfile === 'function') {
        setTimeout(() => window.loadStudentProfile(true), 120);
      }
    }

    // Anti-AI Telemetry: Track Tab-Switch & Away Seconds (No fullscreen lock)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        state.hiddenAt = Date.now();
      } else if (state.hiddenAt) {
        const secs = Math.max(1, Math.round((Date.now() - state.hiddenAt) / 1000));
        state.hiddenAt = null;
        state.tabSwitches += 1;
        state.awaySeconds += secs;
        saveProgress();
        renderProgressWidgets();
      }
    });

    function purgeLegacyLocalProgress() {
      try {
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (k.startsWith('hkdse_py_class_v1_prof_') || k.startsWith('hkdse_py_class_draft_v1_') || k === TB_DONE_KEY) {
            toRemove.push(k);
          }
        }
        toRemove.forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
      } catch (e) {}
    }

    function saveProgress() {
      if (!state.student) return;
      // 進度一律強制儲存於 Google Sheet，不在本機 localStorage 寫入任何作答進度
      try {
        localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(state.student));
      } catch (e) {}
    }

    function loadProfile(stu) {
      purgeLegacyLocalProgress();
      state.student = stu;
      state.completed = {}; state.passedCode = {}; state.usedSolution = {}; state.attempts = {};
      state.xp = 0; state.penalty = 0; state.tabSwitches = 0; state.awaySeconds = 0; state.currentLevelIdx = 0; state.sprintBest = 0;
      if (typeof tbState !== 'undefined') tbState.done = {};
      if (typeof practiceState !== 'undefined') {
        practiceState.done = {};
        if (practiceState.attempts) practiceState.attempts = {};
      }
      state.practiceDone = {};
      if (typeof _memDrafts !== 'undefined') {
        Object.keys(_memDrafts).forEach((k) => { delete _memDrafts[k]; });
      }
      if (!isChapterUnlocked(LEVELS[state.currentLevelIdx].ch)) state.currentLevelIdx = 0;
      state.openChapters = { [LEVELS[state.currentLevelIdx].ch]: true };
      const rawHeaderName = stu.name || (stu.email ? stu.email.split('@')[0] : '已登入');
      const compactHeaderName = /^COT(.+老師)$/.test(rawHeaderName) ? rawHeaderName.replace(/^COT/, '') : rawHeaderName;
      document.getElementById('headerStudentLabel').textContent = compactHeaderName;
      document.getElementById('teacherModeTag').classList.toggle('hidden', !isTeacherUser());
      syncTeacherUI();
      renderProgressWidgets();
      renderSidebars();
      renderHomeRoadmap();
      loadLevel(state.currentLevelIdx);
    }

    function getChapterStats(ch) {
      const items = LEVELS.filter((l) => l.ch === ch);
      const done = items.filter((l) => state.completed[l.id]).length;
      return { total: items.length, done, cleared: done === items.length && items.length > 0 };
    }
    const TEACHER_EMAILS = ['cot@frcss.edu.hk'];
    const ALLOWED_STUDENT_WHITELIST = { 'co.zoee@gmail.com': '周同學' };
    function isTeacherUser() {
      return Boolean(
        state.student &&
        state.student.verifiedGoogle &&
        TEACHER_EMAILS.includes(String(state.student.email || '').trim().toLowerCase())
      );
    }
    function getTeacherIdToken() {
      if (state.student && state.student.idToken) return state.student.idToken;
      try { return sessionStorage.getItem('hkdse_py_id_token') || ''; } catch (e) { return ''; }
    }
    function syncTeacherUI() {
      const isT = isTeacherUser();
      const tw = document.getElementById('teacherToolsWrap');
      if (tw) { tw.classList.toggle('hidden', !isT); }
      const tm = document.getElementById('teacherToolsMenu');
      if (tm && !isT) tm.classList.add('hidden');
      const hb = document.getElementById('headerTeacherBadge');
      if (hb) { hb.classList.toggle('hidden', !isT); hb.classList.toggle('inline-flex', isT); }
      const swStu = document.getElementById('switchToStudentViewBtn');
      if (swStu) { swStu.classList.toggle('hidden', !isT); swStu.classList.toggle('inline-flex', isT); }
      const retT = document.getElementById('returnTeacherViewBtn');
      const isActingStu = Boolean(window._savedTeacherProfile && !isT);
      if (retT) { retT.classList.toggle('hidden', !isActingStu); retT.classList.toggle('inline-flex', isActingStu); }
      const hp = document.getElementById('headerPreviewLvUpBtn');
      if (hp) { hp.classList.toggle('hidden', !isT); hp.classList.toggle('inline-flex', isT); }
      ['teacherRevealPyBtn', 'teacherRevealDqBtn', 'teacherRevealDrBtn', 'teacherRevealTbBtn', 'teacherPreviewLvUpBtn', 'prTeacherSlPreviewBar'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !isT);
      });
      if (!isT) {
        const pyBox = document.getElementById('teacherPyAnsBox'); if (pyBox) pyBox.classList.add('hidden');
        const tbBox = document.getElementById('teacherTbAnsBox'); if (tbBox) tbBox.classList.add('hidden');
      }
    }
    async function fetchTeacherAnswer(kind, id) {
      const idToken = getTeacherIdToken();
      if (!idToken) {
        return { status: 'error', message: '請先按右上角重新以老師 Google 帳戶登入以驗證身分。' };
      }
      return await callCloudGrader({ action: 'teacher_answer', kind, id, idToken });
    }
    function isChapterUnlocked(ch) {
      if (ch <= 1) return true;
      if (isTeacherUser()) return true;
      return getChapterStats(ch - 1).cleared;
    }

    // Sound Synth
    let audioCtx = null;
    function playTone(freq, dur = 0.06, type = 'sine', vol = 0.04) {
      if (!state.soundOn) return;
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + dur);
      } catch (e) {}
    }
    function playSuccess() { playTone(523, 0.08, 'triangle', 0.07); setTimeout(() => playTone(659, 0.08, 'triangle', 0.07), 80); setTimeout(() => playTone(784, 0.14, 'triangle', 0.08), 160); }
    function playError() { playTone(180, 0.12, 'sawtooth', 0.05); setTimeout(() => playTone(140, 0.14, 'sawtooth', 0.05), 100); }
    const LEVEL_CARD_IMAGES = {"1": "./assets/img/level-card-01.webp", "2": "./assets/img/level-card-02.webp", "3": "./assets/img/level-card-03.webp", "4": "./assets/img/level-card-04.webp", "5": "./assets/img/level-card-05.webp", "6": "./assets/img/level-card-06.webp", "7": "./assets/img/level-card-07.webp", "8": "./assets/img/level-card-08.webp", "9": "./assets/img/level-card-09.webp", "10": "./assets/img/level-card-10.webp", "11": "./assets/img/level-card-11.webp", "12": "./assets/img/level-card-12.webp"};

    // === 3D Epic Level-Up Card Reveal Module v2 (12-Tier Cyber Holo Three.js Engine) ===
    const LEVEL_CARD_THEMES = [
      { lv: 1,  code: 'Lv.01', name: '賽博電藍',     hex: '#00b4ff', color: 0x00b4ff },
      { lv: 2,  code: 'Lv.02', name: '青綠護盾',     hex: '#00e5c0', color: 0x00e5c0 },
      { lv: 3,  code: 'Lv.03', name: '矩陣螢光綠',   hex: '#88e01f', color: 0x88e01f },
      { lv: 4,  code: 'Lv.04', name: '耀金軌道',     hex: '#f5b82e', color: 0xf5b82e },
      { lv: 5,  code: 'Lv.05', name: '熾橙數據塊',   hex: '#ff7315', color: 0xff7315 },
      { lv: 6,  code: 'Lv.06', name: '緋紅光刃',     hex: '#ff334b', color: 0xff334b },
      { lv: 7,  code: 'Lv.07', name: '紫紅星帶',     hex: '#d946ef', color: 0xd946ef },
      { lv: 8,  code: 'Lv.08', name: '電紫超立方',   hex: '#8b5cf6', color: 0x8b5cf6 },
      { lv: 9,  code: 'Lv.09', name: '幻紫星環',     hex: '#a855f7', color: 0xa855f7 },
      { lv: 10, code: 'Lv.10', name: '冰藍晶爆',     hex: '#38e8ff', color: 0x38e8ff },
      { lv: 11, code: 'Lv.11', name: '幻彩光柱',     hex: '#60a5fa', color: 0x60a5fa },
      { lv: 12, code: 'Lv.12', name: '傳說至尊全金', hex: '#ffd24d', color: 0xffd24d }
    ];

    function getLevelTheme(lvNum) {
      const idx = Math.max(1, Math.min(12, Number(lvNum) || 1)) - 1;
      return LEVEL_CARD_THEMES[idx];
    }

    function getClearedLessonCount() {
      let c = 0;
      for (let ch = 1; ch <= LESSONS.length; ch++) {
        if (getChapterStats(ch).cleared) c++;
      }
      return c;
    }

    (function initLevelUp3DModule() {
      let activeCleanup = null;

      const T_BUILD_END = 1.25;
      const T_FLIP_END  = 2.25;
      const T_BURST_END = 2.95;

      function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }
      function easeOutBack(t) {
        const c1 = 1.45, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
      }

      function makeRoundedShape(w, h, r) {
        const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
        s.moveTo(x + r, y);
        s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
        return s;
      }

      // Cyber Blue Circuit </> Python Card Back
      function createCyberCardBackTex() {
        const c = document.createElement('canvas');
        c.width = 768; c.height = 1152;
        const ctx = c.getContext('2d');
        const W = c.width, H = c.height;

        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#07142b');
        bg.addColorStop(0.5, '#0b2247');
        bg.addColorStop(1, '#040b18');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // Circuit traces
        ctx.strokeStyle = 'rgba(0, 180, 255, 0.28)';
        ctx.lineWidth = 4;
        for (let i = 0; i < 16; i++) {
          const y = 70 + i * 64;
          ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(150 + (i % 3) * 45, y); ctx.lineTo(185 + (i % 3) * 45, y + 26); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(W - 40, y); ctx.lineTo(W - 150 - (i % 3) * 45, y); ctx.lineTo(W - 185 - (i % 3) * 45, y - 26); ctx.stroke();
        }

        // Glowing metallic outer border
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 18;
        ctx.strokeRect(24, 24, W - 48, H - 48);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 4;
        ctx.strokeRect(48, 48, W - 96, H - 96);

        // Center glowing hexagonal emblem
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.shadowColor = '#00b4ff';
        ctx.shadowBlur = 32;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 10;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 - Math.PI / 6;
          const px = Math.cos(a) * 180, py = Math.sin(a) * 180;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(6, 20, 46, 0.85)';
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#7dd3fc';
        ctx.font = '700 108px "Space Grotesk", "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('</>', 0, 6);
        ctx.restore();

        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 4;
        return tex;
      }

      // Procedural Pedestal Stone + Glowing Concentric Circuit Runes
      function createPedestalTex() {
        const size = 1024;
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        const cx = size / 2, cy = size / 2;
        const bg = ctx.createRadialGradient(cx, cy, 40, cx, cy, size / 2);
        bg.addColorStop(0, '#1c2438');
        bg.addColorStop(0.6, '#0f1422');
        bg.addColorStop(1, '#06080f');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);

        [160, 250, 340, 425, 470].forEach((r, idx) => {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.strokeStyle = idx === 2 || idx === 4 ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.25)';
          ctx.lineWidth = idx === 2 ? 4 : 2;
          ctx.stroke();
        });
        ctx.save();
        ctx.translate(cx, cy);
        for (let i = 0; i < 24; i++) {
          ctx.save();
          ctx.rotate((i * Math.PI * 2) / 24);
          ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.22)';
          ctx.lineWidth = i % 3 === 0 ? 3 : 1.5;
          ctx.beginPath();
          ctx.moveTo(255, 0);
          ctx.lineTo(335, 0);
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 4;
        return tex;
      }

      function makeDotTex() {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
      }

      // Reusable Web Audio Context for 3D Level-Up SFX
      let sfxCtx = null;
      function getSfxCtx(audioOn) {
        if (!audioOn) return null;
        try {
          if (!sfxCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) sfxCtx = new AC();
          }
          if (sfxCtx && sfxCtx.state === 'suspended') sfxCtx.resume().catch(() => {});
          return sfxCtx;
        } catch (e) { return null; }
      }

      function playBuildSFX(lv, audioOn) {
        const ctx = getSfxCtx(audioOn); if (!ctx) return;
        try {
          const now = ctx.currentTime;
          const base = 90 + lv * 8;
          const osc = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(base, now);
          osc.frequency.exponentialRampToValueAtTime(base * 3.4, now + T_BUILD_END);
          f.type = 'lowpass';
          f.frequency.setValueAtTime(280, now);
          f.frequency.exponentialRampToValueAtTime(2200, now + T_BUILD_END);
          g.gain.setValueAtTime(0.001, now);
          g.gain.exponentialRampToValueAtTime(0.08, now + T_BUILD_END * 0.85);
          g.gain.exponentialRampToValueAtTime(0.001, now + T_BUILD_END + 0.14);
          osc.connect(f); f.connect(g); g.connect(ctx.destination);
          osc.start(now); osc.stop(now + T_BUILD_END + 0.18);
        } catch (e) {}
      }

      function playWhooshSFX(audioOn) {
        const ctx = getSfxCtx(audioOn); if (!ctx) return;
        try {
          const now = ctx.currentTime;
          const bufSize = Math.floor(ctx.sampleRate * 0.85);
          const nBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
          const data = nBuf.getChannelData(0);
          for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
          const src = ctx.createBufferSource();
          src.buffer = nBuf;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.Q.value = 2.2;
          bp.frequency.setValueAtTime(260, now);
          bp.frequency.exponentialRampToValueAtTime(1650, now + 0.42);
          bp.frequency.exponentialRampToValueAtTime(420, now + 0.85);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.001, now);
          g.gain.linearRampToValueAtTime(0.075, now + 0.32);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
          src.connect(bp); bp.connect(g); g.connect(ctx.destination);
          src.start(now); src.stop(now + 0.86);
        } catch (e) {}
      }

      function playBurstSFX(lv, audioOn) {
        const ctx = getSfxCtx(audioOn); if (!ctx) return;
        try {
          const now = ctx.currentTime;
          const boom = ctx.createOscillator(), bg = ctx.createGain();
          boom.type = 'sine';
          boom.frequency.setValueAtTime(138, now);
          boom.frequency.exponentialRampToValueAtTime(36, now + 0.5);
          bg.gain.setValueAtTime(0.24, now);
          bg.gain.exponentialRampToValueAtTime(0.001, now + 0.56);
          boom.connect(bg); bg.connect(ctx.destination);
          boom.start(now); boom.stop(now + 0.6);

          const shift = 1 + (lv - 1) * 0.035;
          const notes = lv === 12
            ? [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5, 1567.98]
            : [523.25, 659.25, 783.99, 1046.5, 1318.5];
          notes.forEach((f0, i) => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = i % 2 === 0 ? 'triangle' : 'sine';
            const t0 = now + i * 0.032;
            o.frequency.setValueAtTime(f0 * shift, t0);
            g.gain.setValueAtTime(0.001, t0);
            g.gain.linearRampToValueAtTime(0.068 / (1 + i * 0.14), t0 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0008, t0 + (lv === 12 ? 1.85 : 1.45));
            o.connect(g); g.connect(ctx.destination);
            o.start(t0); o.stop(t0 + (lv === 12 ? 1.9 : 1.5));
          });
        } catch (e) {}
      }

      window.showLevelUpCard = function showLevelUpCard(options = {}) {
        if (typeof THREE === 'undefined') {
          if (typeof options.onClose === 'function') options.onClose();
          return;
        }
        if (typeof activeCleanup === 'function') {
          activeCleanup(false);
        }

        const startLv = Math.max(1, Math.min(12, Number(options.lv) || 1));
        const durationMs = Number(options.durationMs) > 3500 ? Number(options.durationMs) : 7200;
        const onClose = typeof options.onClose === 'function' ? options.onClose : null;

        const st = {
          idx: startLv - 1,
          isPlaying: true,
          animTime: 0,
          burstTriggered: false,
          whooshPlayed: false,
          autoCloseTimer: null,
          audioOn: options.enableAudio !== false,
          pointerX: 0,
          pointerY: 0,
          smoothX: 0,
          smoothY: 0,
          pointerActive: false,
          disposed: false
        };

        // Pure 3D Stage Only (Zero text overlays or buttons)
        const overlay = document.createElement('div');
        overlay.className = 'lvlup-3d-overlay';
        const host = document.createElement('div');
        host.className = 'lvlup-3d-canvas-host';
        const flashEl = document.createElement('div');
        flashEl.className = 'lvlup-3d-flash';
        overlay.appendChild(host);
        overlay.appendChild(flashEl);
        document.body.appendChild(overlay);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.08;
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x05070e, 0.04);

        const camera = new THREE.PerspectiveCamera(38, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 100);
        camera.position.set(0, 1.05, 8.8);

        scene.add(new THREE.AmbientLight(0x64748b, 0.95));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.55); keyLight.position.set(4.5, 6.5, 6.5); scene.add(keyLight);
        const rimLight = new THREE.DirectionalLight(0x818cf8, 0.9); rimLight.position.set(-5.5, 3, -4.5); scene.add(rimLight);
        const themeLight = new THREE.PointLight(0x00b4ff, 2.2, 16, 1.6); themeLight.position.set(0, 0.3, 1.8); scene.add(themeLight);
        const pedLight = new THREE.PointLight(0x00b4ff, 2.0, 12, 1.8); pedLight.position.set(0, -1.7, 0.4); scene.add(pedLight);

        const disposables = { geos: [], mats: [], texs: [] };
        const texLoader = new THREE.TextureLoader();
        texLoader.setCrossOrigin('anonymous');
        const keyStr = String(st.idx + 1);
        const cardSrc = (typeof LEVEL_CARD_IMAGES !== 'undefined' && (LEVEL_CARD_IMAGES[keyStr] || LEVEL_CARD_IMAGES['1'])) || options.frontImageUrl || '';
        const cardTex = texLoader.load(cardSrc);
        cardTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        disposables.texs.push(cardTex);

        const item = LEVEL_CARD_THEMES[st.idx];
        const themeCol = new THREE.Color(item.color);

        // Pedestal
        const pedestalGroup = new THREE.Group();
        pedestalGroup.position.set(0, -2.62, 0);
        scene.add(pedestalGroup);

        const pedTex = createPedestalTex();
        disposables.texs.push(pedTex);
        const pedTopMat = new THREE.MeshStandardMaterial({
          map: pedTex, emissiveMap: pedTex, emissive: themeCol.clone(), emissiveIntensity: 0.45, roughness: 0.65, metalness: 0.3
        });
        const pedSideMat = new THREE.MeshStandardMaterial({ color: 0x0e1220, roughness: 0.8, metalness: 0.25 });
        const pedGeo = new THREE.CylinderGeometry(3.85, 4.25, 0.55, 64);
        const pedMesh = new THREE.Mesh(pedGeo, [pedSideMat, pedTopMat, pedSideMat]);
        pedestalGroup.add(pedMesh);

        const pedRimGeo = new THREE.TorusGeometry(3.85, 0.032, 16, 96);
        const pedRimMat = new THREE.MeshStandardMaterial({ color: themeCol.clone(), emissive: themeCol.clone(), emissiveIntensity: 0.7, metalness: 0.9, roughness: 0.2 });
        const pedRim = new THREE.Mesh(pedRimGeo, pedRimMat);
        pedRim.rotation.x = Math.PI / 2;
        pedRim.position.y = 0.27;
        pedestalGroup.add(pedRim);
        disposables.geos.push(pedGeo, pedRimGeo);
        disposables.mats.push(pedTopMat, pedSideMat, pedRimMat);

        // Dual-Ring Shockwave Shader
        const shockUniforms = {
          uProgress: { value: 0.0 },
          uOpacity: { value: 0.0 },
          uColor: { value: themeCol.clone() }
        };
        const shockGeo = new THREE.PlaneGeometry(9.6, 9.6);
        const shockMat = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          uniforms: shockUniforms,
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `
            uniform float uProgress, uOpacity; uniform vec3 uColor; varying vec2 vUv;
            void main(){
              vec2 p = vUv * 2.0 - 1.0; float dist = length(p);
              float r = mix(0.05, 0.98, uProgress); float w = mix(0.11, 0.04, uProgress);
              float ring = smoothstep(r - w, r, dist) * (1.0 - smoothstep(r, r + w * 1.4, dist));
              float r2 = max(0.0, r - 0.14);
              float ring2 = smoothstep(r2 - 0.035, r2, dist) * (1.0 - smoothstep(r2, r2 + 0.05, dist)) * 0.45;
              float a = (ring + ring2) * uOpacity * (1.0 - smoothstep(0.82, 1.0, dist));
              gl_FragColor = vec4(mix(uColor, vec3(1.0), ring * 0.7), a);
            }`
        });
        const shockPlane = new THREE.Mesh(shockGeo, shockMat);
        shockPlane.rotation.x = -Math.PI / 2;
        shockPlane.position.y = 0.295;
        pedestalGroup.add(shockPlane);
        disposables.geos.push(shockGeo);
        disposables.mats.push(shockMat);

        // 3D Rounded Beveled Card
        const cardRoot = new THREE.Group();
        cardRoot.position.set(0, 0.08, 0);
        cardRoot.rotation.set(0.06, Math.PI, 0);
        cardRoot.scale.set(0.94, 0.94, 0.94);
        scene.add(cardRoot);

        const CARD_W = 2.52, CARD_H = 3.78, CARD_D = 0.08, CARD_R = 0.14;
        const cShape = makeRoundedShape(CARD_W, CARD_H, CARD_R);
        const extrudeGeo = new THREE.ExtrudeGeometry(cShape, {
          depth: CARD_D, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: 0.022, bevelThickness: 0.022
        });
        extrudeGeo.center();
        const cardEdgeMat = new THREE.MeshStandardMaterial({
          color: themeCol.clone(), emissive: themeCol.clone().multiplyScalar(0.5), emissiveIntensity: 0.45, metalness: 0.9, roughness: 0.2
        });
        cardRoot.add(new THREE.Mesh(extrudeGeo, cardEdgeMat));

        const faceGeo = new THREE.ShapeGeometry(cShape, 24);
        const fPos = faceGeo.attributes.position, fUv = faceGeo.attributes.uv;
        for (let i = 0; i < fPos.count; i++) {
          fUv.setXY(i, (fPos.getX(i) + CARD_W / 2) / CARD_W, (fPos.getY(i) + CARD_H / 2) / CARD_H);
        }
        fUv.needsUpdate = true;

        const foilUniforms = {
          uMap: { value: cardTex },
          uTime: { value: 0 },
          uTilt: { value: new THREE.Vector2(0, 0) },
          uFoil: { value: 0 },
          uFlash: { value: 0 }
        };
        const frontMat = new THREE.ShaderMaterial({
          uniforms: foilUniforms,
          vertexShader: `varying vec2 vUv; varying vec3 vNormal, vViewDir;
            void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vNormal=normalize(normalMatrix*normal); vViewDir=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
          fragmentShader: `
            uniform sampler2D uMap; uniform float uTime, uFoil, uFlash; uniform vec2 uTilt;
            varying vec2 vUv; varying vec3 vNormal, vViewDir;
            vec3 rainbow(float t){ return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
            void main(){
              vec3 base = texture2D(uMap, vUv).rgb;
              vec3 lDir = normalize(vec3(0.45 + uTilt.x * 0.9, 0.65 - uTilt.y * 0.9, 1.0));
              float spec = pow(max(dot(vNormal, normalize(lDir + vViewDir)), 0.0), 26.0);
              float diag = vUv.x * 0.85 + vUv.y * 0.55;
              float sweep = diag + uTilt.x * 0.68 - uTilt.y * 0.42 + sin(uTime * 0.95) * 0.28;
              float band = exp(-pow((fract(sweep * 0.65) - 0.5) * 4.4, 2.0));
              vec3 irid = rainbow(diag * 1.4 + uTilt.x * 1.2 + uTilt.y * 0.8 + uTime * 0.24);
              vec3 col = base + vec3(1.0) * spec * 0.2 + (irid * band * 0.46 + vec3(1.0) * band * 0.28) * uFoil;
              col = mix(col, vec3(1.0), uFlash * 0.82);
              gl_FragColor = vec4(col, 1.0);
            }`
        });
        const frontMesh = new THREE.Mesh(faceGeo, frontMat);
        frontMesh.position.z = CARD_D / 2 + 0.0235;
        cardRoot.add(frontMesh);

        const backTex = createCyberCardBackTex();
        disposables.texs.push(backTex);
        const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.32, metalness: 0.45 });
        const backMesh = new THREE.Mesh(faceGeo, backMat);
        backMesh.rotation.y = Math.PI;
        backMesh.position.z = -(CARD_D / 2 + 0.0235);
        cardRoot.add(backMesh);
        disposables.geos.push(extrudeGeo, faceGeo);
        disposables.mats.push(cardEdgeMat, frontMat, backMat);

        // Seamless Feathered Aura
        const auraUniforms = {
          uTime: { value: 0 },
          uIntensity: { value: 0 },
          uBurst: { value: 0 },
          uColor: { value: themeCol.clone() }
        };
        const auraGeo = new THREE.PlaneGeometry(CARD_W * 2.8, CARD_H * 2.25);
        const auraMat = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          uniforms: auraUniforms,
          vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
          fragmentShader: `
            uniform float uTime, uIntensity, uBurst; uniform vec3 uColor; varying vec2 vUv;
            void main(){
              vec2 p = vUv * 2.0 - 1.0;
              vec2 d = abs(p) - vec2(0.42, 0.52);
              float sdf = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
              float glow = exp(-max(sdf, 0.0) * 6.2);
              float ang = atan(p.y, p.x);
              float rays = 0.72 + 0.28 * sin(ang * 14.0 + uTime * 3.8) * cos(ang * 7.0 - uTime * 2.1);
              float burst = exp(-length(p) * 2.3) * (0.65 + 0.35 * sin(ang * 18.0 - uTime * 5.0));
              float fade = smoothstep(1.0, 0.62, max(abs(p.x), abs(p.y)));
              vec3 col = mix(uColor, vec3(1.0), clamp(glow * 0.75, 0.0, 1.0));
              gl_FragColor = vec4(col, clamp((glow * rays * uIntensity + burst * uBurst * 1.35) * fade, 0.0, 1.0));
            }`
        });
        const auraPlane = new THREE.Mesh(auraGeo, auraMat);
        auraPlane.position.z = -0.15;
        cardRoot.add(auraPlane);
        disposables.geos.push(auraGeo);
        disposables.mats.push(auraMat);

        themeLight.color.copy(themeCol);
        pedLight.color.copy(themeCol);
        flashEl.style.background = `radial-gradient(circle at 50% 46%, rgba(255,255,255,0.95) 0%, ${item.hex}99 36%, transparent 72%)`;

        // Ambient Particles + Burst Sparks
        const dotTex = makeDotTex();
        disposables.texs.push(dotTex);

        const AMB_N = 170;
        const ambPos = new Float32Array(AMB_N * 3), ambVel = new Float32Array(AMB_N * 3);
        for (let i = 0; i < AMB_N; i++) {
          ambPos[i * 3] = (Math.random() - 0.5) * 12;
          ambPos[i * 3 + 1] = (Math.random() - 0.5) * 8;
          ambPos[i * 3 + 2] = (Math.random() - 0.5) * 8 - 1;
          ambVel[i * 3] = (Math.random() - 0.5) * 0.14;
          ambVel[i * 3 + 1] = 0.2 + Math.random() * 0.35;
          ambVel[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
        }
        const ambGeo = new THREE.BufferGeometry();
        ambGeo.setAttribute('position', new THREE.BufferAttribute(ambPos, 3));
        const ambMat = new THREE.PointsMaterial({
          size: 0.14, map: dotTex, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, color: themeCol.clone()
        });
        scene.add(new THREE.Points(ambGeo, ambMat));
        disposables.geos.push(ambGeo);
        disposables.mats.push(ambMat);

        const SPK_N = 140;
        const spkPos = new Float32Array(SPK_N * 3), spkVel = new Float32Array(SPK_N * 3);
        let spkLife = 0;
        const spkGeo = new THREE.BufferGeometry();
        spkGeo.setAttribute('position', new THREE.BufferAttribute(spkPos, 3));
        const spkMat = new THREE.PointsMaterial({
          size: 0.22, map: dotTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
          color: themeCol.clone().lerp(new THREE.Color(0xffffff), 0.5)
        });
        scene.add(new THREE.Points(spkGeo, spkMat));
        disposables.geos.push(spkGeo);
        disposables.mats.push(spkMat);

        function fireSparks() {
          spkLife = 1.0;
          for (let i = 0; i < SPK_N; i++) {
            spkPos[i * 3] = (Math.random() - 0.5) * 0.5;
            spkPos[i * 3 + 1] = 0.25 + (Math.random() - 0.5) * 0.7;
            spkPos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(2 * Math.random() - 1);
            const sp = 2.6 + Math.random() * 5.2;
            spkVel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
            spkVel[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * sp * 0.85 + 1.05;
            spkVel[i * 3 + 2] = Math.cos(ph) * sp * 0.7;
          }
          spkGeo.attributes.position.needsUpdate = true;
        }

        // Tilt + Click anywhere (after reveal) or press ESC to dismiss
        let pointerDownPos = null;
        const onPointerMove = (e) => {
          const cx = e.touches ? e.touches[0].clientX : e.clientX;
          const cy = e.touches ? e.touches[0].clientY : e.clientY;
          st.pointerX = Math.max(-1, Math.min(1, (cx / Math.max(1, window.innerWidth)) * 2 - 1));
          st.pointerY = Math.max(-1, Math.min(1, (cy / Math.max(1, window.innerHeight)) * 2 - 1));
          st.pointerActive = true;
        };
        const onPointerLeave = () => { st.pointerActive = false; };
        const onHostDown = (e) => { pointerDownPos = { x: e.clientX, y: e.clientY }; };
        const onHostUp = (e) => {
          if (!pointerDownPos || st.animTime < T_BURST_END) return;
          if (Math.abs(e.clientX - pointerDownPos.x) < 10 && Math.abs(e.clientY - pointerDownPos.y) < 10) {
            fadeAndClose(true);
          }
        };
        const onKeyDown = (e) => { if (e.key === 'Escape') fadeAndClose(true); };

        host.addEventListener('pointermove', onPointerMove, { passive: true });
        host.addEventListener('touchmove', onPointerMove, { passive: true });
        host.addEventListener('pointerleave', onPointerLeave);
        host.addEventListener('pointerdown', onHostDown);
        host.addEventListener('pointerup', onHostUp);
        window.addEventListener('keydown', onKeyDown);

        const handleResize = () => {
          const w = window.innerWidth, h = Math.max(1, window.innerHeight);
          camera.aspect = w / h;
          const pf = w < h ? Math.min(1.38, (h / w) * 0.72) : 1.0;
          camera.fov = 38 * pf;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener('resize', handleResize);
        handleResize();

        let rafId = null;
        let closing = false;
        function fadeAndClose(invokeCb) {
          if (closing || st.disposed) return;
          closing = true;
          overlay.classList.add('lvlup-3d-fadeout');
          setTimeout(() => cleanup(invokeCb), 440);
        }

        function cleanup(invokeCb = true) {
          if (st.disposed) return;
          st.disposed = true;
          if (rafId) cancelAnimationFrame(rafId);
          clearTimeout(st.autoCloseTimer);
          host.removeEventListener('pointermove', onPointerMove);
          host.removeEventListener('touchmove', onPointerMove);
          host.removeEventListener('pointerleave', onPointerLeave);
          host.removeEventListener('pointerdown', onHostDown);
          host.removeEventListener('pointerup', onHostUp);
          window.removeEventListener('keydown', onKeyDown);
          window.removeEventListener('resize', handleResize);
          disposables.geos.forEach((g) => { try { g.dispose(); } catch (e) {} });
          disposables.mats.forEach((m) => { try { m.dispose(); } catch (e) {} });
          disposables.texs.forEach((t) => { try { t.dispose(); } catch (e) {} });
          try { renderer.dispose(); } catch (e) {}
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (activeCleanup === cleanup) activeCleanup = null;
          if (invokeCb && onClose) onClose();
        }
        activeCleanup = cleanup;

        playBuildSFX(item.lv, st.audioOn);
        st.autoCloseTimer = setTimeout(() => fadeAndClose(true), durationMs);

        const clock = new THREE.Clock();
        function animate() {
          if (st.disposed) return;
          rafId = requestAnimationFrame(animate);
          const dt = Math.min(clock.getDelta(), 0.05);
          const elapsed = clock.getElapsedTime();
          foilUniforms.uTime.value = elapsed;
          auraUniforms.uTime.value = elapsed;
          pedMesh.rotation.y = elapsed * 0.09;

          const ap = ambGeo.attributes.position.array;
          const boost = st.isPlaying && st.animTime < T_FLIP_END ? 2.5 : 1.0;
          for (let i = 0; i < AMB_N; i++) {
            ap[i * 3] += ambVel[i * 3] * dt * boost;
            ap[i * 3 + 1] += ambVel[i * 3 + 1] * dt * boost;
            ap[i * 3 + 2] += ambVel[i * 3 + 2] * dt * boost;
            if (ap[i * 3 + 1] > 4.2) {
              ap[i * 3 + 1] = -3.4;
              ap[i * 3] = (Math.random() - 0.5) * 11;
            }
          }
          ambGeo.attributes.position.needsUpdate = true;

          if (spkLife > 0) {
            spkLife = Math.max(0, spkLife - dt * 0.92);
            const sp = spkGeo.attributes.position.array;
            for (let i = 0; i < SPK_N; i++) {
              sp[i * 3] += spkVel[i * 3] * dt;
              sp[i * 3 + 1] += spkVel[i * 3 + 1] * dt;
              sp[i * 3 + 2] += spkVel[i * 3 + 2] * dt;
              spkVel[i * 3 + 1] -= 4.2 * dt;
            }
            spkGeo.attributes.position.needsUpdate = true;
            spkMat.opacity = Math.pow(spkLife, 1.3);
          }

          if (st.isPlaying) {
            st.animTime += dt;
            const t = st.animTime;
            const isLv12 = st.idx === 11;

            if (t < T_BUILD_END) {
              const p = t / T_BUILD_END, e = p * p;
              auraUniforms.uIntensity.value = e * (isLv12 ? 1.85 : 1.45);
              themeLight.intensity = 1.6 + e * 3.8;
              pedTopMat.emissiveIntensity = 0.4 + e * 1.1;
              const sh = e * 0.042;
              cardRoot.position.x = (Math.random() - 0.5) * sh;
              cardRoot.position.y = 0.08 + e * 0.22 + (Math.random() - 0.5) * sh;
              cardRoot.rotation.y = Math.PI + Math.sin(t * 16) * 0.025 * e;
              cardRoot.scale.setScalar(0.94 + e * 0.06);
              camera.position.set(0, 1.05, 8.8 - e * 0.6);
            } else if (t < T_FLIP_END) {
              if (!st.whooshPlayed) {
                st.whooshPlayed = true;
                playWhooshSFX(st.audioOn);
              }
              const p = (t - T_BUILD_END) / (T_FLIP_END - T_BUILD_END);
              const e = easeInOutCubic(p);
              cardRoot.rotation.y = Math.PI * (1 - e);
              cardRoot.rotation.x = Math.sin(p * Math.PI) * -0.18;
              cardRoot.rotation.z = Math.sin(p * Math.PI) * 0.06;
              cardRoot.position.set(0, 0.3 + Math.sin(p * Math.PI) * 0.34, 0);
              cardRoot.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.08);
              auraUniforms.uIntensity.value = 1.45 + Math.sin(p * Math.PI) * 0.55;
              camera.position.set(0, 1.05, 8.2 + e * 0.2);
            } else if (t < T_BURST_END) {
              if (!st.burstTriggered) {
                st.burstTriggered = true;
                fireSparks();
                playBurstSFX(item.lv, st.audioOn);
              }
              const p = (t - T_FLIP_END) / (T_BURST_END - T_FLIP_END);
              const fd = Math.exp(-p * 5.2);
              flashEl.style.opacity = String((fd * (isLv12 ? 0.95 : 0.78)).toFixed(3));
              foilUniforms.uFlash.value = fd;
              auraUniforms.uBurst.value = Math.exp(-p * 3.4) * (isLv12 ? 1.35 : 1.0);
              auraUniforms.uIntensity.value = 1.3 * (1 - p * 0.65);
              shockUniforms.uProgress.value = 1 - Math.pow(1 - p, 2.2);
              shockUniforms.uOpacity.value = Math.sin(Math.min(1, p * 1.15) * Math.PI) * 1.35;
              const pop = easeOutBack(Math.min(1, p * 1.6));
              cardRoot.scale.setScalar(1 + (pop - 1) * 0.14 + fd * 0.06);
              cardRoot.rotation.set(0, 0, 0);
              const punch = fd * 0.14;
              camera.position.set(
                (Math.random() - 0.5) * punch,
                1.05 + (Math.random() - 0.5) * punch,
                8.4 + fd * 0.3
              );
              foilUniforms.uFoil.value = p;
            } else {
              st.isPlaying = false;
              flashEl.style.opacity = '0';
              shockUniforms.uOpacity.value = 0;
              foilUniforms.uFlash.value = 0;
              foilUniforms.uFoil.value = 1.0;
              auraUniforms.uBurst.value = 0;
              auraUniforms.uIntensity.value = 0.42;
              pedTopMat.emissiveIntensity = 0.55;
              themeLight.intensity = 2.0;
              camera.position.set(0, 1.05, 8.4);
              cardRoot.scale.setScalar(1);
            }
          } else {
            const tx = st.pointerActive ? st.pointerX * 0.42 : Math.sin(elapsed * 1.2) * 0.24;
            const ty = st.pointerActive ? st.pointerY * 0.28 : Math.cos(elapsed * 0.85) * 0.12;
            st.smoothX += (tx - st.smoothX) * Math.min(1, dt * 7.5);
            st.smoothY += (ty - st.smoothY) * Math.min(1, dt * 7.5);
            cardRoot.rotation.set(st.smoothY, st.smoothX, -st.smoothX * 0.07);
            cardRoot.position.y = 0.24 + Math.sin(elapsed * 1.7) * 0.08;
            foilUniforms.uTilt.value.set(st.smoothX, st.smoothY);
            auraUniforms.uIntensity.value = 0.38 + Math.sin(elapsed * 2.2) * 0.08;
          }

          camera.lookAt(0, 0.12, 0);
          renderer.render(scene, camera);
        }

        animate();
      };
    })();

    function styleLevelBadges(clearedLv) {
      const theme = clearedLv > 0 ? getLevelTheme(clearedLv) : null;
      ['levelBadge', 'questLvBadge', 'mobLevelBadge'].forEach((id) => {
        const b = document.getElementById(id);
        if (!b) return;
        b.classList.add('lvlup-badge-clickable');
        const _lvTip = isTeacherUser()
          ? '點擊預覽全部 Lv.01–Lv.12 3D 等級卡牌'
          : (clearedLv > 0 ? `點擊欣賞已解鎖 3D 卡牌（LV.1–LV.${Math.min(12, clearedLv)}）` : '完成第 1 課全部 6 題即可解鎖首張 3D 等級卡牌');
        b.removeAttribute('title');
        b.setAttribute('data-tooltip', _lvTip);
        if (theme) {
          b.style.color = theme.hex;
          b.style.borderColor = `${theme.hex}66`;
          b.style.backgroundColor = `${theme.hex}1a`;
          b.style.boxShadow = `0 0 10px ${theme.hex}2e`;
          b.style.setProperty('--lv-pulse-col', `${theme.hex}aa`);
        }
      });
    }

    window.openLevelCardGallery = function openLevelCardGallery(preferredLv) {
      const isT = isTeacherUser();
      const cleared = getClearedLessonCount();
      const maxUnlocked = isT ? 12 : Math.max(1, Math.min(12, cleared));
      const startLv = preferredLv
        ? Math.max(1, Math.min(maxUnlocked, Number(preferredLv)))
        : (isT ? Math.max(1, Math.min(12, (LEVELS[state.currentLevelIdx]?.ch || 1))) : maxUnlocked);
      const sub = isT
        ? '老師預覽模式 · 可自由切換及連播 Lv.01 – Lv.12 全部 3D 卡牌'
        : (cleared > 0
          ? `已解鎖 ${Math.min(12, cleared)} / 12 張 3D 等級卡牌 · 拖動或移動滑鼠可欣賞全息光澤`
          : '完成第 1 課全部 6 題即可正式解鎖 Lv.01 賽博電藍卡牌！');
      window.showLevelUpCard({
        lv: startLv,
        isPreview: true,
        maxUnlockedLv: maxUnlocked,
        subtitle: sub,
        enableAudio: Boolean(state.soundOn),
        onClose: () => {}
      });
    };

    function triggerLessonLevelUp(lessonCh, clearedLesson, nextLesson, isPreview = false) {
      const lvIdx = Math.max(1, Math.min(12, Number(lessonCh) || 1));
      const theme = getLevelTheme(lvIdx);
      ['levelBadge', 'questLvBadge', 'mobLevelBadge'].forEach((id) => {
        const b = document.getElementById(id);
        if (b) {
          b.style.setProperty('--lv-pulse-col', `${theme.hex}aa`);
          b.classList.remove('lv-pulse-once');
          void b.offsetWidth;
          b.classList.add('lv-pulse-once');
        }
      });
      if (isPreview) {
        window.openLevelCardGallery(lvIdx);
        return;
      }
      const sub = nextLesson
        ? `已完成 ${clearedLesson ? clearedLesson.lcode : '本課'} 全部計分練習 · 正式解鎖 ${nextLesson.lcode}！`
        : `恭喜完成 ${clearedLesson ? clearedLesson.lcode : '本課'} 全部計分練習！`;
      window.showLevelUpCard({
        lv: lvIdx,
        isPreview: false,
        subtitle: sub,
        durationMs: 8600,
        enableAudio: Boolean(state.soundOn),
        onClose: () => {}
      });
    }


    function computeTbExpected(id, stdinStr, fallbackExp) {
      const rawLines = String(stdinStr || '').replace(/\r\n/g, '\n').split('\n');
      const lines = rawLines.slice();
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      const num = (i, d = 0) => { const v = Number(lines[i]); return Number.isFinite(v) ? v : d; };
      const str = (i, d = '') => (lines[i] !== undefined ? String(lines[i]) : d);
      const pyRound = (n, d = 0) => {
        const f = Math.pow(10, d);
        return Math.round((n + Number.EPSILON) * f) / f;
      };
      const fmt1 = (n) => Number.isInteger(n) ? (n + '.0') : String(n);
      try {
        switch (id) {
          case 'D1-01': { const a = parseInt(num(0), 10), b = parseInt(num(1), 10); return `交換前: ${a} ${b}\n交換後: ${b} ${a}`; }
          case 'D1-02': { const s = parseInt(num(0), 10); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return `${h} 小時 ${m} 分 ${r} 秒`; }
          case 'D1-03': { const w = num(0), h = num(1); if (!h) return '（身高不可為 0）'; return `BMI = ${pyRound(w / (h * h), 2)}`; }
          case 'D1-04': { const n = parseInt(num(0), 10); return n % 2 === 0 ? `${n} 是偶數` : `${n} 是奇數`; }
          case 'D1-05': { const s = parseInt(num(0), 10); const g = s >= 80 ? 'A' : (s >= 65 ? 'B' : (s >= 50 ? 'C' : 'F')); return `等級: ${g}`; }
          case 'D1-06': { const y = parseInt(num(0), 10); const leap = (y % 400 === 0) || (y % 4 === 0 && y % 100 !== 0); return leap ? `${y} 是閏年` : `${y} 是平年`; }
          case 'D1-07': { const n = parseInt(num(0), 10); let tot = 0, fac = 1; for (let i = 1; i <= n; i++) { tot += i; fac *= i; } return `總和: ${tot} 階乘: ${fac}`; }
          case 'D1-08': {
            const out = [];
            for (let i = 0; i < lines.length; i++) {
              const v = parseInt(lines[i], 10);
              if (Number.isNaN(v)) continue;
              if (v < 0 || v > 100) out.push('輸入無效，請重試');
              else { out.push(`已接納分數: ${v}`); break; }
            }
            return out.join('\n');
          }
          case 'D1-09': {
            let tot = 0, cnt = 0;
            for (const ln of lines) {
              const v = parseInt(ln, 10);
              if (v === -1) break;
              if (!Number.isNaN(v)) { tot += v; cnt++; }
            }
            return cnt ? `平均分: ${pyRound(tot / cnt, 2)}` : '無輸入';
          }
          case 'D2-05': {
            const arr = [65, 72, 79, 85, 91];
            const idx = arr.indexOf(parseInt(num(0), 10));
            return idx !== -1 ? `找到於索引: ${idx}` : '找不到';
          }
          case 'D2-09': {
            const s = str(0).trim();
            const rev = s.split('').reverse().join('');
            return s === rev ? `${s} 是迴文` : `${s} 不是迴文`;
          }
          case 'XC-01': {
            const a = Math.abs(parseInt(num(0), 10)), b = Math.abs(parseInt(num(1), 10));
            if (!a || !b) return fallbackExp;
            const gcd = (x, y) => y ? gcd(y, x % y) : x;
            const hcf = gcd(a, b);
            return `LCM: ${(a * b) / hcf} HCF: ${hcf}`;
          }
          case 'XC-02': {
            let d = parseInt(num(0), 10);
            if (d < 0 || d > 15) return '溢出錯誤';
            const b = [0, 0, 0, 0];
            for (let i = 3; i >= 0; i--) { b[i] = d % 2; d = Math.floor(d / 2); }
            return `4 位元二進制: [${b.join(', ')}]`;
          }
          case 'XC-03': {
            const n = Math.min(20, Math.max(1, parseInt(num(0), 10)));
            return Array.from({ length: n }, (_, i) => '*'.repeat(i + 1)).join('\n');
          }
          case 'XC-07': {
            const z = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬'];
            const y = parseInt(num(0), 10);
            return `${y} 年屬: ${z[((y - 4) % 12 + 12) % 12]}`;
          }
          case 'XC-13': {
            const arr = [50, 51, 64, 65, 75, 79, 80, 85, 88, 97];
            const t = parseInt(num(0), 10);
            let s = 0, e = arr.length - 1, steps = 0, found = false;
            while (s <= e && !found) {
              const m = Math.floor((s + e) / 2); steps++;
              if (arr[m] === t) found = true;
              else if (t < arr[m]) e = m - 1;
              else s = m + 1;
            }
            return `找到: ${found ? 'True' : 'False'} 總比較步數: ${steps}`;
          }
          case 'CP-4.2a': {
            const d = num(0), h = num(1), pi = 3.14, r = d / 2;
            const vol = Math.round(pi * r * r * h * 100000) / 100000;
            const area = Math.round((2 * pi * r * h + 2 * pi * r * r) * 100000) / 100000;
            return `The volume of the cylinder is: ${vol}\nThe surface area of the cylinder is: ${area}`;
          }
          case 'CP-4.2b': {
            const name = str(0), t1 = num(1), t2 = num(2), ex = num(3);
            const res = Math.round((t1 * 0.2 + t2 * 0.3 + ex * 0.5) * 1000) / 1000;
            return `${name}, your overall result of ICT is: ${fmt1(res)}`;
          }
          case 'CP-4.2c': {
            const h = num(0), w = num(1);
            if (!h) return fallbackExp;
            return `This is a BMI Calculator!\nYour BMI is ${w / (h * h)}`;
          }
          case 'CP-4.2d': {
            const s = parseInt(num(0), 10);
            return `Your record is ${Math.floor(s / 60)} minute(s) and ${s % 60} second(s).`;
          }
          case 'CP-4.3': {
            const a = num(0), b = num(1);
            const c = Math.sqrt(a * a + b * b);
            return `The length of hypotenuse side is ${fmt1(c)}`;
          }
          case 'CP-4.5': return fallbackExp; // random seed dependent
          case 'CP-4.6a': {
            const b = num(0);
            return b < 18.5 ? 'Underweight' : (b <= 22.9 ? 'Normal weight' : (b <= 24.9 ? 'Overweight' : 'Obesity'));
          }
          case 'CP-4.6b': {
            const n = parseInt(num(0), 10);
            const g = ((n % 4) + 4) % 4;
            const color = g === 1 ? 'RED' : (g === 2 ? 'ORANGE' : (g === 3 ? 'GREEN' : 'BLUE'));
            return `You are in group ${color}`;
          }
          case 'CP-4.7a': {
            const n = parseInt(num(0), 10);
            return '*'.repeat(Math.max(0, Math.floor(n / 10)));
          }
          case 'CP-4.7b': {
            const n = parseInt(num(0), 10), m = parseInt(num(1), 10);
            const arr = []; for (let i = 1; i <= n; i++) arr.push(i * m);
            return `The result is: ${arr.join(' ')}`;
          }
          case 'CP-4.7c': {
            const n = parseInt(num(0), 10);
            let s = 0, p = 1; for (let i = 1; i <= n; i++) { s += i; p *= i; }
            return `${s}\n${p}`;
          }
          case 'CP-4.8': {
            const lim = parseInt(num(0), 10), step = parseInt(num(1), 10);
            if (step <= 0) return '';
            const out = []; for (let v = step; v <= lim; v += step) out.push(v);
            return out.join('\n');
          }
          case 'CP-5.1b': {
            const nums = lines.map(x => parseInt(x, 10)).filter(x => !Number.isNaN(x)).reverse();
            return 'The inputted integers are:\n' + nums.join('\n');
          }
          case 'CP-5.3': {
            const map = { 'Amy': '2345 6789', 'Ben': '2111 2222', 'Yvonne': '2715 5432', 'Zoe': '2987 6543' };
            const n = str(0).trim();
            return map[n] ? `The phone no of ${n} is ${map[n]}` : 'Not found';
          }
          case 'CP-5.8': {
            const w = str(0).trim().split(/\s+/).filter(Boolean);
            return String(w.length);
          }
          case 'CP-5.9': {
            const s = str(0).trim(); const idx = s.lastIndexOf('.');
            return idx !== -1 ? s.slice(idx + 1) : s;
          }
          case 'WB-D4-1': {
            const p = num(0), d = num(1), q = parseInt(num(2), 10);
            const dp = Math.round(p * d * 100) / 100;
            const tot = Math.round(dp * q * 100) / 100;
            return `The discounted price is $ ${fmt1(dp)}\nTotal: $ ${fmt1(tot)}`;
          }
          case 'WB-D4-2': {
            const hk = str(0).trim().toUpperCase(), gpa = num(1), dse = num(2);
            if (hk !== 'Y' || gpa < 3.6) return 'Not eligible';
            let amt = 10000;
            if (gpa >= 3.8) amt += 7500;
            if (dse >= 21) amt += 5000;
            return String(amt);
          }
          case 'WB-D7-2': {
            const target = 'bingo';
            let g = '';
            for (const s of lines) { if (s.length === 5) { g = s; break; } }
            if (!g) g = str(lines.length - 1);
            const rec = []; let cnt = 0;
            for (let i = 0; i < 5; i++) {
              const ok = g[i] === target[i];
              if (ok) cnt++;
              rec.push(ok ? 'True' : 'False');
            }
            return `Your record: [${rec.join(', ')}]\nYou guessed ${cnt} characters correctly.`;
          }
          case 'WB-XC1': {
            let n = 0;
            for (const ln of lines) { const v = parseInt(ln, 10); if (v > 0) { n = v; break; } }
            let f = 0; for (let i = 1; i <= n; i++) if (n % i === 0) f++;
            return f === 2 ? `Prime with 2 factors` : `Composite with ${f} factors`;
          }
          case 'WB-XC3': {
            let n = parseInt(num(0), 10);
            const vals = [100, 50, 10, 5, 1], syms = ['C', 'L', 'X', 'V', 'I'];
            const arr = []; let rom = '';
            for (let i = 0; i < vals.length; i++) {
              while (n >= vals[i]) { arr.push(vals[i]); rom += syms[i]; n -= vals[i]; }
            }
            return `[${arr.join(', ')}]\n${rom}`;
          }
          case 'WB-XC5': return parseInt(num(0), 10).toString(2);
          case 'XC-CP-1.2': return `The corresponding binary number is ${parseInt(num(0), 10).toString(2)}`;
          case 'XC-CP-1.4a': {
            const n = parseInt(num(0), 10);
            let p = n > 1; for (let i = 2; i * i <= n; i++) if (n % i === 0) { p = false; break; }
            return p ? `${n} is a prime number.` : `${n} is not a prime number.`;
          }
          case 'XC-CP-1.4b': {
            const gcd = (x, y) => y ? gcd(y, x % y) : x;
            return `The HCF is ${gcd(Math.abs(parseInt(num(0), 10)), Math.abs(parseInt(num(1), 10)))}`;
          }
          case 'XC-CP-1.6': {
            const s = str(0);
            let bal = 0, ok = true;
            for (const ch of s) { if (ch === '(') bal++; else if (ch === ')') { bal--; if (bal < 0) ok = false; } }
            return (ok && bal === 0) ? 'Valid' : 'Invalid';
          }
          case 'XC-EX-1.1': {
            const a = parseInt(num(0), 10), b = parseInt(num(1), 10);
            const gcd = (x, y) => y ? gcd(y, x % y) : x;
            const h = gcd(a, b);
            return `The LCM of ${a} and ${b} is ${(a * b) / h}\nThe HCF is ${h}`;
          }
          case 'XC-CP-3.1': {
            const a = num(0), b = num(1), c = num(2);
            if (a + b <= c || a + c <= b || b + c <= a) return 'Not a triangle';
            if (a === b && b === c) return 'Equilateral triangle';
            if (a === b || b === c || a === c) return 'Isosceles triangle';
            return 'Scalene triangle';
          }
          case 'XC-CP-3.3a': {
            const s = str(0).trim();
            return (s.length >= 6 && s === s.toUpperCase()) ? 'True' : 'False';
          }
          case 'XC-CP-4.3': {
            const s = str(0);
            const users = ['admin1', 'peter88', 'mary99'];
            const hasDigit = /[0-9]/.test(s);
            const noSpace = !s.includes(' ');
            const exists = users.includes(s);
            return (hasDigit && noSpace && !exists) ? 'True' : 'False';
          }
          case 'XC-EX-4.3': {
            const z = ['rat','ox','tiger','rabbit','dragon','snake','horse','goat','monkey','rooster','dog','pig'];
            const y = parseInt(num(0), 10);
            return z[((y - 4) % 12 + 12) % 12];
          }
          case 'XC-EX-4.4': return String(parseInt(str(0).trim(), 16));
          case 'XC-CP-6.1': {
            const retire = [4497, 5557, 5568, 5790, 7924];
            const staff_no = parseInt(num(0), 10);
            let found = -1, i = 0, steps = 0;
            while (i < retire.length && found === -1 && staff_no >= retire[i]) {
              steps++;
              if (staff_no === retire[i]) found = i;
              i++;
            }
            return `${found} ${steps}`;
          }
          case 'XC-CP-6.2': {
            const kws = ['and','as','assert','break','class','continue','def','del','elif','else','except','False','finally','for','from','global','if','import','in','is','lambda','None','nonlocal','not','or','pass','raise','return','True','try','while','with','yield'];
            return kws.includes(str(0).trim()) ? 'This is a keyword.' : 'This is not a keyword.';
          }
          case 'XC-CP-7.2': {
            const msg = str(0), k = parseInt(num(1), 10);
            let out = '';
            for (const ch of msg) {
              const code = ch.charCodeAt(0);
              if (code >= 65 && code <= 90) out += String.fromCharCode(((code - 65 + k) % 26 + 26) % 26 + 65);
              else out += ch;
            }
            return out;
          }
          default: return fallbackExp;
        }
      } catch (e) {
        return fallbackExp;
      }
    }

    function draftStorageKey(scope, id) {
      const uid = (state.student && state.student.email) ? state.student.email : 'guest';
      return `hkdse_py_class_draft_v1_${uid}_${scope}_${id}`;
    }
    const _memDrafts = {};
    function saveDraft(scope, id, val) {
      if (!id) return;
      _memDrafts[draftStorageKey(scope, id)] = String(val == null ? '' : val);
    }
    function loadDraft(scope, id) {
      if (!id) return null;
      const k = draftStorageKey(scope, id);
      return Object.prototype.hasOwnProperty.call(_memDrafts, k) ? _memDrafts[k] : null;
    }
    function clearDraft(scope, id) {
      if (!id) return;
      delete _memDrafts[draftStorageKey(scope, id)];
    }

    function renderZhChipsBar(barId, editorId, chips) {
      const bar = document.getElementById(barId);
      if (!bar) return;
      if (!chips || !chips.length) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
      bar.classList.remove('hidden');
      bar.innerHTML = '<span class="font-mono-code text-[10px] text-[#9aa7b8] mr-1">一鍵輸入中文：</span>' +
        chips.map((txt, idx) => `<button type="button" data-zhidx="${idx}" class="px-2 py-0.5 rounded-[3px] bg-[#132035] hover:bg-[#1e3252] border border-[#38bdf8]/40 text-[#e0f2fe] font-mono-code text-[11px] transition">"${escapeHtml(txt)}"</button>`).join('');
      bar.querySelectorAll('[data-zhidx]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const ed = document.getElementById(editorId);
          if (!ed) return;
          const phrase = '"' + chips[Number(btn.getAttribute('data-zhidx'))] + '"';
          const s = ed.selectionStart != null ? ed.selectionStart : ed.value.length;
          const en = ed.selectionEnd != null ? ed.selectionEnd : ed.value.length;
          ed.value = ed.value.slice(0, s) + phrase + ed.value.slice(en);
          ed.selectionStart = ed.selectionEnd = s + phrase.length;
          ed.focus();
          ed.dispatchEvent(new Event('input'));
        });
      });
    }

    function logBlockedPasteInstant(contextLabel, itemId) {
      state.lastPasteBlocked = true;
      playError();
      if (state.student) {
        syncToGoogleSheet({
          cls: state.student.cls,
          no: state.student.no,
          name: state.student.name,
          lesson: contextLabel,
          levelId: itemId || contextLabel,
          tier: '防貼上警告',
          passed: false,
          xp: state.xp,
          penalty: state.penalty,
          attempts: 0,
          tabSwitches: state.tabSwitches,
          awaySeconds: state.awaySeconds,
          aiFlags: ['嘗試複製貼上(已攔截並即時紀錄)'],
          code: '[BLOCKED_PASTE_ATTEMPT]'
        });
      }
    }


    // === Silent Auto-Force Update (iPad Home Screen Web App) + Background Cloud Re-Sync ===
    const APP_VERSION = '2026.11.25-08';
    let _lastCloudResyncTs = 0;
    async function silentCheckForNewVersion() {
      try {
        if (!/^https?:$/.test(window.location.protocol)) return;
        const lastReload = Number(sessionStorage.getItem('_app_force_reload_ts') || 0);
        if (Date.now() - lastReload < 15000) return;
        const resp = await fetch(`${window.location.pathname}?_v=${Date.now()}`, { method: 'GET', cache: 'no-store' });
        if (!resp.ok) return;
        const txt = await resp.text();
        const m = txt.match(/const APP_VERSION = '([^']+)'/);
        if (m && m[1] && m[1] !== APP_VERSION) {
          sessionStorage.setItem('_app_force_reload_ts', String(Date.now()));
          window.location.replace(`${window.location.pathname}?_v=${Date.now()}${window.location.hash || ''}`);
        }
      } catch (e) {}
    }
    async function silentResyncCloudProgress() {
      const now = Date.now();
      if (now - _lastCloudResyncTs < 4000) return;
      _lastCloudResyncTs = now;
      const email = state.student && state.student.email;
      if (!email) return;
      const cloud = await loadCloudProgressByEmail(email);
      if (!cloud) return;
      mergeCloudProgress(cloud);
      if (typeof renderTextbookList === 'function') renderTextbookList();
      if (typeof renderDseList === 'function') renderDseList();
    }
    window.addEventListener('pageshow', (e) => {
      silentCheckForNewVersion();
      if (e.persisted) silentResyncCloudProgress();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        silentCheckForNewVersion();
        silentResyncCloudProgress();
      }
    });
    setTimeout(silentCheckForNewVersion, 2500);
    setInterval(silentCheckForNewVersion, 180000);

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // =========================================================================
    // PYODIDE WASM ENGINE + AST STANDARD-PYTHON CHECKER + VIRTUAL FILES
    // =========================================================================
    const PY_AST_CHECKER = `
import ast, json

def _hkdse_check_code(code_str, forbidden_calls):
    issues = []
    ai_flags = []
    # Check raw semicolons outside strings
    try:
        tree = ast.parse(code_str)
    except SyntaxError as e:
        return json.dumps({"syntax_error": f"第 {e.lineno} 行語法錯誤：{e.msg}", "issues": [], "ai_flags": []})

    for line_no, raw_line in enumerate(code_str.splitlines(), start=1):
        stripped = raw_line.split("#")[0]
        if ";" in stripped and ('";"' not in stripped and "';'" not in stripped):
            issues.append(f"第 {line_no} 行不可使用分號 ; 合併語句，請拆成獨立行。")

    for node in ast.walk(tree):
        ln = getattr(node, "lineno", "?")
        if isinstance(node, ast.AugAssign):
            issues.append(f"第 {ln} 行不可使用簡寫運算符（如 +=、-=），請改用標準寫法（例如 x = x + 1）。")
        elif isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, (ast.Tuple, ast.List)):
                    issues.append(f"第 {ln} 行不可使用單行多重賦值或元組交換，請拆成獨立行或使用 temp 變量。")
        elif isinstance(node, ast.ListComp) or isinstance(node, ast.DictComp) or isinstance(node, ast.SetComp):
            ai_flags.append(f"超綱語法(ListComp L{ln})")
        elif isinstance(node, ast.Lambda):
            ai_flags.append(f"超綱語法(lambda L{ln})")
        elif isinstance(node, ast.JoinedStr):
            ai_flags.append(f"超綱語法(f-string L{ln})")
        elif isinstance(node, ast.Call):
            fn = ""
            if isinstance(node.func, ast.Name):
                fn = node.func.id
            elif isinstance(node.func, ast.Attribute):
                fn = node.func.attr
            if fn in ("enumerate", "zip", "map", "filter"):
                ai_flags.append(f"超綱函數({fn} L{ln})")
            if fn in forbidden_calls:
                issues.append(f"第 {ln} 行本題禁止使用內置函數 {fn}()，請自行以循環編寫算法。")

    return json.dumps({"syntax_error": "", "issues": issues, "ai_flags": ai_flags})
`;

    async function initPyodideEngine() {
      const statusEl = document.getElementById('engineStatus');
      try {
        if (typeof loadPyodide !== 'function') throw new Error('Pyodide CDN unavailable');
        state.pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' });
        state.pyodide.runPython(PY_AST_CHECKER);
        resetVirtualFiles();
        statusEl.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#10d981] shadow-[0_0_8px_#10d981]"></span> PYTHON 3 WASM READY';
        statusEl.className = 'flex items-center gap-1.5 text-[#10d981] font-mono-code text-[10px]';
      } catch (err) {
        statusEl.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#f5a623]"></span> OFFLINE PREVIEW';
        statusEl.className = 'flex items-center gap-1.5 text-[#f5a623] font-mono-code text-[10px]';
      }
    }

    async function runPythonCode(code, stdinStr, checkFile = '') {
      if (!state.pyodide) return { ok: false, error: 'Python 3 引擎正在載入中，請稍候數秒再試。', output: '' };
      state.pyodide.globals.set('_user_code', code);
      state.pyodide.globals.set('_user_stdin', stdinStr || '');
      state.pyodide.globals.set('_check_file', checkFile || '');
      const runner = `
import io, os as _os, sys as _sys, time as _time, contextlib
_lines = _user_stdin.splitlines()
_it = iter(_lines)
_eof_cnt = 0
def _fake_input(prompt=""):
    global _eof_cnt
    try:
        return next(_it)
    except StopIteration:
        _eof_cnt += 1
        if _eof_cnt > 3:
            raise EOFError("測試輸入已用盡（請檢查 input() 次數或 while 終止條件，避免無限循環）。")
        return ""
_buf = io.StringIO()
_err = ""
_steps = 0
_MAX_STEPS = 25000
_t0 = _time.monotonic()
def _loop_guard(frame, event, arg):
    global _steps
    if event == "line":
        _steps += 1
        if _steps > _MAX_STEPS or (_steps % 500 == 0 and (_time.monotonic() - _t0) > 2.0):
            raise RuntimeError("程式執行步數超過安全上限（疑似無限循環 Infinite Loop），已自動中止！請檢查 while 條件及變量更新。")
    return _loop_guard
try:
    _ns = {"input": _fake_input}
    _sys.settrace(_loop_guard)
    with contextlib.redirect_stdout(_buf):
        exec(compile(_user_code, "<student.py>", "exec"), _ns)
except Exception as e:
    _err = f"{type(e).__name__}: {e}"
finally:
    _sys.settrace(None)
_final_out = _buf.getvalue()
if len(_final_out) > 20000:
    _final_out = _final_out[:20000] + "\\n...（輸出過長已截斷）"
if _check_file and not _err:
    if _os.path.exists(_check_file):
        with open(_check_file, "r", encoding="utf-8") as _cf:
            _final_out = _cf.read()
    else:
        _err = "找不到指定輸出檔案：" + _check_file
(_final_out, _err)
`;
      const res = state.pyodide.runPython(runner).toJs();
      return { ok: !res[1], output: String(res[0] || '').trim(), error: String(res[1] || '') };
    }

    function checkCodeAst(code, forbiddenCalls) {
      if (!state.pyodide) {
        // Basic JS regex fallback if Pyodide still loading
        const issues = [];
        if (/;/.test(code)) issues.push('不可使用分號 ; 合併語句，請拆成獨立行。');
        if (/(\+=|-=|\*=|\/=)/.test(code)) issues.push('不可使用 +=／-= 簡寫，請改用標準寫法（如 x = x + 1）。');
        return { syntax_error: '', issues, ai_flags: [] };
      }
      state.pyodide.globals.set('_chk_code', code);
      state.pyodide.globals.set('_chk_forb', forbiddenCalls || []);
      const raw = state.pyodide.runPython('_hkdse_check_code(_chk_code, list(_chk_forb))');
      return JSON.parse(raw);
    }

    // Virtual Text Files for Sandbox (L71 preview)
    function resetVirtualFiles() {
      if (!state.pyodide) return;
      state.pyodide.FS.writeFile('data.txt', '10/06#Rainy\n11/06#Cloudy\n12/06#Sunny\n');
      state.pyodide.FS.writeFile('out.txt', 'Today is Monday.\n');
      renderVirtualFiles();
    }

    function renderVirtualFiles() {}

    // =========================================================================
    // INTERACTIVE STEP-BY-STEP DRY-RUN TRACE VISUALIZER (GREEN-BAR PAPER)
    // =========================================================================
    // =========================================================================
    // UI RENDERING: PROGRESS, SIDEBAR, ROADMAP, QUEST LEVEL
    // =========================================================================
    function renderProgressWidgets() {
      const done = Object.keys(state.completed).length;
      const pct = Math.round((done / LEVELS.length) * 100);
      document.getElementById('xpReadout').textContent = state.xp;
      const clearedLv = getClearedLessonCount();
      document.getElementById('levelBadge').textContent = `LV.${clearedLv}`;
      const qLv = document.getElementById('questLvBadge');
      if (qLv) qLv.textContent = `LV.${clearedLv}`;
      document.getElementById('penaltyReadout').textContent = state.penalty > 0 ? `扣分: -${state.penalty}` : '扣分: 0';
      document.getElementById('tabSwitchReadout').textContent = `切頁: ${state.tabSwitches}`;
      document.getElementById('completedCountText').textContent = `${done} / ${LEVELS.length} 題`;
      document.getElementById('masteryPct').textContent = `${pct}%`;
      const mLv = document.getElementById('mobLevelBadge'); if (mLv) mLv.textContent = `LV.${clearedLv}`;
      if (typeof styleLevelBadges === 'function') styleLevelBadges(clearedLv);
      const mXp = document.getElementById('mobXpReadout'); if (mXp) mXp.textContent = state.xp;
      const mPen = document.getElementById('mobPenaltyReadout'); if (mPen) mPen.textContent = state.penalty > 0 ? `扣分: -${state.penalty}` : '扣分: 0';
      const mCnt = document.getElementById('mobCompletedCount'); if (mCnt) mCnt.textContent = `${done} / ${LEVELS.length}`;
      const mPct = document.getElementById('mobMasteryPct'); if (mPct) mPct.textContent = `${pct}%`;
      const mBar = document.getElementById('mobProgressFill'); if (mBar) mBar.style.width = `${pct}%`;
      document.getElementById('gaugeArc').setAttribute('stroke-dashoffset', String(126 - (126 * pct) / 100));
      document.getElementById('gaugeNeedle').setAttribute('transform', `rotate(${-90 + (180 * pct) / 100} 50 48)`);
    }

    function buildSidebar(targetEl, closeMobile) {
      targetEl.innerHTML = '';
      LESSONS.forEach((les, idx) => {
        if (idx === 0 || (idx > 0 && LESSONS[idx - 1].term !== les.term)) {
          const hdr = document.createElement('div');
          hdr.className = 'font-mono-code text-[10px] font-bold tracking-wider uppercase px-1.5 pt-2 pb-1 text-[#38bdf8] border-b border-[#1b2430]';
          hdr.textContent = les.term === 1 ? '上學期 // 必修單元 D (L01–L33)' : '下學期 // 選修單元 C (L36–L71)';
          targetEl.appendChild(hdr);
        }
        const stats = getChapterStats(les.ch);
        const unlocked = isChapterUnlocked(les.ch);
        const isOpen = Boolean(state.openChapters[les.ch]);
        const wrap = document.createElement('div');
        wrap.className = 'border border-[#1b2430] rounded-sm bg-[#090d13] overflow-hidden';

        const hBtn = document.createElement('button');
        hBtn.className = `w-full text-left px-2.5 py-2 flex items-center justify-between gap-2 text-xs font-bold transition ${unlocked ? 'text-[#e2e8f0] hover:bg-[#141b25]' : 'text-[#64748b] opacity-70'}`;
        hBtn.innerHTML = `<span class="truncate flex items-center gap-1.5"><span class="font-mono-code text-[10px]">${unlocked ? (isOpen ? '▾' : '▸') : '🔒'}</span><span class="text-[#38bdf8] font-mono-code">${les.lcode}</span><span class="truncate">${escapeHtml(les.title)}</span></span>
          <span class="shrink-0 font-mono-code text-[10px] px-1.5 py-0.5 rounded-[2px] ${stats.cleared ? 'bg-[#10d981]/20 text-[#10d981]' : 'bg-[#141b25] text-[#38bdf8]'}">${stats.done}/${stats.total}</span>`;
        hBtn.addEventListener('click', () => {
          if (!unlocked) { playError(); return; }
          state.openChapters[les.ch] = !state.openChapters[les.ch];
          renderSidebars();
        });
        wrap.appendChild(hBtn);

        if (isOpen && unlocked) {
          const list = document.createElement('div');
          list.className = 'border-t border-[#18202b] divide-y divide-[#141b25]';
          LEVELS.forEach((lvl, idx) => {
            if (lvl.ch !== les.ch) return;
            const cur = state.mode === 'quest' && idx === state.currentLevelIdx;
            const done = Boolean(state.completed[lvl.id]);
            const b = document.createElement('button');
            b.className = `w-full text-left px-2.5 py-1.5 text-[11px] flex items-center justify-between gap-1.5 border-l-2 ${cur ? 'bg-[#10b981]/15 border-[#10b981] text-white font-bold' : 'border-transparent text-[#9aa7b8] hover:bg-[#141b25]'}`;
            b.innerHTML = `<span class="truncate"><span class="font-mono-code text-[10px] text-[#38bdf8] mr-1">${lvl.id}</span>${escapeHtml(lvl.typeLabel)}</span>
              <span class="font-mono-code text-[10px] ${done ? 'text-[#10d981] font-bold' : 'text-[#64748b]'}">${done ? '✓' : '·'}</span>`;
            b.addEventListener('click', () => {
              switchMode('quest'); loadLevel(idx);
              if (closeMobile) document.getElementById('mobileDrawer').classList.add('hidden');
            });
            list.appendChild(b);
          });
          wrap.appendChild(list);
        }
        targetEl.appendChild(wrap);
      });
    }
    function renderSidebars() {
      buildSidebar(document.getElementById('chapterList'), false);
      buildSidebar(document.getElementById('mobileChapterList'), true);
    }

    let homeTermFilter = 'ALL';
    let currentWarmupCard = null;



    function renderHomeRoadmap() {
      const grid = document.getElementById('homeRoadmapGrid');
      grid.innerHTML = '';
      const cur = LEVELS[state.currentLevelIdx] || LEVELS[0];

      const doneQ = Object.keys(state.completed).length;
      const doneTb = typeof tbState !== 'undefined' ? Object.keys(tbState.done || {}).length : 0;
      const pct = Math.round((doneQ / LEVELS.length) * 100);
      const lv = Math.floor(state.xp / 100) + 1;
      const rankTitles = ['Python 新手', '語法學徒', '邏輯探索者', '陣列能手', '算法達人', '除錯專家', 'DSE 程式大師'];
      const rankName = rankTitles[Math.min(rankTitles.length - 1, Math.floor((lv - 1) / 2))];
      const rkEl = document.getElementById('homeRankBadge');
      if (rkEl) rkEl.textContent = `LV.${lv} ${rankName}`;
      const xpEl = document.getElementById('homeXpPill');
      if (xpEl) xpEl.textContent = `${state.xp} 分`;
      const arcEl = document.getElementById('homeRingArc');
      if (arcEl) arcEl.setAttribute('stroke-dashoffset', String(94.2 - (94.2 * pct) / 100));
      const pctEl = document.getElementById('homeRingPct');
      if (pctEl) pctEl.textContent = `${pct}%`;
      const tbPct = TEXTBOOK_EXAMPLES.length ? Math.round((doneTb / TEXTBOOK_EXAMPLES.length) * 100) : 0;
      const doneEx = (typeof practiceState !== 'undefined' && practiceState.done) ? Object.keys(practiceState.done).length : 0;
      const _visPr = getVisiblePracticeBank(); const totalEx = _visPr.length || 516;
      const exPct = totalEx ? Math.round((doneEx / totalEx) * 100) : 0;
      const qsEl = document.getElementById('homeQuestStat');
      if (qsEl) qsEl.textContent = `${doneQ} / ${LEVELS.length} (${pct}%)`;
      const qBar = document.getElementById('homeQuestBar');
      if (qBar) qBar.style.width = `${pct}%`;
      const tsEl = document.getElementById('homeTbStat');
      if (tsEl) tsEl.textContent = `${doneTb} / ${TEXTBOOK_EXAMPLES.length} (${tbPct}%)`;
      const tBar = document.getElementById('homeTbBar');
      if (tBar) tBar.style.width = `${tbPct}%`;
      const exEl = document.getElementById('homeExtraStat');
      if (exEl) exEl.textContent = `${doneEx} / ${totalEx} (${exPct}%)`;
      const eBar = document.getElementById('homeExtraBar');
      if (eBar) eBar.style.width = `${exPct}%`;
      const nextTb = TEXTBOOK_EXAMPLES.find((e) => !(tbState.done || {})[e.id]) || TEXTBOOK_EXAMPLES[0];

      LESSONS.forEach((les) => {
        if (homeTermFilter !== 'ALL' && String(les.term) !== homeTermFilter) return;
        const st = getChapterStats(les.ch);
        const unlocked = isChapterUnlocked(les.ch);
        const pctLes = Math.round((st.done / st.total) * 100);
        const firstIdx = LEVELS.findIndex((l) => l.ch === les.ch);
        const accentBorder = les.term === 1 ? 'border-t-[#10b981]' : 'border-t-[#38bdf8]';
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `text-left p-4 rounded border border-t-2 ${st.cleared ? 'border-t-[#fbbf24] bg-[#0d1f1b] border-[#10b981]/45' : (unlocked ? `${accentBorder} bg-[#0f1a2b] border-[#243754] hover:border-[#38bdf8] hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(2,132,199,0.12)]` : 'border-t-[#26364e] bg-[#0b1320] border-[#1b283d] opacity-85 cursor-not-allowed')} transition flex flex-col justify-between gap-3`;
        card.innerHTML = `<div class="space-y-1.5">
          <div class="flex items-center justify-between font-mono-code text-[10px]">
            <span class="${les.term === 1 ? 'text-[#34d399]' : 'text-[#38bdf8]'} font-bold tracking-wide">${les.lcode} · ${les.term === 1 ? '必修 D' : '選修 C'}</span>
            <span class="px-2 py-0.5 rounded font-bold ${st.cleared ? 'bg-[#10b981]/20 text-[#34d399]' : (unlocked ? 'bg-[#38bdf8]/15 text-[#7dd3fc]' : 'bg-[#132035] text-[#8fa0b5]')}">${st.cleared ? '✓ 完成' : (unlocked ? `${st.done}/${st.total} 題` : '🔒 未解鎖')}</span>
          </div>
          <div class="font-display font-bold text-[14px] ${unlocked || st.cleared ? 'text-white' : 'text-[#cbd5e1]'} leading-snug">${escapeHtml(les.title)}</div>
          <div class="text-[11px] text-[#8fa0b5] truncate">${escapeHtml(les.textbookRef)}</div>
        </div>
        <div class="h-1.5 w-full bg-[#060a12] rounded-full overflow-hidden border border-[#1a2638]">
          <div class="h-full ${st.cleared ? 'bg-[#fbbf24]' : (les.term === 1 ? 'bg-[#10b981]' : 'bg-[#38bdf8]')}" style="width: ${pctLes}%"></div>
        </div>`;
        card.addEventListener('click', () => {
          if (!unlocked) { playError(); return; }
          const nextUndone = LEVELS.findIndex((l) => l.ch === les.ch && !state.completed[l.id]);
          switchMode('quest');
          loadLevel(nextUndone !== -1 ? nextUndone : firstIdx);
        });
        grid.appendChild(card);
      });
    }

    function updateLineGutter(textareaEl, gutterEl) {
      const count = (textareaEl.value.match(/\n/g) || []).length + 1;
      gutterEl.innerHTML = Array.from({ length: count }, (_, i) => i + 1).join('<br>');
    }

    function updateInlineNextButtons() {
      const lvl = LEVELS[state.currentLevelIdx];
      const passed = Boolean(state.completed[lvl.id]);
      const nextIdx = state.currentLevelIdx + 1;
      const hasNext = nextIdx < LEVELS.length;
      const nextUnlocked = hasNext && isChapterUnlocked(LEVELS[nextIdx].ch);
      document.querySelectorAll('[data-inline-next]').forEach((btn) => {
        btn.classList.remove('next-unlocked-pulse');
        if (!hasNext && passed) { btn.disabled = true; btn.innerHTML = '<span>🏆 全年 138 題全數完成！</span>'; }
        else if (!passed) { btn.disabled = true; btn.innerHTML = '<span>答對後解鎖下一題 →</span>'; }
        else if (!nextUnlocked) { btn.disabled = true; btn.innerHTML = '<span>🔒 請先完成本課全部 6 題</span>'; }
        else { btn.disabled = false; btn.classList.add('next-unlocked-pulse'); btn.innerHTML = `<span>✓ 下一題 (${LEVELS[nextIdx].id}) →</span>`; }
      });
      document.getElementById('prevLevelBtn').disabled = state.currentLevelIdx === 0;
      document.getElementById('nextLevelBtn').disabled = !hasNext || !nextUnlocked;
    }

    function loadLevel(idx) {
      if (idx < 0 || idx >= LEVELS.length || !isChapterUnlocked(LEVELS[idx].ch)) return;
      state.currentLevelIdx = idx;
      state.selectedMcq = null;
      const lvl = LEVELS[idx];
      const les = LESSONS[lvl.ch - 1];
      const stats = getChapterStats(lvl.ch);
      const isHard = lvl.diff === 'hard';
      state.openChapters[lvl.ch] = true;

      document.getElementById('lvlLessonTag').textContent = `${les.lcode} ${les.title}`;
      document.getElementById('lvlTypeTag').textContent = lvl.typeLabel;
      const diffEl = document.getElementById('lvlDiffTag');
      diffEl.textContent = isHard ? '進階（禁用提示／答案）' : '基礎（可用提示）';
      diffEl.className = isHard
        ? 'px-1.5 py-0.5 rounded-[2px] bg-[#10b981]/20 text-[#34d399] border border-[#10b981]/40 font-bold'
        : 'px-1.5 py-0.5 rounded-[2px] bg-[#f5a623]/15 text-[#f5a623] border border-[#f5a623]/35 font-bold';
      document.getElementById('lvlXpTag').textContent = `+${lvl.xp} 分`;
      document.getElementById('lvlTopicProgressTag').textContent = `本課 ${stats.done}/${stats.total}`;
      const _cleanLvlTitle = String(lvl.title || '').replace(/^程度[一二三四五六1-6][：:]\s*/, '');
      document.getElementById('lvlTitle').textContent = `${lvl.id} ${_cleanLvlTitle}`;
      document.getElementById('lvlTextbookRef').textContent = `// ${les.textbookRef}`;

      // Populate Lesson Notes + Python × Pseudocode Table
      document.getElementById('lessonNotesList').innerHTML = les.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
      document.getElementById('pseudoCompareBody').innerHTML = les.pseudoTable.map((row) => `
        <tr>
          <td class="py-2 px-2.5 font-sans font-bold text-[#38bdf8] align-top">${escapeHtml(row.item)}</td>
          <td class="py-2 px-2.5 whitespace-pre-wrap align-top">${escapeHtml(row.py)}</td>
          <td class="py-2 px-2.5 font-sans whitespace-pre-wrap align-top text-[#cbd5e1]">${escapeHtml(row.pseudo)}</td>
        </tr>`).join('');

      document.getElementById('pyWorkspace').classList.toggle('hidden', lvl.type !== 'py');
      document.getElementById('debugQuizWorkspace').classList.toggle('hidden', lvl.type !== 'debug_quiz');
      document.getElementById('dryrunWorkspace').classList.toggle('hidden', lvl.type !== 'dryrun');

      if (lvl.type === 'py') {
        document.getElementById('lvlPrompt').textContent = lvl.prompt;
        document.getElementById('editorFileName').textContent = `${lvl.lcode}_${lvl.tier}.py`;
        const ed = document.getElementById('pyInput');
        const passedPy = (state.completed[lvl.id] && state.passedCode && state.passedCode[lvl.id]) ? state.passedCode[lvl.id] : null;
        const cachedPy = loadDraft('quest', lvl.id);
        ed.value = (passedPy !== null) ? passedPy : ((cachedPy !== null) ? cachedPy : (lvl.starter || ''));
        renderZhChipsBar('questZhBar', 'pyInput', lvl.zhChips || []);
        updateLineGutter(ed, document.getElementById('pyLineGutter'));
        document.getElementById('manualStdin').value = (lvl.tests[0] && lvl.tests[0].stdin) ? lvl.tests[0].stdin.trim() : '';
        document.getElementById('pyFeedback').classList.add('hidden');
        const tPyBox = document.getElementById('teacherPyAnsBox'); if (tPyBox) tPyBox.classList.add('hidden');
        syncTeacherUI();
        document.getElementById('astAlertBox').classList.add('hidden'); const qtw = document.getElementById('questTraceWrap'); if (qtw) qtw.classList.add('hidden');
        document.getElementById('hintBox').classList.add('hidden');
        document.getElementById('hintBox').textContent = lvl.hint || '進階題目不設提示，請自行拆解算法。';
        document.getElementById('pyOutputArea').textContent = '// 點擊「執行測試」或「提交批改」檢視輸出...';

        const hBtn = document.getElementById('toggleHintBtn');
        if (hBtn) {
          hBtn.disabled = false;
          hBtn.classList.toggle('opacity-60', isHard);
          hBtn.textContent = isHard ? '🔒 提示已鎖' : '睇提示';
          if (typeof window.closePopover === 'function') window.closePopover();
        }

        // Keyword chips
        const kws = ['int(input())', 'float(input())', 'if :', 'elif :', 'else:', 'while :', 'for i in range(0, len()):', 'print()'];
        const bar = document.getElementById('pyKeywordBar');
        bar.innerHTML = '';
        kws.forEach((kw) => {
          const b = document.createElement('button');
          b.className = 'hw-btn px-2 py-0.5 rounded-[2px] bg-[#141b25] hover:bg-[#1e2a3a] border border-[#263242] text-[11px] font-mono-code text-[#38bdf8]';
          b.textContent = kw;
          b.addEventListener('click', () => {
            const s = ed.selectionStart, e = ed.selectionEnd;
            ed.value = ed.value.slice(0, s) + kw + ed.value.slice(e);
            ed.focus(); ed.selectionStart = ed.selectionEnd = s + kw.length;
            updateLineGutter(ed, document.getElementById('pyLineGutter'));
          });
          bar.appendChild(b);
        });
      } else if (lvl.type === 'dryrun') {
        document.getElementById('lvlPrompt').textContent = lvl.prompt;
        document.getElementById('drSourceBadge').textContent = (lvl.source || '課本練習');
        const numbered = (lvl.code || '').split('\n').map((ln, i) => `${String(i + 1).padStart(2, '0')}  ${ln}`).join('\n');
        document.getElementById('drCodeBlock').textContent = numbered;
        const cachedDr = loadDraft('dr', lvl.id); document.getElementById('drUserInput').value = (cachedDr !== null) ? cachedDr : '';
        document.getElementById('drFeedback').classList.add('hidden');
        const drtw = document.getElementById('drTraceWrap'); if (drtw) drtw.classList.add('hidden');
        document.getElementById('drModelAns').textContent = state.completed[lvl.id] ? '（已通過雲端核對）' : '';
        document.getElementById('drExplainText').textContent = state.completed[lvl.id] ? '你已完成本題，如需重溫解析可重新提交核對。' : '';
        document.getElementById('drExplainBox').classList.add('hidden');
      } else {
        state.selectedMcq = null;
        state.selectedMcqB = null;
        state.dqPartADone = Boolean(state.completed[lvl.id]);
        state.dqStep = 1;
        document.getElementById('dqDebugPrompt').textContent = lvl.debugPrompt;
        document.getElementById('dqComparePrompt').textContent = lvl.comparePrompt;
        document.getElementById('dqMcqStem').textContent = lvl.mcqQuestion ? `【甲部核對】${lvl.mcqQuestion}` : '【甲部】請選出最準確的答案：';
        document.getElementById('dqCompareMcqStem').textContent = lvl.compareMcqStem || '【乙部】請選出最準確的算法比較答案：';
        document.getElementById('dqFeedback').classList.add('hidden');
        document.getElementById('dqFeedbackB').classList.add('hidden');
        document.getElementById('dqModelAnsBox').classList.add('hidden');
        document.getElementById('dqModelAnsBoxB').classList.add('hidden');
        document.getElementById('dqGoStep2Btn').classList.toggle('hidden', !state.dqPartADone && !isTeacherUser());

        const letters = ['A', 'B', 'C', 'D'];
        const optWrap = document.getElementById('dqMcqOptions');
        optWrap.innerHTML = (lvl.mcqOptions || []).map((opt, i) => `
          <button type="button" data-mcq="${i}" class="dq-opt text-left p-3 rounded-sm bg-[#09111d] hover:bg-[#111d30] border border-[#243754] text-xs sm:text-sm text-[#e2e8f0] transition">
            <span class="font-mono-code font-bold text-[#38bdf8] mr-1.5">${letters[i]}.</span>${escapeHtml(opt)}
          </button>`).join('');
        optWrap.querySelectorAll('.dq-opt').forEach((btn) => {
          btn.addEventListener('click', () => {
            state.selectedMcq = Number(btn.getAttribute('data-mcq'));
            optWrap.querySelectorAll('.dq-opt').forEach((b) => {
              const sel = Number(b.getAttribute('data-mcq')) === state.selectedMcq;
              b.className = sel
                ? 'dq-opt text-left p-3 rounded-sm bg-[#0c2236] border-2 border-[#38bdf8] text-xs sm:text-sm text-white font-bold transition'
                : 'dq-opt text-left p-3 rounded-sm bg-[#09111d] hover:bg-[#111d30] border border-[#243754] text-xs sm:text-sm text-[#e2e8f0] transition';
            });
          });
        });

        const optWrapB = document.getElementById('dqCompareMcqOptions');
        optWrapB.innerHTML = (lvl.compareMcqOptions || []).map((opt, i) => `
          <button type="button" data-mcqb="${i}" class="dq-opt-b text-left p-3 rounded-sm bg-[#09111d] hover:bg-[#111d30] border border-[#243754] text-xs sm:text-sm text-[#e2e8f0] transition leading-relaxed">
            <span class="font-mono-code font-bold text-[#34d399] mr-1.5">${letters[i]}.</span>${escapeHtml(opt)}
          </button>`).join('');
        optWrapB.querySelectorAll('.dq-opt-b').forEach((btn) => {
          btn.addEventListener('click', () => {
            state.selectedMcqB = Number(btn.getAttribute('data-mcqb'));
            optWrapB.querySelectorAll('.dq-opt-b').forEach((b) => {
              const sel = Number(b.getAttribute('data-mcqb')) === state.selectedMcqB;
              b.className = sel
                ? 'dq-opt-b text-left p-3 rounded-sm bg-[#06261d] border-2 border-[#10b981] text-xs sm:text-sm text-white font-bold transition leading-relaxed'
                : 'dq-opt-b text-left p-3 rounded-sm bg-[#09111d] hover:bg-[#111d30] border border-[#243754] text-xs sm:text-sm text-[#e2e8f0] transition leading-relaxed';
            });
          });
        });

        if (typeof setDqStep === 'function') setDqStep(1);
        syncTeacherUI();
      }
      renderSidebars();
      updateInlineNextButtons();
      saveProgress();
    }

    function markPassed(lvl, fbEl, msg, codeStr, aiFlags) {
      const first = !state.completed[lvl.id];
      const earned = state.usedSolution[lvl.id] ? Math.round(lvl.xp / 2) : lvl.xp;
      const before = getChapterStats(lvl.ch).cleared;
      if (first) { state.completed[lvl.id] = true; state.xp += earned; }
      saveProgress(); renderProgressWidgets(); renderSidebars(); updateInlineNextButtons();
      const after = getChapterStats(lvl.ch);
      document.getElementById('lvlTopicProgressTag').textContent = `本課 ${after.done}/${after.total}`;
      const justClearedLesson = !before && after.cleared;
      const nextLes = lvl.ch < LESSONS.length ? LESSONS[lvl.ch] : null;
      const unlockMsg = (justClearedLesson && nextLes)
        ? `<div class="mt-1 text-[#fde047]">🎉 已完成 ${lvl.lcode} 全部 6 題，正式解鎖 ${nextLes.lcode}！</div>` : '';
      if (justClearedLesson || (isTeacherUser() && after.cleared)) {
        setTimeout(() => triggerLessonLevelUp(lvl.ch, LESSONS[lvl.ch - 1], nextLes, false), 260);
      }
      fbEl.className = 'border-l-2 border-[#10d981] bg-[#10d981]/12 px-4 py-3 text-sm font-bold text-[#a7f3d0]';
      fbEl.innerHTML = `PASS // ${msg}${first ? `（+${earned} 分）` : '（已完成）'}${unlockMsg}`;
      fbEl.classList.remove('hidden');
      playSuccess();
      if (typeof window.showToast === 'function') {
        window.showToast(first ? `過關成功！獲得 +${earned} XP` : `已再次通過 ${lvl.id}！`, 'success', 3000);
      }
      if (typeof confetti === 'function') {
        const _lvTh = typeof getLevelTheme === 'function' ? getLevelTheme(lvl.ch) : { hex: '#38bdf8' };
        confetti({ particleCount: 52, spread: 66, origin: { y: 0.72 }, colors: [_lvTh.hex, '#ffffff', '#fde047', '#34d399'] });
      }
      if (first) {
        ['xpReadout', 'mobXpReadout'].forEach((_xid) => {
          const _xel = document.getElementById(_xid);
          if (_xel) { _xel.classList.remove('xp-pop-once'); void _xel.offsetWidth; _xel.classList.add('xp-pop-once'); }
        });
      }

      if (state.student) {
        syncToGoogleSheet({
          cls: state.student.cls, no: state.student.no, name: state.student.name,
          lesson: lvl.lcode, levelId: lvl.id, tier: lvl.typeLabel, passed: true,
          xp: state.xp, penalty: state.penalty, attempts: state.attempts[lvl.id] || 1,
          tabSwitches: state.tabSwitches, awaySeconds: state.awaySeconds,
          aiFlags: aiFlags || [], code: (codeStr || '').slice(0, 1500)
        });
      }
    }

    function markFailed(lvl, fbEl, msg, codeStr, aiFlags) {
      state.penalty += 5; state.xp = Math.max(0, state.xp - 5);
      saveProgress(); renderProgressWidgets();
      fbEl.className = 'border-l-2 border-[#f43f5e] bg-[#f43f5e]/15 px-4 py-3 text-sm font-bold text-[#fda4af] animate-shake';
      fbEl.innerHTML = `FAIL // ${msg} <span class="px-1.5 py-0.5 ml-1 rounded-[2px] bg-[#f43f5e] text-white font-mono-code text-xs">-5 分</span>`;
      fbEl.classList.remove('hidden');
      playError();

      if (state.student) {
        syncToGoogleSheet({
          cls: state.student.cls, no: state.student.no, name: state.student.name,
          lesson: lvl.lcode, levelId: lvl.id, tier: lvl.typeLabel, passed: false,
          xp: state.xp, penalty: state.penalty, attempts: state.attempts[lvl.id] || 1,
          tabSwitches: state.tabSwitches, awaySeconds: state.awaySeconds,
          aiFlags: aiFlags || [], code: (codeStr || '').slice(0, 1500)
        });
      }
    }

    async function handleRunOrCheck(doGrade) {
      const lvl = LEVELS[state.currentLevelIdx];
      const code = document.getElementById('pyInput').value;
      const outEl = document.getElementById('pyOutputArea');
      const fbEl = document.getElementById('pyFeedback');
      const astBox = document.getElementById('astAlertBox');
      const astTxt = document.getElementById('astAlertText');
      fbEl.classList.add('hidden');
      astBox.classList.add('hidden');

      if (!code.trim()) {
        if (doGrade) markFailed(lvl, fbEl, '請勿交白卷，請先編寫 Python 程式。', '', []);
        return;
      }

      // 1. AST Standard-Python & Anti-AI Check
      const astRes = checkCodeAst(code, lvl.forbiddenCalls);
      if (astRes.syntax_error) {
        outEl.textContent = astRes.syntax_error;
        if (doGrade) markFailed(lvl, fbEl, astRes.syntax_error, code, astRes.ai_flags);
        return;
      }
      if (astRes.issues.length > 0) {
        astTxt.innerHTML = '<strong>標準 Python 規範檢查未通過：</strong><br>' + astRes.issues.map(escapeHtml).join('<br>');
        astBox.classList.remove('hidden');
        if (doGrade) {
          state.attempts[lvl.id] = (state.attempts[lvl.id] || 0) + 1;
          markFailed(lvl, fbEl, '請按上方黃色提示改為標準 Python 寫法再提交。', code, astRes.ai_flags);
          return;
        }
      }

      if (!doGrade) {
        const res = await runPythonCode(code, document.getElementById('manualStdin').value, lvl.checkFile || '');
        outEl.textContent = res.ok ? (res.output || '（執行成功，無輸出）') : `執行錯誤：${res.error}`;
        if (res.ok) playTone(520, 0.05); else playError();
        return;
      }

      // 2. Automated Multi-Test-Case Execution + Cloud Grading (Zero Answers in HTML)
      state.attempts[lvl.id] = (state.attempts[lvl.id] || 0) + 1;
      outEl.textContent = '正在執行測試數據並連線雲端核對答案...';
      const outputs = [];
      const errors = [];
      for (let i = 0; i < lvl.tests.length; i++) {
        const tc = lvl.tests[i];
        const res = await runPythonCode(code, tc.stdin, lvl.checkFile || '');
        outputs.push(res.ok ? res.output : '');
        errors.push(res.ok ? '' : res.error);
      }

      const cloudRes = await callCloudGrader({
        action: 'grade',
        kind: 'level_py',
        id: lvl.id,
        outputs,
        errors
      });
      if (cloudRes.status !== 'ok') {
        outEl.textContent = outputs.map((o, i) => `測試 #${i + 1} 實際輸出:\n${errors[i] || o || '（無輸出）'}`).join('\n\n');
        fbEl.className = 'border-l-2 border-[#f5a623] bg-[#f5a623]/12 px-4 py-3 text-xs font-bold text-[#fde68a]';
        fbEl.textContent = cloudRes.message || '雲端核對暫時未能連線。';
        fbEl.classList.remove('hidden');
        playError();
        return;
      }

      const report = (cloudRes.details || []).map((d) =>
        `測試 #${d.idx}: ${d.ok ? 'PASS ✓' : 'FAIL ✗'}\n  實際輸出: ${d.actual || '（無輸出）'}`
      );
      outEl.textContent = report.join('\n\n');

      const flags = [...(astRes.ai_flags || [])];
      if (state.lastPasteBlocked) flags.push('曾嘗試貼上');

      if (cloudRes.passed) {
        markPassed(lvl, fbEl, `全部 ${cloudRes.total || lvl.tests.length} 組測試數據通過雲端核對，且符合標準 Python 規範！`, code, flags);
      } else {
        markFailed(lvl, fbEl, '部分測試數據輸出未符合預期，請檢查邏輯或使用 Dry-Run 追蹤。', code, flags);
      }
    }

    const sp = { paused: true, raf: null, score: 0, streak: 0, cleared: 0 };

    function syncTopLeftToggleBtn() {
      const btn = document.getElementById('mobileMenuBtn');
      if (!btn) return;
      const hasSidebar = state.mode === 'quest' || state.mode === 'textbook' || state.mode === 'extra';
      if (!hasSidebar) {
        btn.classList.add('hidden');
        btn.classList.remove('inline-flex');
        return;
      }
      btn.classList.remove('hidden');
      btn.classList.add('inline-flex');
      const isExpandedDesktop = window.innerWidth >= 1280 && (
        (state.mode === 'quest' && !state.sidebarCollapsed) ||
        (state.mode === 'textbook' && !state.tbSidebarCollapsed) ||
        (state.mode === 'extra' && !state.extraSidebarCollapsed)
      );
      btn.setAttribute('aria-expanded', isExpandedDesktop ? 'true' : 'false');
      btn.removeAttribute('title');
      btn.setAttribute('data-tooltip', isExpandedDesktop ? '收合側邊單元目錄' : '展開側邊單元目錄');
      btn.className = isExpandedDesktop
        ? 'inline-flex hw-btn h-[32px] px-2.5 rounded-md bg-[#0c2236] border border-[#38bdf8]/60 text-[#38bdf8] hover:text-white hover:border-[#38bdf8] text-xs font-bold items-center gap-1.5 shrink-0 transition'
        : 'inline-flex hw-btn h-[32px] px-2.5 rounded-md bg-[#101a2a] border border-[#243754] text-slate-300 hover:text-white hover:border-[#38bdf8]/60 text-xs font-bold items-center gap-1.5 shrink-0 transition';
    }

    function applyTbSidebarLayout(openMobileDrawer = false) {
      const bd = document.getElementById('tbSidebarBackdrop');
      const panel = document.getElementById('tbSidebarPanel');
      const rf = document.getElementById('tbRightFrame');
      const hud = document.getElementById('tbCompactHudBar');
      if (!bd || !rf) return;
      if (openMobileDrawer && window.innerWidth < 1280) {
        bd.className = 'fixed inset-0 z-40 bg-black/75 backdrop-blur-sm p-3 flex items-start';
        if (panel) panel.className = 'w-80 max-w-[86vw] max-h-[94dvh] overflow-y-auto flex flex-col chassis-surface rounded-md border-[#243754] bg-[#0c1320] shadow-2xl';
        syncTopLeftToggleBtn();
        return;
      }
      if (panel) panel.className = 'flex flex-col flex-1 min-h-0';
      if (!state.tbSidebarCollapsed) {
        bd.className = 'hidden xl:flex xl:col-span-3 flex-col border-r border-[#1e2d44] bg-[#0c1320]/95';
        rf.className = 'xl:col-span-9 min-w-0 p-4 sm:p-5 pb-16 lg:pb-8 bg-[#0e1726]/85 space-y-4';
        if (hud) hud.classList.add('xl:hidden');
      } else {
        bd.className = 'hidden';
        rf.className = 'xl:col-span-12 min-w-0 p-4 sm:p-5 pb-16 lg:pb-8 bg-[#0e1726]/85 space-y-4';
        if (hud) hud.classList.remove('xl:hidden');
      }
      syncTopLeftToggleBtn();
    }

    function applyExtraSidebarLayout(openMobileDrawer = false) {
      const bd = document.getElementById('prSidebarBackdrop');
      const panel = document.getElementById('prSidebarPanel');
      const rf = document.getElementById('prRightFrame');
      const hud = document.getElementById('prCompactHudBar');
      if (!bd || !rf) return;
      if (openMobileDrawer && window.innerWidth < 1280) {
        bd.className = 'fixed inset-0 z-40 bg-black/75 backdrop-blur-sm p-3 flex items-start';
        if (panel) panel.className = 'w-80 max-w-[86vw] max-h-[94dvh] overflow-y-auto flex flex-col chassis-surface rounded-md border-[#243754] bg-[#0c1320] shadow-2xl';
        syncTopLeftToggleBtn();
        return;
      }
      if (panel) panel.className = 'flex flex-col flex-1 min-h-0';
      if (!state.extraSidebarCollapsed) {
        bd.className = 'hidden xl:flex xl:col-span-3 flex-col border-r border-[#1e2d44] bg-[#0c1320]/95';
        rf.className = 'xl:col-span-9 min-w-0 p-4 sm:p-5 pb-16 lg:pb-8 bg-[#0e1726]/85 space-y-3.5';
        if (hud) hud.classList.add('xl:hidden');
      } else {
        bd.className = 'hidden';
        rf.className = 'xl:col-span-12 min-w-0 p-4 sm:p-5 pb-16 lg:pb-8 bg-[#0e1726]/85 space-y-3.5';
        if (hud) hud.classList.remove('xl:hidden');
      }
      syncTopLeftToggleBtn();
    }

    function applySidebarLayout() {
      const sb = document.getElementById('sidebarPanel');
      const mw = document.getElementById('mainWorkbench');
      const inQuest = state.mode === 'quest';
      const hud = document.getElementById('compactHudBar');
      if (inQuest && !state.sidebarCollapsed) {
        sb.classList.add('hidden');
        sb.classList.add('xl:flex');
        mw.classList.remove('xl:col-span-12', 'lg:col-span-12', 'lg:col-span-9');
        mw.classList.add('xl:col-span-9');
        if (hud) hud.classList.add('xl:hidden');
      } else {
        sb.classList.add('hidden');
        sb.classList.remove('xl:flex', 'lg:flex');
        mw.classList.remove('xl:col-span-9', 'lg:col-span-9');
        mw.classList.add('xl:col-span-12');
        if (hud) hud.classList.remove('xl:hidden');
      }
      syncTopLeftToggleBtn();
    }

    function switchMode(mode) {
      if (state.mode === 'sprint' && mode !== 'sprint') { sp.paused = true; if (sp.raf) cancelAnimationFrame(sp.raf); }
      state.mode = mode;
      document.getElementById('homeContainer').classList.toggle('hidden', mode !== 'home');
      const profCont = document.getElementById('profileContainer');
      if (profCont) profCont.classList.toggle('hidden', mode !== 'profile');
      document.getElementById('questContainer').classList.toggle('hidden', mode !== 'quest');
      document.getElementById('textbookContainer').classList.toggle('hidden', mode !== 'textbook');
      const exCont = document.getElementById('extraPracticeContainer');
      if (exCont) exCont.classList.toggle('hidden', mode !== 'extra');
      if (mode !== 'viz' && typeof stopVizTimer === 'function') stopVizTimer();
      applySidebarLayout();
      const activeTabCls = 'bg-[#38bdf8] text-[#04131e] font-bold shadow-[0_0_12px_rgba(56,189,248,0.22)]';
      const setBtn = (id, on) => {
        document.getElementById(id).className = on
          ? `px-3 py-1.5 rounded-[3px] transition whitespace-nowrap ${activeTabCls}`
          : 'px-3 py-1.5 rounded-[3px] text-[#9aa7b8] hover:text-white hover:bg-[#132035] transition whitespace-nowrap';
      };
      setBtn('modeHomeBtn', mode === 'home');
      if (document.getElementById('modeProfileBtn')) setBtn('modeProfileBtn', mode === 'profile');
      setBtn('modeQuestBtn', mode === 'quest');
      setBtn('modeTextbookBtn', mode === 'textbook');
      if (document.getElementById('modeExtraBtn')) setBtn('modeExtraBtn', mode === 'extra');
      if (mode === 'home') { renderHomeRoadmap(); if (window.HomeLeaderboard) window.HomeLeaderboard.refresh(false); }
      if (mode === 'profile' && window.StudentProfileUI) { window.StudentProfileUI.load(false); }
      if (mode === 'textbook') { renderTextbookList(); loadTextbookExample(tbState.activeId); applyTbSidebarLayout(false); }
      if (mode === 'extra' && typeof renderPracticeList === 'function') { renderPracticeList(); if (practiceState.activeId) loadPracticeQuestion(practiceState.activeId); applyExtraSidebarLayout(false); }
      renderSidebars();
    }


    
    // =========================================================================
    // LIVE PYODIDE sys.settrace DRY-RUN ENGINE (WORKS FOR ANY PYTHON CODE!)
    // =========================================================================
    const liveTraces = {
      quest: { codeLines: [], steps: [], idx: 0, timer: null },
      tb: { codeLines: [], steps: [], idx: 0, timer: null },
      dse: { codeLines: [], steps: [], idx: 0, timer: null },
      dr: { codeLines: [], steps: [], idx: 0, timer: null }
    };

    async function runLiveTrace(code, stdinStr) {
      if (!state.pyodide) return { ok: false, error: 'Python 3 引擎正在載入中，請稍候數秒再試。' };
      state.pyodide.globals.set('_tr_code', code);
      state.pyodide.globals.set('_tr_stdin', stdinStr || '');
      const pyTracer = `
import sys, io, json, contextlib
_lines = _tr_stdin.splitlines()
_it = iter(_lines)
def _tr_input(prompt=""):
    try:
        return next(_it)
    except StopIteration:
        return ""
_steps = []
_buf = io.StringIO()
_err = ""
def _safe_val(v):
    if isinstance(v, (int, float, bool, str)):
        return v
    if isinstance(v, list):
        return [_safe_val(x) for x in v[:16]]
    return str(v)[:30]
def _tracer(frame, event, arg):
    if frame.f_code.co_filename != "<trace.py>":
        return None
    if event in ("line", "return"):
        if len(_steps) >= 85:
            raise RuntimeError("追蹤步數已達上限 85 步（請檢查是否有無限循環）")
        snap = {}
        for k, v in frame.f_locals.items():
            if k.startswith("_") or callable(v) or type(v).__name__ == "module":
                continue
            snap[k] = _safe_val(v)
        _steps.append({"line": frame.f_lineno - 1, "vars": snap, "out": _buf.getvalue().strip()})
    return _tracer
try:
    _ns = {"input": _tr_input}
    sys.settrace(_tracer)
    with contextlib.redirect_stdout(_buf):
        exec(compile(_tr_code, "<trace.py>", "exec"), _ns)
except Exception as e:
    _err = f"{type(e).__name__}: {e}"
finally:
    sys.settrace(None)
json.dumps({"steps": _steps, "error": _err, "finalOut": _buf.getvalue().strip()}, ensure_ascii=False)
`;
      const raw = state.pyodide.runPython(pyTracer);
      return JSON.parse(raw);
    }

    function renderLiveTracePanel(slot) {
      const tr = liveTraces[slot];
      const pfxMap = { quest: 'q', tb: 'tb', dse: 'dse', dr: 'dr' };
      const pfx = pfxMap[slot] || 'q';
      const canvasEl = document.getElementById(`${pfx}TraceCanvas`);
      const noteEl = document.getElementById(`${pfx}TraceNote`);
      const cntEl = document.getElementById(`${pfx}TraceCounter`);
      const prevBtn = document.getElementById(`${pfx}TracePrevBtn`);
      const nextBtn = document.getElementById(`${pfx}TraceNextBtn`);
      if (!tr.steps.length) {
        canvasEl.innerHTML = '<div class="text-xs font-mono-code text-[#475569]">未有追蹤步驟，請檢查程式碼是否可正常執行。</div>';
        noteEl.textContent = '無步驟';
        cntEl.textContent = 'STEP 0 / 0';
        return;
      }
      const st = tr.steps[tr.idx] || tr.steps[0];
      prevBtn.disabled = tr.idx === 0;
      nextBtn.disabled = tr.idx >= tr.steps.length - 1;
      cntEl.textContent = `STEP ${tr.idx + 1} / ${tr.steps.length}`;
      noteEl.textContent = st.out ? `目前輸出：${st.out.replace(/\n/g, ' | ')}` : `執行第 ${st.line + 1} 行`;

      const codeHtml = tr.codeLines.map((line, i) => {
        const active = i === st.line;
        return `<div class="px-2 py-0.5 font-mono-code text-xs flex items-center gap-2 ${active ? 'bg-[#1d4ed8] text-white font-bold' : 'text-[#181c20]'}">
          <span class="w-5 text-right opacity-65 shrink-0">${i + 1}</span>
          <span class="whitespace-pre overflow-x-auto">${active ? '▶ ' : '  '}${escapeHtml(line)}</span>
        </div>`;
      }).join('');

      const entries = Object.entries(st.vars || {});
      const scalars = entries.filter(([, v]) => !Array.isArray(v));
      const arrays = entries.filter(([, v]) => Array.isArray(v));

      const scalarHtml = scalars.length
        ? scalars.map(([k, v]) => `<div class="bg-[#f8f6ee] border-2 border-[#181c20] px-2.5 py-1 flex items-center justify-between font-mono-code text-xs">
            <span class="font-bold text-[#475569]">${escapeHtml(k)}</span>
            <span class="font-black text-[#1d4ed8]">${escapeHtml(String(v))}</span>
          </div>`).join('')
        : '<div class="text-xs text-[#475569] font-mono-code">（尚未建立純量變量）</div>';

      const arrHtml = arrays.map(([k, arr]) => `
        <div class="mt-2">
          <div class="font-mono-code text-[11px] font-bold text-[#181c20] mb-1">陣列 ${escapeHtml(k)}（0-based）：</div>
          <div class="flex flex-wrap gap-1 font-mono-code">
            ${arr.map((val, idx) => `<div class="border-2 border-[#181c20] bg-[#f8f6ee] px-2 py-1 text-center min-w-[38px]">
              <div class="text-[9px] text-[#475569]">[${idx}]</div>
              <div class="text-xs font-black text-[#181c20]">${escapeHtml(typeof val === 'object' ? JSON.stringify(val) : String(val))}</div>
            </div>`).join('')}
          </div>
        </div>`).join('');

      canvasEl.innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        <div class="lg:col-span-6 bg-[#f8f6ee] border-2 border-[#181c20] py-1 max-h-[260px] overflow-y-auto">${codeHtml}</div>
        <div class="lg:col-span-6 space-y-2">
          <div class="font-mono-code text-[11px] font-bold text-[#181c20]">即時變量追蹤表：</div>
          <div class="grid grid-cols-2 gap-1.5">${scalarHtml}</div>
          ${arrHtml}
        </div>
      </div>`;
    }

    async function triggerLiveTrace(slot, code, stdinStr) {
      const tr = liveTraces[slot];
      if (tr.timer) { clearInterval(tr.timer); tr.timer = null; }
      if (slot === 'quest') document.getElementById('questTraceWrap').classList.remove('hidden');
      const res = await runLiveTrace(code, stdinStr);
      if (res.error && (!res.steps || !res.steps.length)) {
        const cEl = document.getElementById(slot === 'quest' ? 'qTraceCanvas' : 'tbTraceCanvas');
        cEl.innerHTML = `<div class="text-xs font-mono-code font-bold text-[#b91c1c]">追蹤錯誤：${escapeHtml(res.error)}</div>`;
        playError();
        return;
      }
      tr.codeLines = code.split('\n');
      tr.steps = res.steps || [];
      tr.idx = 0;
      renderLiveTracePanel(slot);
      playTone(540, 0.05);
    }

    function wireLiveTraceControls(slot, prevId, nextId, autoId) {
      document.getElementById(prevId).addEventListener('click', () => {
        const tr = liveTraces[slot];
        if (tr.idx > 0) { tr.idx -= 1; renderLiveTracePanel(slot); }
      });
      document.getElementById(nextId).addEventListener('click', () => {
        const tr = liveTraces[slot];
        if (tr.idx < tr.steps.length - 1) { tr.idx += 1; renderLiveTracePanel(slot); }
      });
      document.getElementById(autoId).addEventListener('click', () => {
        const tr = liveTraces[slot];
        if (tr.timer) { clearInterval(tr.timer); tr.timer = null; return; }
        if (!tr.steps.length) return;
        tr.idx = 0; renderLiveTracePanel(slot);
        tr.timer = setInterval(() => {
          if (tr.idx >= tr.steps.length - 1) { clearInterval(tr.timer); tr.timer = null; }
          else { tr.idx += 1; renderLiveTracePanel(slot); playTone(480 + (tr.idx % 8) * 30, 0.03); }
        }, 950);
      });
    }

    // =========================================================================
    // MING TAK TEXTBOOK CODE BANK ENGINE (D1 + D2 + ELECTIVE C)
    // =========================================================================
    const TB_DONE_KEY = 'hkdse_py_class_tb_done_v1';
    const tbState = { book: 'ALL', origin: 'ALL', query: '', activeId: TEXTBOOK_EXAMPLES[0].id, practice: true, done: {} };
    tbState.done = {}; // 例題進度一律由 Google Sheet 載入，不讀取本機快取

    function makeBlankedCode(ex) {
      return ex.starter || '';
    }

    function renderTextbookList() {
      const listEl = document.getElementById('tbExampleList');
      const doneCnt = Object.keys(tbState.done).length;
      const tbPctNow = TEXTBOOK_EXAMPLES.length ? Math.round((doneCnt / TEXTBOOK_EXAMPLES.length) * 100) : 0;
      const tbDoneCntEl = document.getElementById('tbDoneCount');
      if (tbDoneCntEl) tbDoneCntEl.textContent = `${doneCnt} / ${TEXTBOOK_EXAMPLES.length} 題`;
      const tbDoneBigEl = document.getElementById('tbDoneBig');
      if (tbDoneBigEl) tbDoneBigEl.textContent = String(doneCnt);
      const tbMasteryEl = document.getElementById('tbMasteryPct');
      if (tbMasteryEl) tbMasteryEl.textContent = `${tbPctNow}%`;
      const tbArc = document.getElementById('tbGaugeArc');
      if (tbArc) tbArc.setAttribute('stroke-dashoffset', String(126 - (126 * tbPctNow) / 100));
      const tbNeedle = document.getElementById('tbGaugeNeedle');
      if (tbNeedle) tbNeedle.setAttribute('transform', `rotate(${-90 + (180 * tbPctNow) / 100} 50 48)`);

      // Smart dynamic origin filter: hide when current book only has 1 sourceKind (e.g. D1/D2 have no textbook; CP/WB have no concept)
      const bookPool = TEXTBOOK_EXAMPLES.filter((ex) => tbState.book === 'ALL' || ex.book === tbState.book);
      const tbOrigCnt = bookPool.filter((ex) => ex.sourceKind === 'textbook').length;
      const cpOrigCnt = bookPool.filter((ex) => ex.sourceKind === 'concept').length;
      const origWrap = document.getElementById('tbOriginFilters');
      if (origWrap) {
        if (tbOrigCnt === 0 || cpOrigCnt === 0) {
          origWrap.classList.add('hidden');
          tbState.origin = 'ALL';
        } else {
          origWrap.classList.remove('hidden');
          const bAll = origWrap.querySelector('[data-origin="ALL"]');
          const bTb = origWrap.querySelector('[data-origin="textbook"]');
          const bCp = origWrap.querySelector('[data-origin="concept"]');
          if (bAll) bAll.textContent = `全部 (${bookPool.length})`;
          if (bTb) bTb.textContent = `課本原題 (${tbOrigCnt})`;
          if (bCp) bCp.textContent = `概念示範 (${cpOrigCnt})`;
          origWrap.querySelectorAll('[data-origin]').forEach((b) => {
            const act = b.getAttribute('data-origin') === tbState.origin;
            b.className = act
              ? 'py-1 rounded-sm bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/50'
              : 'py-1 rounded-sm bg-[#0c1422] text-[#94a3b8] border border-[#1e2d44]';
          });
        }
      }
      const q = tbState.query.trim().toLowerCase();
      const filtered = TEXTBOOK_EXAMPLES.filter((ex) => {
        if (tbState.book !== 'ALL' && ex.book !== tbState.book) return false;
        if (tbState.origin !== 'ALL' && ex.sourceKind !== tbState.origin) return false;
        if (q && !(ex.id + ' ' + ex.chapter + ' ' + (ex.sourceTag || '') + ' ' + ex.title + ' ' + (ex.taskPrompt || '') + ' ' + ex.concept + ' ' + (ex.starter || '')).toLowerCase().includes(q)) return false;
        return true;
      });
      listEl.innerHTML = filtered.map((ex) => {
        const active = ex.id === tbState.activeId;
        const ok = Boolean(tbState.done[ex.id]);
        const bookCls = ex.book === 'D1' ? 'text-[#38bdf8]' : (ex.book === 'D2' ? 'text-[#60a5fa]' : (ex.book === 'CP' ? 'text-[#fbbf24]' : (ex.book === 'WB' ? 'text-[#c084fc]' : 'text-[#34d399]')));
        return `<button data-tbid="${ex.id}" class="w-full text-left p-2.5 rounded-sm border transition ${active ? 'bg-[#111c2b] border-[#38bdf8] text-white' : 'bg-[#090d14] border-[#1b2430] text-[#cbd5e1] hover:border-[#324052]'}">
          <div class="flex items-center justify-between font-mono-code text-[10px] mb-0.5">
            <span class="${ex.sourceKind === 'textbook' ? 'text-[#cbd5e1]' : 'text-[#7c93b0]'} truncate pr-2">${escapeHtml(ex.sourceTag || ex.page || ex.chapter)}</span>
            <span class="text-[#10d981] font-bold">${ok ? '✓ 已通關' : ''}</span>
          </div>
          <div class="text-xs font-bold leading-snug">${escapeHtml(ex.title)}</div>
        </button>`;
      }).join('') || '<div class="text-xs text-[#64748b] p-3">沒有符合關鍵字的課本例題。</div>';

      listEl.querySelectorAll('[data-tbid]').forEach((b) => {
        b.addEventListener('click', () => {
          tbState.activeId = b.getAttribute('data-tbid');
          loadTextbookExample(tbState.activeId);
          renderTextbookList();
          if (window.innerWidth < 1024) applyTbSidebarLayout(false);
        });
      });
    }

    function loadTextbookExample(id) {
      const ex = TEXTBOOK_EXAMPLES.find((e) => e.id === id) || TEXTBOOK_EXAMPLES[0];
      tbState.activeId = ex.id;
      document.getElementById('tbActiveBookBadge').textContent = ex.chapter;
      document.getElementById('tbActiveIdBadge').textContent = ex.id;
      const pgBadge = document.getElementById('tbActivePageBadge');
      if (pgBadge) {
        pgBadge.textContent = ex.sourceTag || ex.page || '';
        pgBadge.className = ex.sourceKind === 'textbook'
          ? 'px-2 py-0.5 rounded-[2px] bg-[#10b981]/15 text-[#6ee7b7] border border-[#10b981]/35 font-semibold'
          : 'px-2 py-0.5 rounded-[2px] bg-[#131b26] text-[#94a3b8] border border-[#243042] font-normal';
      }
      document.getElementById('tbActiveStatusBadge').classList.toggle('hidden', !tbState.done[ex.id]);
      document.getElementById('tbActiveTitle').textContent = ex.title;
      const tpEl = document.getElementById('tbActiveTaskPrompt');
      if (tpEl) tpEl.textContent = ex.taskPrompt || ex.concept || '';
      document.getElementById('tbActiveConcept').textContent = ex.concept;
      document.getElementById('tbActivePseudo').textContent = ex.pseudoNote;
      const codeEl = document.getElementById('tbCodeInput');
      const passedTb = (tbState.done[ex.id] && state.passedCode && state.passedCode[ex.id]) ? state.passedCode[ex.id] : null;
      const cachedTb = loadDraft('tb', ex.id);
      codeEl.value = (passedTb !== null) ? passedTb : ((cachedTb !== null) ? cachedTb : (ex.starter || ''));
      updateLineGutter(codeEl, document.getElementById('tbLineGutter'));
      const cachedIn = loadDraft('tb_in', ex.id);
      const useIn = (cachedIn !== null) ? cachedIn : (ex.stdin || '');
      document.getElementById('tbStdinInput').value = useIn;
      const dynExp = (useIn === (ex.stdin || '')) ? (ex.expected || '（無預期輸出）') : computeTbExpected(ex.id, useIn, ex.expected || '');
      document.getElementById('tbExpectedPre').textContent = dynExp;
      renderZhChipsBar('tbZhBar', 'tbCodeInput', ex.zhChips || []);
      document.getElementById('tbOutputPre').textContent = '按「運行」或「核對輸出」...';
      document.getElementById('tbFeedbackBox').classList.add('hidden');
      const tTbBox = document.getElementById('teacherTbAnsBox'); if (tTbBox) tTbBox.classList.add('hidden');
      syncTeacherUI();
      document.getElementById('tbEditorModeTag').textContent = '完成以下程式';
    }

    async function runTextbookCode(doCheck) {
      const ex = TEXTBOOK_EXAMPLES.find((e) => e.id === tbState.activeId) || TEXTBOOK_EXAMPLES[0];
      const code = document.getElementById('tbCodeInput').value;
      const customInVal = document.getElementById('tbStdinInput').value;
      const isCustomIn = customInVal.trim() !== String(ex.stdin || '').trim();
      const dynExp = isCustomIn ? computeTbExpected(ex.id, customInVal, ex.expected || '') : (ex.expected || '');
      document.getElementById('tbExpectedPre').textContent = dynExp || '（無預期輸出）';
      const stdinVal = doCheck ? ex.stdin : customInVal;
      const outEl = document.getElementById('tbOutputPre');
      const fbEl = document.getElementById('tbFeedbackBox');
      fbEl.classList.add('hidden');

      const astRes = checkCodeAst(code, []);
      if (astRes.syntax_error) {
        outEl.textContent = astRes.syntax_error;
        playError();
        return;
      }
      if (doCheck && (code.includes('填答案') || code.includes('請補全此行'))) {
        fbEl.className = 'rounded-sm px-3.5 py-2.5 text-xs font-bold bg-[#f5a623]/15 border border-[#f5a623]/40 text-[#fde68a]';
        fbEl.textContent = '請先填妥所有「#_____填答案_____」空位，再提交核對。';
        fbEl.classList.remove('hidden');
        playError();
        return;
      }
      if (doCheck && astRes.issues.length > 0) {
        fbEl.className = 'rounded-sm px-3.5 py-2.5 text-xs font-bold bg-[#f5a623]/15 border border-[#f5a623]/40 text-[#fde68a]';
        fbEl.innerHTML = '標準 Python 規範未通過：' + astRes.issues.map(escapeHtml).join('；');
        fbEl.classList.remove('hidden');
        playError();
        return;
      }

      const res = await runPythonCode(code, stdinVal);
      outEl.textContent = res.ok ? (res.output || '（執行成功，無輸出）') : `執行錯誤：${res.error}`;
      if (!doCheck) {
        if (res.ok) playTone(520, 0.05); else playError();
        return;
      }
      fbEl.className = 'rounded-sm px-3.5 py-2.5 text-xs font-bold bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#bae6fd]';
      fbEl.textContent = '正在雲端核對輸出...';
      fbEl.classList.remove('hidden');
      const cloudRes = await callCloudGrader({
        action: 'grade',
        kind: 'textbook',
        id: ex.id,
        output: res.ok ? res.output : '',
        hasError: !res.ok
      });
      if (cloudRes.status !== 'ok') {
        fbEl.className = 'rounded-sm px-3.5 py-2.5 text-xs font-bold bg-[#f5a623]/15 border border-[#f5a623]/40 text-[#fde68a]';
        fbEl.textContent = cloudRes.message || '雲端核對暫時未能連線。';
        playError();
        return;
      }
      if (cloudRes.passed) {
        if (cloudRes.expected) document.getElementById('tbExpectedPre').textContent = cloudRes.expected;
        tbState.done[ex.id] = true;
        fbEl.className = 'rounded-sm px-3.5 py-2.5 text-xs font-bold bg-[#10d981]/15 border border-[#10d981]/45 text-[#a7f3d0]';
        fbEl.textContent = `✓ PASS // 輸出與課本例題 ${ex.id} 完全一致，且符合標準 Python 寫法！`;
        fbEl.classList.remove('hidden');
        document.getElementById('tbActiveStatusBadge').classList.remove('hidden');
        renderTextbookList();
        playSuccess();
        if (typeof window.showToast === 'function') {
          window.showToast(`課本例題 ${ex.id} 核對通過！`, 'success', 2800);
        }
        if (state.student) {
          syncToGoogleSheet({
            cls: state.student.cls, no: state.student.no, name: state.student.name,
            lesson: ex.chapter, levelId: ex.id, tier: '課本例題',
          practiceMeta: {
            sourceTab: '課本例題',
            unit: ex.chapter || ex.book || '',
            hierCode: ex.id || '',
            qType: '課本例題',
            difficulty: ex.book || '課本',
            ability: ex.concept || ex.title || '',
            progressPct: `${Math.round((Object.keys(tbState.done || {}).length / TEXTBOOK_EXAMPLES.length) * 100)}% (${Object.keys(tbState.done || {}).length}/${TEXTBOOK_EXAMPLES.length})`
          },
            passed: true, xp: state.xp, penalty: state.penalty, attempts: 1,
            tabSwitches: state.tabSwitches, awaySeconds: state.awaySeconds,
            aiFlags: astRes.ai_flags || [], code: code.slice(0, 1500)
          });
        }
      } else {
        fbEl.className = 'rounded-sm px-3.5 py-2.5 text-xs font-bold bg-[#f59e0b]/15 border border-[#f59e0b]/45 text-[#fde68a]';
        fbEl.textContent = '✗ 實際輸出與課本預期輸出不符，請對照下方左右兩欄再試。';
        fbEl.classList.remove('hidden');
        playError();
      }
    }

    // =========================================================================
    // INIT & EVENT LISTENERS
    // =========================================================================

    // =========================================================================
    // IPAD TOUCH CODING TOOLBAR & HIDDEN 5-TAP TEACHER GESTURE
    // =========================================================================
    function initIpadTouchToolbars() {
      const keys = [
        { label: '⇥ 縮排', act: 'indent' },
        { label: '⇤ 退格', act: 'dedent' },
        { label: '( )', ins: '()', back: 1 },
        { label: '[ ]', ins: '[]', back: 1 },
        { label: '" "', ins: '""', back: 1 },
        { label: ':', ins: ':', back: 0 },
        { label: '=', ins: ' = ', back: 0 },
        { label: '==', ins: ' == ', back: 0 },
        { label: '!=', ins: ' != ', back: 0 },
        { label: '<=', ins: ' <= ', back: 0 },
        { label: '>=', ins: ' >= ', back: 0 },
        { label: '//', ins: ' // ', back: 0 },
        { label: '%', ins: ' % ', back: 0 },
        { label: '_', ins: '_', back: 0 }
      ];
      document.querySelectorAll('.ipad-key-bar[data-target-editor]').forEach((bar) => {
        const targetId = bar.getAttribute('data-target-editor');
        bar.innerHTML = keys.map((k, idx) => `<button type="button" class="ipad-key-btn" data-kidx="${idx}">${escapeHtml(k.label)}</button>`).join('');
        bar.querySelectorAll('.ipad-key-btn').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const ed = document.getElementById(targetId);
            if (!ed) return;
            const k = keys[Number(btn.getAttribute('data-kidx'))];
            const s = ed.selectionStart || 0;
            const en = ed.selectionEnd || 0;
            if (k.act === 'indent') {
              ed.value = ed.value.slice(0, s) + '    ' + ed.value.slice(en);
              ed.selectionStart = ed.selectionEnd = s + 4;
            } else if (k.act === 'dedent') {
              const lineStart = ed.value.lastIndexOf('\n', s - 1) + 1;
              if (ed.value.slice(lineStart, lineStart + 4) === '    ') {
                ed.value = ed.value.slice(0, lineStart) + ed.value.slice(lineStart + 4);
                const np = Math.max(lineStart, s - 4);
                ed.selectionStart = ed.selectionEnd = np;
              }
            } else {
              ed.value = ed.value.slice(0, s) + k.ins + ed.value.slice(en);
              const np = s + k.ins.length - (k.back || 0);
              ed.selectionStart = ed.selectionEnd = np;
            }
            ed.focus();
            ed.dispatchEvent(new Event('input'));
          });
        });
      });

      // Hidden 5-tap on ICT - PYTHON brand badge within 2.5s opens Teacher Sync Modal on iPad
      let tapCount = 0, tapTimer = null;
      const brandBtn = document.getElementById('brandHomeBtn');
      if (brandBtn) {
        brandBtn.addEventListener('click', () => {
          tapCount += 1;
          clearTimeout(tapTimer);
          if (tapCount >= 5) {
            tapCount = 0;
            const m = document.getElementById('teacherSyncModal');
            if (m) m.classList.remove('hidden');
          } else {
            tapTimer = setTimeout(() => { tapCount = 0; }, 2200);
          }
        });
      }
    }

    window.addEventListener('DOMContentLoaded', () => {
      if (typeof lucide !== 'undefined') lucide.createIcons();
      updateSyncTag();

      document.getElementById('brandHomeBtn').addEventListener('click', () => switchMode('home'));
      document.getElementById('modeHomeBtn').addEventListener('click', () => switchMode('home'));
      document.getElementById('modeQuestBtn').addEventListener('click', () => { switchMode('quest'); loadLevel(state.currentLevelIdx); });
        
      const wireExtraTrace = (slot, pfx) => {
        document.getElementById(`${pfx}TracePrevBtn`).addEventListener('click', () => {
          const tr = liveTraces[slot]; if (tr.idx > 0) { tr.idx -= 1; renderLiveTracePanel(slot); }
        });
        document.getElementById(`${pfx}TraceNextBtn`).addEventListener('click', () => {
          const tr = liveTraces[slot]; if (tr.idx < tr.steps.length - 1) { tr.idx += 1; renderLiveTracePanel(slot); }
        });
        document.getElementById(`${pfx}TraceAutoBtn`).addEventListener('click', () => {
          const tr = liveTraces[slot];
          const b = document.getElementById(`${pfx}TraceAutoBtn`);
          if (tr.timer) { clearInterval(tr.timer); tr.timer = null; b.textContent = '▶ 自動'; return; }
          if (tr.idx >= tr.steps.length - 1) tr.idx = 0;
          b.textContent = '⏸ 暫停';
          tr.timer = setInterval(() => {
            if (tr.idx >= tr.steps.length - 1) { clearInterval(tr.timer); tr.timer = null; b.textContent = '▶ 自動'; return; }
            tr.idx += 1; renderLiveTracePanel(slot);
          }, 750);
        });
      };

      wireExtraTrace('dr', 'dr');

      document.getElementById('drTraceBtn').addEventListener('click', async () => {
        const lvl = LEVELS[state.currentLevelIdx];
        if (!lvl || lvl.type !== 'dryrun') return;
        if (!state.completed[lvl.id] && !(state.attempts[lvl.id] > 0)) {
          const fb = document.getElementById('drFeedback');
          fb.className = 'border-l-2 border-[#f5a623] bg-[#f5a623]/12 px-4 py-3 text-xs font-bold text-[#fde68a]';
          fb.textContent = '請先自行提交一次預測輸出，之後便可開啟逐步空運行追蹤對照每步變量！';
          fb.classList.remove('hidden');
          return;
        }
        const res = await runLiveTrace(lvl.code || '', '');
        liveTraces.dr = { codeLines: (lvl.code || '').split('\n'), steps: res.steps || [], idx: 0, timer: null };
        document.getElementById('drTraceWrap').classList.remove('hidden');
        renderLiveTracePanel('dr');
      });

      // Init iPad touch toolbars & hidden 5-tap teacher gesture
      initIpadTouchToolbars();
        document.getElementById('modeTextbookBtn').addEventListener('click', () => switchMode('textbook'));
        document.getElementById('modeExtraBtn')?.addEventListener('click', () => switchMode('extra'));
            document.querySelectorAll('#homeTermFilters [data-term]').forEach((b) => {
        b.addEventListener('click', () => {
          homeTermFilter = b.getAttribute('data-term');
          document.querySelectorAll('#homeTermFilters [data-term]').forEach((x) => {
            const on = x.getAttribute('data-term') === homeTermFilter;
            x.className = on ? 'px-2.5 py-1 rounded-[3px] bg-[#38bdf8] text-[#04131e]' : 'px-2.5 py-1 rounded-[3px] text-[#9aa7b8] hover:text-white transition';
          });
          renderHomeRoadmap();
        });
      });
      document.querySelectorAll('#tbOriginFilters [data-origin]').forEach((btn) => {
        btn.addEventListener('click', () => {
          tbState.origin = btn.getAttribute('data-origin');
          document.querySelectorAll('#tbOriginFilters [data-origin]').forEach((b) => {
            const active = b === btn;
            b.className = active
              ? 'py-1 rounded-sm bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/50'
              : 'py-1 rounded-sm bg-[#0c1422] text-[#94a3b8] border border-[#1e2d44]';
          });
          renderTextbookList();
        });
      });
      document.querySelectorAll('#tbBookFilters [data-book]').forEach((b) => {
        b.addEventListener('click', () => {
          tbState.book = b.getAttribute('data-book');
          document.querySelectorAll('#tbBookFilters [data-book]').forEach((x) => {
            const on = x.getAttribute('data-book') === tbState.book;
            x.className = on ? 'py-1.5 rounded-sm bg-[#10b981] text-[#04140e]' : 'py-1.5 rounded-sm bg-[#132035] text-[#cbd5e1] border border-[#243754]';
          });
          renderTextbookList();
        });
      });
      document.getElementById('tbSearchInput').addEventListener('input', (e) => { tbState.query = e.target.value; renderTextbookList(); });
      document.getElementById('tbResetCodeBtn').addEventListener('click', async () => {
        const ok = await window.showConfirmModal({
          title: '重設課本例題程式碼',
          message: '確定要清除目前編輯內容並恢復本例題的初始程式碼嗎？',
          confirmText: '確定重設',
          cancelText: '取消',
          danger: true
        });
        if (!ok) return;
        clearDraft('tb', tbState.activeId);
        clearDraft('tb_in', tbState.activeId);
        loadTextbookExample(tbState.activeId);
        if (typeof window.showToast === 'function') window.showToast('已重設課本例題程式碼', 'info', 2200);
      });
      document.getElementById('tbRunBtn').addEventListener('click', () => runTextbookCode(false));
      document.getElementById('tbCheckBtn').addEventListener('click', () => runTextbookCode(true));
      // Wire Live Per-Lesson & Textbook Dry-Run Trace Controls
      wireLiveTraceControls('quest', 'qTracePrevBtn', 'qTraceNextBtn', 'qTraceAutoBtn');
      wireLiveTraceControls('tb', 'tbTracePrevBtn', 'tbTraceNextBtn', 'tbTraceAutoBtn');
      document.getElementById('questTraceBtn').addEventListener('click', () => {
        const lvl = LEVELS[state.currentLevelIdx];
        const manualIn = document.getElementById('manualStdin').value;
        const stdinUse = manualIn || (lvl.tests && lvl.tests[0] ? lvl.tests[0].stdin : '');
        triggerLiveTrace('quest', document.getElementById('pyInput').value, stdinUse);
      });
      document.getElementById('tbTraceBtn').addEventListener('click', () => {
        const ex = TEXTBOOK_EXAMPLES.find((e) => e.id === tbState.activeId) || TEXTBOOK_EXAMPLES[0];
        const codeToTrace = document.getElementById('tbCodeInput').value;
        triggerLiveTrace('tb', codeToTrace, document.getElementById('tbStdinInput').value || ex.stdin);
      });
      // Hidden teacher sync shortcut (Ctrl+Shift+T)
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toUpperCase() === 'T') {
          e.preventDefault();
          document.getElementById('gasUrlInput').value = getGasUrl();
          document.getElementById('googleClientIdInput').value = getGoogleClientId();
          document.getElementById('allowedDomainInput').value = getAllowedDomain();
          document.getElementById('gasSaveMsg').classList.add('hidden');
          document.getElementById('teacherSyncModal').classList.remove('hidden');
        }
      });

      // Editor smart Tab / Enter + Anti-AI Paste/Drop Block + Line Numbers
      const pyInput = document.getElementById('pyInput');
      const pyGutter = document.getElementById('pyLineGutter');
      pyInput.addEventListener('input', () => {
        updateLineGutter(pyInput, pyGutter);
        const curLv = LEVELS[state.currentLevelIdx];
        if (curLv) saveDraft('quest', curLv.id, pyInput.value);
      });
      pyInput.addEventListener('scroll', () => { pyGutter.scrollTop = pyInput.scrollTop; });
      const blockPyPaste = (e) => {
        if (isTeacherUser()) return;
        e.preventDefault();
        const box = document.getElementById('astAlertBox');
        document.getElementById('astAlertText').textContent = '已攔截複製貼上（已即時記錄至老師進度表），請親手輸入或使用上方中文詞彙按鈕。';
        box.classList.remove('hidden');
        const curLv = LEVELS[state.currentLevelIdx];
        logBlockedPasteInstant(curLv ? curLv.lcode : '計分練習', curLv ? curLv.id : 'QUEST');
      };
      pyInput.addEventListener('paste', blockPyPaste);
      pyInput.addEventListener('drop', blockPyPaste);

      const drIn = document.getElementById('drUserInput');
      if (drIn) {
        drIn.addEventListener('input', () => {
          const curLv = LEVELS[state.currentLevelIdx];
          if (curLv) saveDraft('dr', curLv.id, drIn.value);
        });
        drIn.addEventListener('paste', (e) => {
          if (isTeacherUser()) return;
          e.preventDefault();
          const curLv = LEVELS[state.currentLevelIdx];
          logBlockedPasteInstant(curLv ? curLv.lcode : '空運行', curLv ? curLv.id : 'DRYRUN');
        });
      }

      const tbEd = document.getElementById('tbCodeInput');
      const tbStIn = document.getElementById('tbStdinInput');
      if (tbEd) {
        tbEd.addEventListener('input', () => {
          updateLineGutter(tbEd, document.getElementById('tbLineGutter'));
          if (tbState.activeId) saveDraft('tb', tbState.activeId, tbEd.value);
        });
        const blockTbPaste = (e) => {
          if (isTeacherUser()) return;
          e.preventDefault();
          const fb = document.getElementById('tbFeedbackBox');
          fb.className = 'px-3.5 py-2.5 text-xs font-bold rounded-sm bg-[#f43f5e]/15 border border-[#f43f5e]/45 text-[#fecdd3]';
          fb.textContent = '已攔截複製貼上（已即時記錄至老師進度表），請親手輸入或點選上方中文詞彙。';
          fb.classList.remove('hidden');
          logBlockedPasteInstant('例題庫', tbState.activeId || 'TEXTBOOK');
        };
        tbEd.addEventListener('paste', blockTbPaste);
        tbEd.addEventListener('drop', blockTbPaste);
      }
      if (tbStIn) {
        tbStIn.addEventListener('input', () => {
          const ex = TEXTBOOK_EXAMPLES.find((x) => x.id === tbState.activeId);
          if (!ex) return;
          saveDraft('tb_in', ex.id, tbStIn.value);
          const dyn = (tbStIn.value === (ex.stdin || '')) ? (ex.expected || '（無預期輸出）') : computeTbExpected(ex.id, tbStIn.value, ex.expected || '');
          document.getElementById('tbExpectedPre').textContent = dyn || '（無預期輸出）';
        });
      }
      const tbResetInBtn = document.getElementById('tbResetStdinBtn');
      if (tbResetInBtn) {
        tbResetInBtn.addEventListener('click', () => {
          const ex = TEXTBOOK_EXAMPLES.find((x) => x.id === tbState.activeId);
          if (!ex) return;
          clearDraft('tb_in', ex.id);
          document.getElementById('tbStdinInput').value = ex.stdin || '';
          document.getElementById('tbExpectedPre').textContent = ex.expected || '（無預期輸出）';
        });
      }
      pyInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleRunOrCheck(false); return; }
        if (e.key === 'Tab') {
          e.preventDefault();
          const s = pyInput.selectionStart, end = pyInput.selectionEnd;
          pyInput.value = pyInput.value.slice(0, s) + '    ' + pyInput.value.slice(end);
          pyInput.selectionStart = pyInput.selectionEnd = s + 4;
          updateLineGutter(pyInput, pyGutter);
        } else if (e.key === 'Enter') {
          const s = pyInput.selectionStart;
          const lineStart = pyInput.value.lastIndexOf('\n', s - 1) + 1;
          const curLine = pyInput.value.slice(lineStart, s);
          const indent = (curLine.match(/^\s*/) || [''])[0];
          const extra = curLine.trimEnd().endsWith(':') ? '    ' : '';
          e.preventDefault();
          pyInput.value = pyInput.value.slice(0, s) + '\n' + indent + extra + pyInput.value.slice(pyInput.selectionEnd);
          pyInput.selectionStart = pyInput.selectionEnd = s + 1 + indent.length + extra.length;
          updateLineGutter(pyInput, pyGutter);
        }
      });

      document.getElementById('toggleNotesBtn').addEventListener('click', () => document.getElementById('lessonNotesDrawer').classList.toggle('hidden'));
      document.getElementById('runPyBtn').addEventListener('click', () => handleRunOrCheck(false));
      document.getElementById('checkPyBtn').addEventListener('click', () => handleRunOrCheck(true));
      document.getElementById('toggleHintBtn').addEventListener('click', (e) => {
        const cur = LEVELS[state.currentLevelIdx];
        if (!cur) return;
        if (cur.diff === 'hard' || !cur.hint) {
          if (typeof window.closePopover === 'function') window.closePopover();
          if (typeof window.showToast === 'function') {
            window.showToast('進階題不設提示，請嘗試自行拆解算法或查閱課堂筆記。', 'warning', 2800);
          }
          return;
        }
        const safeHint = String(cur.hint).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        window.openPopover({
          anchorEl: e.currentTarget,
          key: `hint_${cur.id}`,
          html: `
            <div class="flex items-center justify-between gap-2 pb-1.5 border-b border-[#1d2b40]">
              <span class="font-mono-code text-[11px] font-bold text-[#fbbf24]">💡 解題提示 · ${cur.id}</span>
              <button type="button" data-pop-close class="text-xs text-[#94a3b8] hover:text-white px-1" aria-label="關閉">✕</button>
            </div>
            <p class="text-xs text-[#e2e8f0] leading-relaxed">${safeHint}</p>
            <div class="flex items-center justify-end gap-2 pt-1">
              <button type="button" data-pop-notes class="hw-btn px-2.5 py-1 rounded-sm bg-[#0c2236] hover:bg-[#12314d] border border-[#38bdf8]/45 text-[11px] font-bold text-[#38bdf8]">展開課堂筆記</button>
              <button type="button" data-pop-close class="hw-btn px-2.5 py-1 rounded-sm bg-[#10b981] hover:bg-[#34d399] text-[#03150e] text-[11px] font-bold">知道了</button>
            </div>
          `,
          onBind: (cardEl, close) => {
            cardEl.querySelectorAll('[data-pop-close]').forEach((b) => b.addEventListener('click', close));
            const notesBtn = cardEl.querySelector('[data-pop-notes]');
            if (notesBtn) {
              notesBtn.addEventListener('click', () => {
                const drawer = document.getElementById('lessonNotesDrawer');
                if (drawer) {
                  drawer.classList.remove('hidden');
                  drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                close();
              });
            }
          }
        });
      });
      document.getElementById('resetStarterBtn').addEventListener('click', async () => {
        const ok = await window.showConfirmModal({
          title: '重設程式碼骨架',
          message: '確定要清除目前輸入的程式碼並恢復題目初始骨架嗎？',
          confirmText: '確定重設',
          cancelText: '取消',
          danger: true
        });
        if (!ok) return;
        const cur = LEVELS[state.currentLevelIdx];
        if (cur) clearDraft('quest', cur.id);
        pyInput.value = (cur && cur.starter) || '';
        updateLineGutter(pyInput, pyGutter);
        if (typeof window.showToast === 'function') window.showToast('已重設為題目初始骨架', 'info', 2200);
      });

      // Teacher Mode: On-demand Cloud Answer Reveal (Zero plaintext answers in HTML)
      let lastTeacherPySol = '';
      let lastTeacherTbSol = '';
      const tPyBtn = document.getElementById('teacherRevealPyBtn');
      if (tPyBtn) {
        tPyBtn.addEventListener('click', async () => {
          const box = document.getElementById('teacherPyAnsBox');
          const pre = document.getElementById('teacherPyAnsPre');
          if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
          const lvl = LEVELS[state.currentLevelIdx];
          if (!lvl) return;
          pre.textContent = '正在從雲端驗證老師身分並載入答案...';
          box.classList.remove('hidden');
          const res = await fetchTeacherAnswer('level', lvl.id);
          if (res.status === 'ok' && res.data && res.data.solution) {
            lastTeacherPySol = res.data.solution;
            pre.textContent = res.data.solution;
          } else {
            lastTeacherPySol = '';
            pre.textContent = res.message || '未能載入參考答案，請重新登入老師 Google 帳戶。';
          }
        });
      }
      const tFillPyBtn = document.getElementById('teacherFillPyBtn');
      if (tFillPyBtn) {
        tFillPyBtn.addEventListener('click', () => {
          if (!lastTeacherPySol) return;
          pyInput.value = lastTeacherPySol;
          updateLineGutter(pyInput, pyGutter);
        });
      }
      const tDqBtn = document.getElementById('teacherRevealDqBtn');
      if (tDqBtn) {
        tDqBtn.addEventListener('click', async () => {
          const isStep2 = state.dqStep === 2;
          const box = document.getElementById(isStep2 ? 'dqModelAnsBoxB' : 'dqModelAnsBox');
          if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
          const lvl = LEVELS[state.currentLevelIdx];
          if (!lvl) return;
          const res = await fetchTeacherAnswer('level', lvl.id);
          if (res.status === 'ok' && res.data) {
            const optLetters = ['A', 'B', 'C', 'D'];
            if (isStep2) {
              const corrB = typeof res.data.compareMcqCorrect === 'number' ? `正確選項：${optLetters[res.data.compareMcqCorrect]}\n` : '';
              document.getElementById('dqCompareAns').textContent = corrB + (res.data.compareAns || '');
            } else {
              const corrA = typeof res.data.mcqCorrect === 'number' ? `正確選項：${optLetters[res.data.mcqCorrect]}\n` : '';
              document.getElementById('dqDebugAns').textContent = corrA + (res.data.debugAns || '');
            }
            box.classList.remove('hidden');
          } else {
            const fb = document.getElementById(isStep2 ? 'dqFeedbackB' : 'dqFeedback');
            fb.className = 'border-l-2 border-[#f5a623] bg-[#f5a623]/12 px-4 py-3 text-xs font-bold text-[#fde68a]';
            fb.textContent = res.message || '未能載入參考答案，請重新登入老師 Google 帳戶。';
            fb.classList.remove('hidden');
          }
        });
      }
      const tDrBtn = document.getElementById('teacherRevealDrBtn');
      if (tDrBtn) {
        tDrBtn.addEventListener('click', async () => {
          const box = document.getElementById('drExplainBox');
          if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
          const lvl = LEVELS[state.currentLevelIdx];
          if (!lvl) return;
          const res = await fetchTeacherAnswer('level', lvl.id);
          if (res.status === 'ok' && res.data) {
            document.getElementById('drModelAns').textContent = res.data.answer || '';
            document.getElementById('drExplainText').textContent = res.data.explain || '';
            box.classList.remove('hidden');
          } else {
            const fb = document.getElementById('drFeedback');
            fb.className = 'border-l-2 border-[#f5a623] bg-[#f5a623]/12 px-4 py-3 text-xs font-bold text-[#fde68a]';
            fb.textContent = res.message || '未能載入參考答案，請重新登入老師 Google 帳戶。';
            fb.classList.remove('hidden');
          }
        });
      }
      const tTbBtn = document.getElementById('teacherRevealTbBtn');
      if (tTbBtn) {
        tTbBtn.addEventListener('click', async () => {
          const box = document.getElementById('teacherTbAnsBox');
          const pre = document.getElementById('teacherTbAnsPre');
          if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
          const ex = TEXTBOOK_EXAMPLES.find((e) => e.id === tbState.activeId);
          if (!ex) return;
          pre.textContent = '正在從雲端驗證老師身分並載入答案...';
          box.classList.remove('hidden');
          const res = await fetchTeacherAnswer('textbook', ex.id);
          if (res.status === 'ok' && res.data && res.data.solution) {
            lastTeacherTbSol = res.data.solution;
            pre.textContent = res.data.solution;
          } else {
            lastTeacherTbSol = '';
            pre.textContent = res.message || '未能載入參考答案，請重新登入老師 Google 帳戶。';
          }
        });
      }
      const tFillTbBtn = document.getElementById('teacherFillTbBtn');
      if (tFillTbBtn) {
        tFillTbBtn.addEventListener('click', () => {
          if (!lastTeacherTbSol) return;
          const tbEdEl = document.getElementById('tbCodeInput');
          if (tbEdEl) {
            tbEdEl.value = lastTeacherTbSol;
            updateLineGutter(tbEdEl, document.getElementById('tbLineGutter'));
          }
        });
      }

      // Debug Quiz Check
      const checkDryrunExercise = async () => {
        const lvl = LEVELS[state.currentLevelIdx];
        if (!lvl || lvl.type !== 'dryrun') return;
        const raw = document.getElementById('drUserInput').value;
        const norm = (s) => String(s || '').replace(/\r\n/g, '\n').split('\n').map((x) => x.trim()).filter((x) => x.length > 0).join('\n');
        const userAns = norm(raw);
        const fbEl = document.getElementById('drFeedback');
        state.attempts[lvl.id] = (state.attempts[lvl.id] || 0) + 1;
        if (!userAns) {
          fbEl.className = 'border-l-2 border-[#f5a623] bg-[#f5a623]/12 px-4 py-3 text-sm font-bold text-[#fde68a]';
          fbEl.textContent = '請先輸入你追蹤出的程式輸出。';
          fbEl.classList.remove('hidden');
          return;
        }
        fbEl.className = 'border-l-2 border-[#38bdf8] bg-[#38bdf8]/12 px-4 py-3 text-xs font-bold text-[#bae6fd]';
        fbEl.textContent = '正在雲端核對空運行輸出...';
        fbEl.classList.remove('hidden');
        const res = await callCloudGrader({ action: 'grade', kind: 'level_dryrun', id: lvl.id, userAns });
        if (res.status !== 'ok') {
          fbEl.className = 'border-l-2 border-[#f5a623] bg-[#f5a623]/12 px-4 py-3 text-xs font-bold text-[#fde68a]';
          fbEl.textContent = res.message || '雲端核對暫時未能連線。';
          playError();
          return;
        }
        if (res.passed) {
          document.getElementById('drModelAns').textContent = res.answer || userAns;
          document.getElementById('drExplainText').textContent = res.explain || '';
          document.getElementById('drExplainBox').classList.remove('hidden');
          markPassed(lvl, fbEl, '空運行輸出完全正確！', `DryRun Answer: ${userAns}`, []);
        } else {
          markFailed(lvl, fbEl, '輸出未完全相符，請再逐行檢查變量數值、空格或換行！', `DryRun Attempt: ${userAns}`, []);
        }
      };
      document.getElementById('checkDryrunBtn').addEventListener('click', checkDryrunExercise);
      document.getElementById('drUserInput').addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') checkDryrunExercise();
      });

      function setDqStep(stepNum) {
        if (stepNum === 2 && !state.dqPartADone && !isTeacherUser()) {
          const fb = document.getElementById('dqFeedback');
          fb.className = 'border-l-2 border-[#f5a623] bg-[#f5a623]/12 px-4 py-3 text-xs font-bold text-[#fde68a]';
          fb.textContent = '請先完成並答對【甲部】，先可以進入【乙部】！';
          fb.classList.remove('hidden');
          playError();
          return;
        }
        state.dqStep = stepNum;
        document.getElementById('dqStep1Pane').classList.toggle('hidden', stepNum !== 1);
        document.getElementById('dqStep2Pane').classList.toggle('hidden', stepNum !== 2);
        const t1 = document.getElementById('dqStep1Tab');
        const t2 = document.getElementById('dqStep2Tab');
        t1.textContent = state.dqPartADone ? '① 甲部：除錯 ✓' : '① 甲部：空運行與除錯';
        t1.className = stepNum === 1
          ? 'px-3 py-1.5 rounded-md bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/50 transition'
          : (state.dqPartADone
              ? 'px-3 py-1.5 rounded-md bg-[#10b981]/15 text-[#34d399] border border-[#10b981]/40 transition'
              : 'px-3 py-1.5 rounded-md bg-[#0c1422] text-[#94a3b8] border border-[#1d2b40] transition');
        t2.className = stepNum === 2
          ? 'px-3 py-1.5 rounded-md bg-[#10b981]/20 text-[#34d399] border border-[#10b981]/50 transition'
          : ((state.dqPartADone || isTeacherUser())
              ? 'px-3 py-1.5 rounded-md bg-[#0c1422] text-[#cbd5e1] border border-[#243754] hover:border-[#10b981]/50 transition'
              : 'px-3 py-1.5 rounded-md bg-[#0c1422] text-[#475569] border border-[#1d2b40] opacity-60 cursor-not-allowed transition');
      }
      document.getElementById('dqStep1Tab').addEventListener('click', () => setDqStep(1));
      document.getElementById('dqStep2Tab').addEventListener('click', () => setDqStep(2));
      document.getElementById('dqGoStep2Btn').addEventListener('click', () => setDqStep(2));
      document.getElementById('dqBackStep1Btn').addEventListener('click', () => setDqStep(1));

      // Step 1 Check (Part A)
      document.getElementById('checkDebugQuizBtn').addEventListener('click', async () => {
        const lvl = LEVELS[state.currentLevelIdx];
        const fb = document.getElementById('dqFeedback');
        if (state.selectedMcq === null) {
          fb.className = 'border-l-2 border-[#f5a623] bg-[#f5a623]/12 px-4 py-3 text-xs font-bold text-[#fde68a]';
          fb.textContent = '請先選擇【甲部】的一個答案選項。';
          fb.classList.remove('hidden');
          playError();
          return;
        }
        state.attempts[lvl.id] = (state.attempts[lvl.id] || 0) + 1;
        fb.className = 'border-l-2 border-[#38bdf8] bg-[#38bdf8]/12 px-4 py-3 text-xs font-bold text-[#bae6fd]';
        fb.textContent = '正在雲端核對甲部答案...';
        fb.classList.remove('hidden');
        const res = await callCloudGrader({ action: 'grade', kind: 'level_debug_quiz', part: 'A', id: lvl.id, selectedMcq: state.selectedMcq });
        if (res.status !== 'ok') {
          fb.className = 'border-l-2 border-[#f5a623] bg-[#f5a623]/12 px-4 py-3 text-xs font-bold text-[#fde68a]';
          fb.textContent = res.message || '雲端核對暫時未能連線。';
          playError();
          return;
        }
        if (res.passed) {
          state.dqPartADone = true;
          document.getElementById('dqDebugAns').textContent = res.debugAns || '';
          document.getElementById('dqModelAnsBox').classList.remove('hidden');
          document.getElementById('dqGoStep2Btn').classList.remove('hidden');
          fb.className = 'border-l-2 border-[#10d981] bg-[#10d981]/12 px-4 py-3 text-sm font-bold text-[#a7f3d0]';
          fb.textContent = '甲部答對！請按「進入乙部：算法比較 →」完成餘下部分。';
          setDqStep(1);
          playSuccess();
        } else {
          markFailed(lvl, fb, '甲部選項未啱，請再追蹤一次程式每一行的變量變化。', `PartA_MCQ:${state.selectedMcq}`, []);
        }
      });

      // Step 2 Check (Part B -> Complete Level 5 & Unlock Level 6!)
      document.getElementById('checkDebugPartBBtn').addEventListener('click', async () => {
        const lvl = LEVELS[state.currentLevelIdx];
        const fbB = document.getElementById('dqFeedbackB');
        if (state.selectedMcqB === null) {
          fbB.className = 'border-l-2 border-[#f5a623] bg-[#f5a623]/12 px-4 py-3 text-xs font-bold text-[#fde68a]';
          fbB.textContent = '請先選擇【乙部】的一個答案選項。';
          fbB.classList.remove('hidden');
          playError();
          return;
        }
        state.attempts[lvl.id] = (state.attempts[lvl.id] || 0) + 1;
        fbB.className = 'border-l-2 border-[#38bdf8] bg-[#38bdf8]/12 px-4 py-3 text-xs font-bold text-[#bae6fd]';
        fbB.textContent = '正在雲端核對乙部答案...';
        fbB.classList.remove('hidden');
        const res = await callCloudGrader({ action: 'grade', kind: 'level_debug_quiz', part: 'B', id: lvl.id, selectedMcq: state.selectedMcqB });
        if (res.status !== 'ok') {
          fbB.className = 'border-l-2 border-[#f5a623] bg-[#f5a623]/12 px-4 py-3 text-xs font-bold text-[#fde68a]';
          fbB.textContent = res.message || '雲端核對暫時未能連線。';
          playError();
          return;
        }
        if (res.passed) {
          document.getElementById('dqCompareAns').textContent = res.compareAns || '';
          document.getElementById('dqModelAnsBoxB').classList.remove('hidden');
          markPassed(lvl, fbB, '甲部及乙部全部答對！已解鎖下一題。', `PartA:${state.selectedMcq} | PartB:${state.selectedMcqB}`, []);
        } else {
          markFailed(lvl, fbB, '乙部選項未啱，請再細心比較算法 A 與算法 B 的執行差異。', `PartB_MCQ:${state.selectedMcqB}`, []);
        }
      });

      const goNext = () => {
        const nxt = state.currentLevelIdx + 1;
        if (nxt < LEVELS.length && isChapterUnlocked(LEVELS[nxt].ch)) { loadLevel(nxt); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      };
      document.getElementById('prevLevelBtn').addEventListener('click', () => { if (state.currentLevelIdx > 0) loadLevel(state.currentLevelIdx - 1); });
      document.getElementById('nextLevelBtn').addEventListener('click', goNext);
      document.querySelectorAll('[data-inline-next]').forEach((b) => b.addEventListener('click', goNext));

      // Modals & Mobile Drawer
      const drawerEl = document.getElementById('mobileDrawer');
      const saveSidebarPref = (collapsed) => {
        state.sidebarCollapsed = collapsed;
        state.tbSidebarCollapsed = collapsed;
        state.extraSidebarCollapsed = collapsed;
        try { localStorage.setItem('pl_sidebar_collapsed_v1', collapsed ? '1' : '0'); } catch (e) {}
      };
      const toggleSyllabusMenu = () => {
        if (state.mode === 'textbook') {
          if (window.innerWidth >= 1280) {
            saveSidebarPref(!state.tbSidebarCollapsed);
            applyTbSidebarLayout(false);
          } else {
            const bd = document.getElementById('tbSidebarBackdrop');
            const isOpen = bd && bd.classList.contains('fixed');
            applyTbSidebarLayout(!isOpen);
          }
          return;
        }
        if (state.mode === 'extra') {
          if (window.innerWidth >= 1280) {
            saveSidebarPref(!state.extraSidebarCollapsed);
            applyExtraSidebarLayout(false);
          } else {
            const bd = document.getElementById('prSidebarBackdrop');
            const isOpen = bd && bd.classList.contains('fixed');
            applyExtraSidebarLayout(!isOpen);
          }
          return;
        }
        if (state.mode === 'quest') {
          if (window.innerWidth >= 1280) {
            saveSidebarPref(!state.sidebarCollapsed);
            applySidebarLayout();
          } else {
            drawerEl.classList.toggle('hidden');
          }
        }
      };
      document.getElementById('tbDrawerCloseBtn').addEventListener('click', () => applyTbSidebarLayout(false));
      document.getElementById('tbSidebarBackdrop').addEventListener('click', (e) => {
        if (e.target === e.currentTarget && window.innerWidth < 1280) applyTbSidebarLayout(false);
      });
      document.getElementById('prDrawerCloseBtn')?.addEventListener('click', () => applyExtraSidebarLayout(false));
      document.getElementById('prSidebarBackdrop')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget && window.innerWidth < 1280) applyExtraSidebarLayout(false);
      });
      // Teacher Tools Dropdown toggle & outside-click close
      const _ttBtn = document.getElementById('teacherToolsBtn');
      const _ttMenu = document.getElementById('teacherToolsMenu');
      if (_ttBtn && _ttMenu) {
        _ttBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const willOpen = _ttMenu.classList.contains('hidden');
          _ttMenu.classList.toggle('hidden', !willOpen);
          _ttBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });
        document.addEventListener('click', (e) => {
          if (!_ttMenu.classList.contains('hidden') && !_ttMenu.contains(e.target) && e.target !== _ttBtn) {
            _ttMenu.classList.add('hidden');
            _ttBtn.setAttribute('aria-expanded', 'false');
          }
        });
        _ttMenu.addEventListener('click', (e) => {
          if (e.target.closest('button')) {
            _ttMenu.classList.add('hidden');
            _ttBtn.setAttribute('aria-expanded', 'false');
          }
        });
      }
      window.addEventListener('resize', () => {
        if (state.mode === 'textbook') applyTbSidebarLayout(false);
        else if (state.mode === 'extra') applyExtraSidebarLayout(false);
        else syncTopLeftToggleBtn();
      });
      document.getElementById('mobileMenuBtn').addEventListener('click', toggleSyllabusMenu);
      const openTeacherLvPreview = () => {
        const curLv = LEVELS[state.currentLevelIdx] || LEVELS[0];
        const ch = curLv ? curLv.ch : 1;
        triggerLessonLevelUp(ch, LESSONS[ch - 1], ch < LESSONS.length ? LESSONS[ch] : null, true);
      };
      const tPrevLvBtn = document.getElementById('teacherPreviewLvUpBtn');
      if (tPrevLvBtn) tPrevLvBtn.addEventListener('click', openTeacherLvPreview);
      const hPrevLvBtn = document.getElementById('headerPreviewLvUpBtn');
      if (hPrevLvBtn) hPrevLvBtn.addEventListener('click', openTeacherLvPreview);

      ['levelBadge', 'questLvBadge', 'mobLevelBadge'].forEach((_bid) => {
        const _bel = document.getElementById(_bid);
        if (_bel) _bel.addEventListener('click', () => { if (typeof window.openLevelCardGallery === 'function') window.openLevelCardGallery(); });
      });
      document.getElementById('closeMobileDrawerBtn').addEventListener('click', () => drawerEl.classList.add('hidden'));
      drawerEl.addEventListener('click', (e) => {
        if (e.target === drawerEl) drawerEl.classList.add('hidden');
      });
      function renderSoundToggleIcon(btn, on) {
        if (!btn) return;
        btn.classList.toggle('text-[#34d399]', on);
        btn.classList.toggle('text-[#64748b]', !on);
        btn.innerHTML = on
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'
          : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>';
      }
      renderSoundToggleIcon(document.getElementById('soundToggleBtn'), state.soundOn);
      document.getElementById('soundToggleBtn').addEventListener('click', (e) => {
        state.soundOn = !state.soundOn;
        renderSoundToggleIcon(e.currentTarget, state.soundOn);
        if (typeof window.showToast === 'function') {
          window.showToast(state.soundOn ? '已開啟互動音效' : '已靜音互動音效', 'info', 2000);
        }
      });

      function openLoginModalFlow() {
        document.getElementById('loginErrorMsg').classList.add('hidden');
        const stEl = document.getElementById('loginCloudStatus');
        const hasUser = Boolean(state.student && state.student.email);
        const tok = getTeacherIdToken();
        const isExpired = hasUser && (!tok || isIdTokenExpiredLocally(tok));
        if (isExpired && stEl) {
          stEl.className = 'text-xs font-bold text-[#fbbf24] leading-relaxed';
          stEl.textContent = pendingCloudSyncQueue.length > 0
            ? `🔑 登入憑證已過期，請重新點擊下方 Google 帳戶登入以補寫 ${pendingCloudSyncQueue.length} 筆待同步進度。`
            : '🔑 Google 登入憑證已過期（超過 1 小時），請點擊下方 Google 帳戶重新驗證登入。';
          stEl.classList.remove('hidden');
        } else if (stEl) {
          stEl.classList.add('hidden');
        }
        updateGmailModalUI(isExpired);
        document.getElementById('loginModal').classList.remove('hidden');
      }

      function performUserSignOut() {
        pendingGoogleUser = null;
        try { localStorage.removeItem(ACTIVE_USER_KEY); } catch (e) {}
        state.student = null;
        document.getElementById('headerStudentLabel').textContent = 'Gmail 登入';
        updateGmailModalUI();
        if (typeof syncTeacherUI === 'function') syncTeacherUI();
        if (typeof window.showToast === 'function') window.showToast('已安全登出帳戶', 'info', 2400);
      }

      document.getElementById('studentProfileBtn').addEventListener('click', (e) => {
        const stu = state.student;
        if (!stu || !stu.email) {
          openLoginModalFlow();
          return;
        }
        const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const dispName = esc(stu.name || stu.email.split('@')[0]);
        const dispEmail = esc(stu.email);
        const initial = esc((stu.name || stu.email || 'U').trim().charAt(0).toUpperCase());
        const clearedLv = typeof getClearedLessonCount === 'function' ? getClearedLessonCount() : 0;
        const avatarHtml = stu.picture
          ? `<img src="${esc(stu.picture)}" alt="" class="w-10 h-10 rounded-full border border-[#38bdf8]/55 object-cover shrink-0" />`
          : `<div class="w-10 h-10 rounded-full bg-[#0c2236] border border-[#38bdf8]/55 text-[#38bdf8] font-display font-bold text-sm flex items-center justify-center shrink-0">${initial}</div>`;
        const isTeacher = typeof isTeacherUser === 'function' && isTeacherUser();
        const syncBtnHtml = isTeacher
          ? `<button type="button" data-acct-sync class="w-full text-left px-3 py-2 rounded-sm bg-[#0c1a2e] hover:bg-[#142a48] border border-[#243754] text-xs font-bold text-[#34d399] transition">⚙ 同步設定（老師限定）</button>`
          : '';

        window.openPopover({
          anchorEl: e.currentTarget,
          key: 'account_menu',
          html: `
            <div class="flex items-center gap-3 pb-2.5 border-b border-[#1d2b40]">
              ${avatarHtml}
              <div class="min-w-0 flex-1">
                <div class="text-xs font-bold text-white truncate">${dispName}</div>
                <div class="font-mono-code text-[10px] text-[#94a3b8] truncate">${dispEmail}</div>
                <div class="flex items-center gap-1.5 mt-1 font-mono-code text-[10px]">
                  <span class="px-1.5 py-0.5 rounded bg-[#00f5ff]/15 text-[#00f5ff] border border-[#00f5ff]/35 font-bold">LV.${clearedLv}</span>
                  <span class="px-1.5 py-0.5 rounded bg-[#f59e0b]/15 text-[#fbbf24] border border-[#f59e0b]/35 font-bold">${state.xp} XP</span>
                </div>
              </div>
            </div>
            <div class="space-y-1.5">
              <button type="button" data-acct-profile class="w-full text-left px-3 py-2 rounded-sm bg-[#0c1a2e] hover:bg-[#142a48] border border-[#243754] text-xs font-bold text-[#e2e8f0] transition">👤 個人檔案</button>
              ${syncBtnHtml}
              <button type="button" data-acct-switch class="w-full text-left px-3 py-2 rounded-sm bg-[#0c1a2e] hover:bg-[#142a48] border border-[#243754] text-xs font-bold text-[#38bdf8] transition">🔄 切換帳戶</button>
              <button type="button" data-acct-logout class="w-full text-left px-3 py-2 rounded-sm bg-[#1f0d16] hover:bg-[#2d1220] border border-[#f43f5e]/40 text-xs font-bold text-[#fda4af] transition">🚪 登出</button>
            </div>
          `,
          onBind: (cardEl, close) => {
            cardEl.querySelector('[data-acct-profile]')?.addEventListener('click', () => {
              close();
              if (typeof switchMode === 'function') switchMode('profile');
            });
            cardEl.querySelector('[data-acct-sync]')?.addEventListener('click', () => {
              close();
              document.getElementById('gasUrlInput').value = getGasUrl();
              document.getElementById('googleClientIdInput').value = getGoogleClientId();
              document.getElementById('allowedDomainInput').value = getAllowedDomain();
              document.getElementById('gasSaveMsg').classList.add('hidden');
              document.getElementById('teacherSyncModal').classList.remove('hidden');
            });
            cardEl.querySelector('[data-acct-switch]')?.addEventListener('click', () => {
              close();
              openLoginModalFlow();
            });
            cardEl.querySelector('[data-acct-logout]')?.addEventListener('click', async () => {
              close();
              const ok = await window.showConfirmModal({
                title: '確認登出',
                message: '確定要登出目前的學校 Google 帳戶嗎？',
                confirmText: '確定登出',
                cancelText: '取消',
                danger: true
              });
              if (!ok) return;
              performUserSignOut();
            });
          }
        });
      });
      document.getElementById('closeLoginModalBtn').addEventListener('click', () => document.getElementById('loginModal').classList.add('hidden'));
      const swStuBtn = document.getElementById('switchToStudentViewBtn');
      if (swStuBtn) {
        swStuBtn.addEventListener('click', async () => {
          if (!isTeacherUser()) return;
          window._savedTeacherProfile = { ...state.student };
          const stuProfile = {
            id: 'co.zoee@gmail.com',
            email: 'co.zoee@gmail.com',
            cls: 'TEST',
            no: '00',
            name: '周同學',
            picture: '',
            verifiedGoogle: true,
            teacherMode: false,
            idToken: ''
          };
          loadProfile(stuProfile);
          const cloud = await loadCloudProgressByEmail(stuProfile.email);
          if (cloud) {
            mergeCloudProgress(cloud, { showBanner: true });
          }
          if (typeof renderProgressWidgets === 'function') renderProgressWidgets();
          if (typeof renderSidebars === 'function') renderSidebars();
          if (typeof renderHomeRoadmap === 'function') renderHomeRoadmap();
          if (typeof renderTextbookList === 'function') renderTextbookList();
          if (typeof renderDseList === 'function') renderDseList();
          if (typeof loadLevel === 'function' && typeof LEVELS !== 'undefined' && LEVELS.length) loadLevel(0);
          syncTeacherUI();
          if (typeof window.showToast === 'function') window.showToast('已切換至學生視角（周同學）', 'info', 2600);
        });
      }
      const retTBtn = document.getElementById('returnTeacherViewBtn');
      if (retTBtn) {
        retTBtn.addEventListener('click', async () => {
          if (!window._savedTeacherProfile) return;
          const tProf = { ...window._savedTeacherProfile };
          window._savedTeacherProfile = null;
          loadProfile(tProf);
          const cloud = await loadCloudProgressByEmail(tProf.email);
          if (cloud) {
            mergeCloudProgress(cloud, { showBanner: true });
          }
          if (typeof renderProgressWidgets === 'function') renderProgressWidgets();
          if (typeof renderSidebars === 'function') renderSidebars();
          if (typeof renderHomeRoadmap === 'function') renderHomeRoadmap();
          if (typeof renderTextbookList === 'function') renderTextbookList();
          if (typeof renderDseList === 'function') renderDseList();
          if (typeof loadLevel === 'function' && typeof LEVELS !== 'undefined' && LEVELS.length) loadLevel(state.currentLevelIdx);
          syncTeacherUI();
          if (typeof window.showToast === 'function') window.showToast('已返回老師模式', 'success', 2600);
        });
      }

      

      document.getElementById('gmailSignOutBtn').addEventListener('click', async () => {
        const ok = await window.showConfirmModal({
          title: '確認登出',
          message: '確定要登出目前的學校 Google 帳戶嗎？',
          confirmText: '確定登出',
          cancelText: '取消',
          danger: true
        });
        if (!ok) return;
        performUserSignOut();
      });

      document.getElementById('closeSyncModalBtn').addEventListener('click', () => document.getElementById('teacherSyncModal').classList.add('hidden'));
      document.getElementById('saveGasUrlBtn').addEventListener('click', () => {
        const u = document.getElementById('gasUrlInput').value.trim();
        const cid = document.getElementById('googleClientIdInput').value.trim();
        const dom = document.getElementById('allowedDomainInput').value.trim();
        try {
          if (u) localStorage.setItem(GAS_URL_KEY, u); else localStorage.removeItem(GAS_URL_KEY);
          if (cid) localStorage.setItem(GOOGLE_CID_KEY, cid); else localStorage.removeItem(GOOGLE_CID_KEY);
          if (dom) localStorage.setItem(ALLOWED_DOM_KEY, dom); else localStorage.removeItem(ALLOWED_DOM_KEY);
        } catch (e) {}
        updateSyncTag();
        const msg = document.getElementById('gasSaveMsg');
        msg.textContent = '✓ 已儲存雲端同步與 Gmail 登入設定！';
        msg.classList.remove('hidden');
        playSuccess();
        if (typeof window.showToast === 'function') window.showToast('已儲存雲端同步與登入設定', 'success', 2600);
      });

      // Boot profile + Cloud Progress Restore + UI + Pyodide
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(ACTIVE_USER_KEY) || 'null'); } catch (e) {}
      if (saved && saved.id && saved.email) {
        loadProfile(saved);
        loadCloudProgressByEmail(saved.email, { showBanner: true }).then((cloud) => {
          if (!cloud) return;
          mergeCloudProgress(cloud, { showBanner: true });
        });
      } else {
        document.getElementById('headerStudentLabel').textContent = 'Gmail 登入';
        renderProgressWidgets(); renderSidebars(); renderHomeRoadmap();
        updateGmailModalUI();
        document.getElementById('loginModal').classList.remove('hidden');
      }

      switchMode('home');
      
      window.addEventListener('load', () => { if (!state.student) updateGmailModalUI(); });
      initPyodideEngine();
    });
  
    // =========================================================================
    // SUB-TAB: INTERACTIVE PRACTICE BANK (2-Level Accordion + In-Page Navigator)
    // =========================================================================
    const PRACTICE_TAXONOMY = [{"catNum":1,"catKey":"TOPIC_D1_D2","catTitle":"必修 D1–D2：解難、變量與條件","subs":[["1.1","D1 問題建構與 IPO 流程"],["1.2","D2 變量、運算與條件選擇（選擇題）"],["1.3","D1–D2 Python／偽代碼與寫輸出"]]},{"catNum":2,"catKey":"TOPIC_D3_D6","catTitle":"必修 D3–D6：循環、一維陣列與除錯","subs":[["2.1","循環控制與算法追蹤（選擇題）"],["2.2","一維陣列／列表操作（選擇題）"],["2.3","循環、陣列與除錯實作（編寫／寫輸出）"]]},{"catNum":3,"catKey":"TOPIC_C_2D","catTitle":"選修 C（一）：二維陣列與巢狀循環","subs":[["3.1","二維陣列與進階控制概念"],["3.2","二維陣列 Python／偽代碼編寫"],["3.3","二維陣列與巢狀循環寫輸出"]]},{"catNum":4,"catKey":"TOPIC_C_SUB","catTitle":"選修 C（二）：子程式與模組化設計","subs":[["4.1","子程式、參數與作用域（選擇題）"],["4.2","子程式 Python／偽代碼編寫"],["4.3","子程式追蹤與寫輸出"]]},{"catNum":5,"catKey":"TOPIC_C_DS","catTitle":"選修 C（三）：數據結構（堆疊／隊列／鏈表）","subs":[["5.1","堆疊、隊列與鏈表概念與綜合"],["5.2","數據結構 Python／偽代碼編寫"],["5.3","數據結構追蹤與寫輸出"]]},{"catNum":6,"catKey":"TOPIC_C_SORT_FILE","catTitle":"選修 C（四）：檢索、排序與文字檔案","subs":[["6.1","線性／對分檢索與三種排序法（選擇題與綜合）"],["6.2","檢索與排序（Python／偽代碼／寫輸出）"],["6.3","字串處理與文字檔案操作（讀寫／CSV／RLE）"]]}];
    function getVisiblePracticeBank() {
      return (typeof PRACTICE_BANK !== 'undefined' && Array.isArray(PRACTICE_BANK))
        ? PRACTICE_BANK.filter((q) => !q.hidden)
        : [];
    }

    const practiceState = {
      subTab: 'examples',
      expandedCat: 'TOPIC_D1_D2',
      activeSubCode: '1.1',
      status: 'ALL',
      query: '',
      activeId: getVisiblePracticeBank().length ? getVisiblePracticeBank()[0].id : '',
      selectedOpt: '',
      stripExpanded: false,
      done: {},
      attempts: {},
      aiFlags: {},
      busy: false
    };

    function renderPracticeMd(md) {
      if (!md) return '';
      const codeBlocks = [];
      let text = String(md).replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        const langLbl = lang ? `<div class="text-[10px] font-mono-code text-[#64748b] uppercase pb-1 mb-1.5 border-b border-[#182438]">${escapeHtml(lang)}</div>` : '';
        codeBlocks.push(`<div class="my-2 rounded-sm bg-[#050911] border border-[#1e2d44] border-l-2 border-l-[#38bdf8]/70 p-3 overflow-x-auto">${langLbl}<pre class="font-mono-code text-xs text-[#e2e8f0] leading-relaxed whitespace-pre">${escapeHtml(code.replace(/\n$/, ''))}</pre></div>`);
        return `@@CODEBLOCK_${idx}@@`;
      });

      function fmtInline(s) {
        let out = escapeHtml(s);
        out = out.replace(/\$([^$\n]+)\$/g, (full, expr) => {
          if (/[\u4e00-\u9fff|`|「」『』，。；：]/.test(expr)) return full;
          return expr.trim()
            .replace(/\\rightarrow/g, '→')
            .replace(/\\leftarrow/g, '←')
            .replace(/\\ge/g, '≥')
            .replace(/\\le/g, '≤')
            .replace(/\\neq/g, '≠')
            .replace(/\\times/g, '×')
            .replace(/\\div/g, '÷')
            .replace(/\\dots/g, '…')
            .replace(/\\log/g, 'log')
            .replace(/\^2/g, '²')
            .replace(/\^3/g, '³');
        });
        out = out.replace(/`([^`]+)`/g, '<code class="font-mono-code text-[12px] px-1.5 py-0.5 rounded-sm bg-[#0c1626] text-[#7dd3fc] border border-[#1e2d44]">$1</code>');
        out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-bold">$1</strong>');
        return out;
      }

      const lines = text.split('\n');
      const out = [];
      let i = 0;
      while (i < lines.length) {
        const ln = lines[i];
        const trimmed = ln.trim();
        if (!trimmed) { i++; continue; }
        if (/^@@CODEBLOCK_(\d+)@@$/.test(trimmed)) {
          out.push(codeBlocks[Number(trimmed.match(/^@@CODEBLOCK_(\d+)@@$/)[1])]);
          i++; continue;
        }
        if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|[\s:\-|]+\|$/.test(lines[i + 1].trim())) {
          const tblLines = [];
          while (i < lines.length && lines[i].trim().startsWith('|')) {
            tblLines.push(lines[i].trim());
            i++;
          }
          const parseRow = (r) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
          const headers = parseRow(tblLines[0]);
          const bodyRows = tblLines.slice(2).map(parseRow);
          let thtml = '<div class="my-2 overflow-x-auto"><table class="w-full text-xs border-collapse border border-[#1e2d44]"><thead><tr class="bg-[#0c1626] text-[#38bdf8]">';
          headers.forEach((h) => { thtml += `<th class="border border-[#1e2d44] px-2.5 py-1.5 text-left font-bold">${fmtInline(h)}</th>`; });
          thtml += '</tr></thead><tbody>';
          bodyRows.forEach((row) => {
            thtml += '<tr class="odd:bg-[#080d16] even:bg-[#0b1322]">';
            row.forEach((cell) => { thtml += `<td class="border border-[#1e2d44] px-2.5 py-1.5 text-[#cbd5e1]">${fmtInline(cell)}</td>`; });
            thtml += '</tr>';
          });
          thtml += '</tbody></table></div>';
          out.push(thtml);
          continue;
        }
        if (/^#{1,4}\s+/.test(trimmed)) {
          const hText = trimmed.replace(/^#{1,4}\s+/, '');
          out.push(`<div class="font-bold text-[#38bdf8] text-xs uppercase tracking-wide pt-1">${fmtInline(hText)}</div>`);
          i++; continue;
        }
        if (trimmed.startsWith('>')) {
          const bq = [];
          while (i < lines.length && lines[i].trim().startsWith('>')) {
            bq.push(lines[i].trim().replace(/^>\s?/, ''));
            i++;
          }
          out.push(`<div class="border-l-2 border-[#38bdf8] bg-[#0a1322] px-3.5 py-2.5 rounded-r-sm text-xs text-[#cbd5e1] space-y-1">${bq.map((b) => `<div>${fmtInline(b)}</div>`).join('')}</div>`);
          continue;
        }
        if (/^[-*]\s+/.test(trimmed)) {
          const items = [];
          while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
            items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
            i++;
          }
          out.push(`<ul class="list-disc pl-5 space-y-1 text-sm text-[#cbd5e1]">${items.map((it) => `<li>${fmtInline(it)}</li>`).join('')}</ul>`);
          continue;
        }
        let pHtml = fmtInline(ln).replace(/@@CODEBLOCK_(\d+)@@/g, (_, idx) => codeBlocks[Number(idx)]);
        out.push(`<p>${pHtml}</p>`);
        i++;
      }
      return out.join('');
    }

    function updatePracticeDoneBadge() {
      const doneN = Object.keys(practiceState.done).length;
      const totN = getVisiblePracticeBank().length;
      const pctN = totN ? Math.round((doneN / totN) * 100) : 0;
      const el = document.getElementById('prDoneCount');
      if (el) el.textContent = `${doneN} / ${totN} 題`;
      const bigEl = document.getElementById('prDoneBig');
      if (bigEl) bigEl.textContent = String(doneN);
      const mEl = document.getElementById('prMasteryPct');
      if (mEl) mEl.textContent = `${pctN}%`;
      const arc = document.getElementById('prGaugeArc');
      if (arc) arc.setAttribute('stroke-dashoffset', String(126 - (126 * pctN) / 100));
      const ndl = document.getElementById('prGaugeNeedle');
      if (ndl) ndl.setAttribute('transform', `rotate(${-90 + (180 * pctN) / 100} 50 48)`);
      const hStat = document.getElementById('homeExtraStat');
      if (hStat) hStat.textContent = `${doneN} / ${totN} (${pctN}%)`;
      const hBar = document.getElementById('homeExtraBar');
      if (hBar) hBar.style.width = `${pctN}%`;
      if (window.SelfLearningCardEngine && typeof window.SelfLearningCardEngine.syncBadge === 'function') {
        window.SelfLearningCardEngine.syncBadge(practiceState.done);
      }
    }

    function getSubUnitQuestions(subCode, applyStatusFilter = true) {
      return getVisiblePracticeBank().filter((q) => {
        if (q.subCode !== subCode) return false;
        if (!applyStatusFilter || practiceState.status === 'ALL') return true;
        const ok = Boolean(practiceState.done[q.id]);
        return practiceState.status === 'DONE' ? ok : !ok;
      });
    }

    function renderPracticeAccordion() {
      const navEl = document.getElementById('prAccordionNav');
      if (!navEl) return;
      navEl.innerHTML = PRACTICE_TAXONOMY.map((cat) => {
        const catItems = getVisiblePracticeBank().filter((q) => q.cat === cat.catKey);
        const catDone = catItems.filter((q) => practiceState.done[q.id]).length;
        const pct = catItems.length ? Math.round((catDone / catItems.length) * 100) : 0;
        const isOpen = practiceState.expandedCat === cat.catKey;
        const subRows = isOpen
          ? `<div class="pt-1.5 pl-2 space-y-1 border-t border-[#162235] mt-2">${cat.subs.map(([sc, stitle]) => {
              const sItems = getVisiblePracticeBank().filter((q) => q.subCode === sc);
              const sDone = sItems.filter((q) => practiceState.done[q.id]).length;
              const isAct = practiceState.activeSubCode === sc;
              const allDone = sItems.length > 0 && sDone === sItems.length;
              return `<button type="button" data-prsub="${sc}" class="w-full text-left px-2.5 py-2 rounded-sm border transition flex items-center justify-between gap-2 ${isAct ? 'bg-[#102238] border-[#38bdf8] text-white' : 'bg-[#080d16] border-transparent hover:border-[#243754] text-[#cbd5e1]'}">
                <div class="min-w-0 flex items-center gap-2">
                  <span class="font-mono-code text-[11px] font-bold shrink-0 ${isAct ? 'text-[#38bdf8]' : 'text-[#64748b]'}">${sc}</span>
                  <span class="text-xs font-medium truncate">${escapeHtml(stitle)}</span>
                </div>
                <span class="font-mono-code text-[10px] shrink-0 px-1.5 py-0.5 rounded-sm ${allDone ? 'bg-[#06281c] text-[#34d399]' : 'bg-[#0e1726] text-[#94a3b8]'}">${sDone}/${sItems.length}</span>
              </button>`;
            }).join('')}</div>`
          : '';

        return `<div class="rounded-sm border transition ${isOpen ? 'bg-[#0b1424] border-[#264166]' : 'bg-[#080d16] border-[#182438] hover:border-[#243754]'} p-2.5">
          <button type="button" data-prcat-toggle="${cat.catKey}" class="w-full text-left flex items-center justify-between gap-2">
            <div class="min-w-0 flex items-center gap-2">
              <span class="font-mono-code text-[11px] font-bold w-5 h-5 rounded-sm flex items-center justify-center shrink-0 ${isOpen ? 'bg-[#38bdf8] text-[#04141e]' : 'bg-[#132035] text-[#7dd3fc]'}">${cat.catNum}</span>
              <span class="text-xs font-bold truncate ${isOpen ? 'text-white' : 'text-[#cbd5e1]'}">${escapeHtml(cat.catTitle)}</span>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="font-mono-code text-[10px] ${catDone === catItems.length && catItems.length ? 'text-[#34d399]' : 'text-[#94a3b8]'}">${catDone}/${catItems.length}</span>
              <span class="text-[10px] text-[#64748b]">${isOpen ? '▾' : '▸'}</span>
            </div>
          </button>
          <div class="mt-2 h-1 rounded-full bg-[#060a12] overflow-hidden">
            <div class="h-full bg-gradient-to-r from-[#38bdf8] to-[#10b981] transition-all duration-300" style="width:${pct}%"></div>
          </div>
          ${subRows}
        </div>`;
      }).join('');

      navEl.querySelectorAll('[data-prcat-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.getAttribute('data-prcat-toggle');
          if (practiceState.expandedCat === key) return; // keep active category open
          practiceState.expandedCat = key;
          const catObj = PRACTICE_TAXONOMY.find((c) => c.catKey === key);
          if (catObj && catObj.subs.length) {
            selectPracticeSubUnit(catObj.subs[0][0]);
          } else {
            renderPracticeAccordion();
          }
        });
      });

      navEl.querySelectorAll('[data-prsub]').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectPracticeSubUnit(btn.getAttribute('data-prsub'));
        });
      });
    }

    function selectPracticeSubUnit(subCode) {
      practiceState.activeSubCode = subCode;
      practiceState.stripExpanded = false;
      const list = getSubUnitQuestions(subCode, true);
      const fallbackList = list.length ? list : getSubUnitQuestions(subCode, false);
      if (fallbackList.length) {
        const curInSub = fallbackList.some((x) => x.id === practiceState.activeId);
        if (!curInSub) practiceState.activeId = fallbackList[0].id;
        practiceState.expandedCat = fallbackList[0].cat;
      }
      renderPracticeList();
      if (practiceState.activeId) loadPracticeQuestion(practiceState.activeId);
    }

    function renderPracticeQuestionStrip() {
      const stripEl = document.getElementById('prQuestionStrip');
      const bcEl = document.getElementById('prBreadcrumb');
      const subTitleEl = document.getElementById('prSubHeaderTitle');
      const progBar = document.getElementById('prSubProgressBar');
      const progTxt = document.getElementById('prSubProgressText');
      const toggleBtn = document.getElementById('prNavToggleBtn');
      if (!stripEl) return;

      const allInSub = getSubUnitQuestions(practiceState.activeSubCode, false);
      const filtered = getSubUnitQuestions(practiceState.activeSubCode, true);
      const doneInSub = allInSub.filter((q) => practiceState.done[q.id]).length;
      const pct = allInSub.length ? Math.round((doneInSub / allInSub.length) * 100) : 0;

      if (allInSub.length) {
        const sample = allInSub[0];
        if (bcEl) bcEl.textContent = `${sample.catNum}. ${sample.catTitle}`;
        if (subTitleEl) subTitleEl.textContent = `${sample.subCode} ${sample.subTitle}`;
      }
      if (progBar) progBar.style.width = `${pct}%`;
      if (progTxt) progTxt.textContent = `${doneInSub} / ${allInSub.length} 已過關`;

      // Single-row horizontal scrollable strip by default; toggle expands to multi-row wrap
      const needToggle = filtered.length > 8;
      const expanded = Boolean(practiceState.stripExpanded);
      stripEl.classList.toggle('pr-strip-expanded', expanded);

      if (toggleBtn) {
        if (needToggle) {
          toggleBtn.classList.remove('hidden');
          toggleBtn.textContent = expanded ? `單行收合 ▲` : `展開全部 (${filtered.length}) ▼`;
        } else {
          toggleBtn.classList.add('hidden');
        }
      }

      stripEl.innerHTML = filtered.map((q) => {
        const act = q.id === practiceState.activeId;
        const ok = Boolean(practiceState.done[q.id]);
        const cls = act
          ? 'bg-[#38bdf8] text-[#04141e] border-[#38bdf8] ring-2 ring-[#38bdf8]/35 font-extrabold'
          : ok
            ? 'bg-[#06281c] text-[#34d399] border-[#10b981]/50 hover:border-[#10b981]'
            : 'bg-[#080d16] text-[#94a3b8] border-[#1e2d44] hover:border-[#38bdf8]/60 hover:text-white';
        return `<button type="button" data-prjump="${q.id}" title="${escapeHtml(q.code + ' ' + q.title)}" class="shrink-0 font-mono-code text-[11px] min-w-[3.4rem] px-2 py-1 rounded-sm border transition flex items-center justify-center gap-1 ${cls}">
          <span>${q.code}</span>${ok && !act ? '<span class="text-[9px]">✓</span>' : ''}
        </button>`;
      }).join('') || '<div class="text-xs text-[#64748b] py-1">此狀態篩選下沒有題目，請切換「全部」。</div>';

      stripEl.querySelectorAll('[data-prjump]').forEach((btn) => {
        btn.addEventListener('click', () => {
          practiceState.activeId = btn.getAttribute('data-prjump');
          loadPracticeQuestion(practiceState.activeId);
          renderPracticeQuestionStrip();
        });
      });
      if (!expanded) {
        const activeBtn = stripEl.querySelector(`[data-prjump="${CSS.escape(practiceState.activeId || '')}"]`);
        if (activeBtn && activeBtn.scrollIntoView) {
          activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      }
    }

    function renderPracticeSearchResults() {
      const wrap = document.getElementById('prSearchResultsWrap');
      const acc = document.getElementById('prAccordionNav');
      const clr = document.getElementById('prSearchClearBtn');
      if (!wrap || !acc) return;
      const q = practiceState.query.trim().toLowerCase();
      if (!q) {
        wrap.classList.add('hidden');
        acc.classList.remove('hidden');
        clr && clr.classList.add('hidden');
        return;
      }
      clr && clr.classList.remove('hidden');
      acc.classList.add('hidden');
      wrap.classList.remove('hidden');

      const hits = getVisiblePracticeBank().filter((item) =>
        (item.code + ' ' + item.id + ' ' + item.catTitle + ' ' + item.subTitle + ' ' + item.title + ' ' + item.stem).toLowerCase().includes(q)
      ).slice(0, 40);

      wrap.innerHTML = `<div class="font-mono-code text-[10px] text-[#64748b] px-1">找到 ${hits.length} 題${hits.length === 40 ? '（顯示前 40 題）' : ''}</div>` +
        (hits.map((item) => {
          const ok = Boolean(practiceState.done[item.id]);
          const act = item.id === practiceState.activeId;
          return `<button type="button" data-prsearch-id="${item.id}" class="w-full text-left p-2 rounded-sm border transition ${act ? 'bg-[#102238] border-[#38bdf8] text-white' : 'bg-[#080d16] border-[#182438] text-[#cbd5e1] hover:border-[#38bdf8]/50'}">
            <div class="flex items-center justify-between font-mono-code text-[10px] mb-0.5">
              <span class="text-[#38bdf8] font-bold">${item.code}</span>
              <span class="text-[#10d981]">${ok ? '✓ 已過關' : escapeHtml(item.subTitle)}</span>
            </div>
            <div class="text-xs font-medium leading-snug line-clamp-2">${escapeHtml(item.title)}</div>
          </button>`;
        }).join('') || '<div class="text-xs text-[#64748b] p-2">找不到符合關鍵字的題目。</div>');

      wrap.querySelectorAll('[data-prsearch-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const hit = PRACTICE_BANK.find((x) => x.id === btn.getAttribute('data-prsearch-id'));
          if (!hit) return;
          practiceState.expandedCat = hit.cat;
          practiceState.activeSubCode = hit.subCode;
          practiceState.activeId = hit.id;
          practiceState.query = '';
          const inp = document.getElementById('prSearchInput');
          if (inp) inp.value = '';
          renderPracticeList();
          loadPracticeQuestion(hit.id);
        });
      });
    }

    function renderPracticeList() {
      updatePracticeDoneBadge();
      renderPracticeAccordion();
      renderPracticeQuestionStrip();
      renderPracticeSearchResults();
    }

    function loadPracticeQuestion(qid) {
      const q = PRACTICE_BANK.find((x) => x.id === qid);
      if (!q) return;
      practiceState.activeId = q.id;
      practiceState.expandedCat = q.cat;
      practiceState.activeSubCode = q.subCode;
      practiceState.selectedOpt = '';

      document.getElementById('prCodeBadge').textContent = q.code;
      document.getElementById('prBadgeDiff').textContent = q.diff || '★';
      document.getElementById('prBadgeMode').textContent = q.mode === 'mcq' ? '四選一選擇題' : (q.mode === 'output' ? '寫輸出（自動核對）' : '編程／結構化作答');
      document.getElementById('prBadgeTopic').textContent = q.sub;
      document.getElementById('prQidLabel').textContent = q.id;
      const prTitleEl = document.getElementById('prTitle');
      const cleanStemHead = String(q.stem || '').replace(/`/g, '').replace(/\s+/g, '').slice(0, 16);
      const cleanTitleHead = String(q.title || '').replace(/[…\.]+$/, '').replace(/\s+/g, '').slice(0, 16);
      const isDuplicateStemTitle = Boolean(cleanTitleHead && cleanStemHead && cleanStemHead.startsWith(cleanTitleHead.slice(0, 12)));
      if (isDuplicateStemTitle || !q.title) {
        prTitleEl.textContent = '';
        prTitleEl.classList.add('hidden');
      } else {
        prTitleEl.textContent = `${q.code} ｜ ${q.title}`;
        prTitleEl.classList.remove('hidden');
      }
      document.getElementById('prStem').innerHTML = renderPracticeMd(q.stem);

      const doneTag = document.getElementById('prDoneTag');
      if (practiceState.done[q.id]) doneTag.classList.remove('hidden');
      else doneTag.classList.add('hidden');

      const teacherBtn = document.getElementById('prTeacherAnsBtn');
      if (teacherBtn) {
        if (typeof isTeacherUser === 'function' && isTeacherUser()) teacherBtn.classList.remove('hidden');
        else teacherBtn.classList.add('hidden');
      }

      // Update Prev / Next buttons & position counter within current sub-unit
      const subList = getSubUnitQuestions(q.subCode, true);
      const posIdx = subList.findIndex((x) => x.id === q.id);
      const posEl = document.getElementById('prPosCounter');
      if (posEl && posIdx >= 0) posEl.textContent = `單元第 ${posIdx + 1} / ${subList.length} 題`;
      const prevBtn = document.getElementById('prPrevBtn');
      const nextBtn = document.getElementById('prNextBtn');
      if (prevBtn) prevBtn.disabled = posIdx <= 0;
      if (nextBtn) nextBtn.disabled = posIdx < 0 || posIdx >= subList.length - 1;

      const fb = document.getElementById('prFeedbackBox');
      fb.classList.add('hidden');
      fb.innerHTML = '';

      const mcqWrap = document.getElementById('prMcqWrap');
      const shortWrap = document.getElementById('prShortWrap');
      const shortInput = document.getElementById('prShortInput');

      if (q.mode === 'mcq') {
        shortWrap.classList.add('hidden');
        mcqWrap.classList.remove('hidden');
        const isShortMcq = Array.isArray(q.options) && q.options.length > 0 && q.options.every((o) => {
          const s = String(o || '').trim();
          return s.length <= 35 && !s.includes('\n') && !s.includes('```');
        });
        mcqWrap.className = isShortMcq
          ? 'grid grid-cols-1 md:grid-cols-2 gap-2.5 no-copy select-none pt-1'
          : 'grid grid-cols-1 gap-2.5 no-copy select-none pt-1';
        const letters = ['A', 'B', 'C', 'D'];
        mcqWrap.innerHTML = q.options.map((optText, idx) => {
          const L = letters[idx];
          return `<button type="button" data-propt="${L}" class="w-full text-left p-3.5 rounded-sm border border-[#1e2d44] bg-[#080d16] hover:border-[#38bdf8]/70 hover:bg-[#0c1626] transition flex items-start gap-3">
            <span class="shrink-0 w-7 h-7 rounded-sm bg-[#132035] border border-[#243754] font-mono-code text-xs font-bold text-[#38bdf8] flex items-center justify-center mt-0.5">${L}</span>
            <div class="flex-1 min-w-0 text-sm text-[#e2e8f0] leading-relaxed overflow-x-auto">${renderPracticeMd(optText)}</div>
          </button>`;
        }).join('');
        mcqWrap.querySelectorAll('[data-propt]').forEach((btn) => {
          btn.addEventListener('click', () => {
            practiceState.selectedOpt = btn.getAttribute('data-propt');
            mcqWrap.querySelectorAll('[data-propt]').forEach((b) => {
              const isSel = b.getAttribute('data-propt') === practiceState.selectedOpt;
              b.className = `w-full text-left p-3.5 rounded-sm border transition flex items-start gap-3 ${isSel ? 'border-[#38bdf8] bg-[#102238] ring-1 ring-[#38bdf8]/40' : 'border-[#1e2d44] bg-[#080d16] hover:border-[#38bdf8]/60 hover:bg-[#0c1626]'}`;
            });
          });
        });
      } else {
        mcqWrap.classList.add('hidden');
        shortWrap.classList.remove('hidden');
        if (shortInput) shortInput.value = '';
      }
    }

    async function submitPracticeAnswer() {
      if (practiceState.busy) return;
      const q = PRACTICE_BANK.find((x) => x.id === practiceState.activeId);
      if (!q) return;
      const fb = document.getElementById('prFeedbackBox');
      const submitBtn = document.getElementById('prSubmitBtn');

      let payload = null;
      let attemptedText = '';
      if (q.mode === 'mcq') {
        if (!practiceState.selectedOpt) {
          fb.className = 'rounded-sm p-3.5 border border-[#fbbf24]/40 bg-[#1c1608] text-[#fde68a] text-sm';
          fb.innerHTML = '請先點選 A、B、C 或 D 其中一個選項再提交核對。';
          fb.classList.remove('hidden');
          return;
        }
        payload = { action: 'grade', kind: 'practice_mcq', id: q.id, selected: practiceState.selectedOpt };
        attemptedText = `選取: ${practiceState.selectedOpt}`;
      } else if (q.mode === 'output') {
        const val = (document.getElementById('prShortInput')?.value || '').trim();
        if (!val) {
          fb.className = 'rounded-sm p-3.5 border border-[#fbbf24]/40 bg-[#1c1608] text-[#fde68a] text-sm';
          fb.innerHTML = '請先輸入空運行預測的輸出結果再提交核對。';
          fb.classList.remove('hidden');
          return;
        }
        payload = { action: 'grade', kind: 'practice_output', id: q.id, userAns: val };
        attemptedText = val;
      } else {
        const val = (document.getElementById('prShortInput')?.value || '').trim();
        if (val.length < 2) {
          fb.className = 'rounded-sm p-3.5 border border-[#fbbf24]/40 bg-[#1c1608] text-[#fde68a] text-sm';
          fb.innerHTML = '請先自行輸入答案或程式碼再提交核對。';
          fb.classList.remove('hidden');
          return;
        }
        payload = { action: 'grade', kind: 'practice_short', id: q.id, userAns: val };
        attemptedText = val;
      }

      practiceState.busy = true;
      const origTxt = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>雲端核對中...</span>';

      try {
        const res = await callCloudGrader(payload);
        if (!res || res.status !== 'ok') {
          fb.className = 'rounded-sm p-3.5 border border-[#fb7185]/40 bg-[#220c13] text-[#fda4af] text-sm';
          fb.innerHTML = `⚠ 雲端核對失敗：${escapeHtml((res && res.message) || '請確認已重新部署最新版 Google Apps Script')}`;
          fb.classList.remove('hidden');
          return;
        }

        practiceState.attempts[q.id] = (practiceState.attempts[q.id] || 0) + 1;
        const passed = Boolean(res.passed);
        if (passed) {
          const prevSlLv = window.SelfLearningCardEngine ? window.SelfLearningCardEngine.getLevel(practiceState.done) : 0;
          practiceState.done[q.id] = true;
          document.getElementById('prDoneTag')?.classList.remove('hidden');
          renderPracticeList();
          const newSlLv = window.SelfLearningCardEngine ? window.SelfLearningCardEngine.getLevel(practiceState.done) : 0;
          if (newSlLv > prevSlLv && window.SelfLearningCardEngine) {
            setTimeout(() => window.SelfLearningCardEngine.play(newSlLv), 320);
          }
        }

        if (q.mode === 'mcq') {
          document.querySelectorAll('#prMcqWrap [data-propt]').forEach((b) => {
            const optL = b.getAttribute('data-propt');
            if (optL === res.correct) {
              b.className = 'w-full text-left p-3.5 rounded-sm border border-[#10b981] bg-[#06281c] transition flex items-start gap-3';
            } else if (optL === practiceState.selectedOpt && !passed) {
              b.className = 'w-full text-left p-3.5 rounded-sm border border-[#fb7185] bg-[#2a0c15] transition flex items-start gap-3';
            }
          });
        }

        const explainHtml = `<details open class="pt-2 border-t ${passed ? 'border-[#10b981]/25' : 'border-[#fb7185]/25'}">
          <summary class="cursor-pointer font-mono-code text-xs font-bold text-[#38bdf8] select-none mb-2">詳解與追蹤表（點擊收合／展開）</summary>
          <div class="space-y-2 text-[#e2e8f0]">${renderPracticeMd(res.explain || '')}</div>
        </details>`;

        if (passed) {
          fb.className = 'rounded-sm p-4 border border-[#10b981]/50 bg-[#062319] text-[#d1fae5] text-sm space-y-2.5 overflow-x-auto';
          const hdr = q.mode === 'mcq'
            ? `<div class="font-bold text-[#34d399]">✓ 答對！（正確答案：${escapeHtml(res.correct)}）— 已即時記錄至 Google Sheet</div>`
            : (q.mode === 'output'
              ? `<div class="font-bold text-[#34d399]">✓ 輸出完全正確！已即時記錄至 Google Sheet</div>`
              : `<div class="font-bold text-[#34d399]">✓ 已提交並記錄作答至 Google Sheet — 請對照以下標準參考答案與追蹤表</div>`);
          fb.innerHTML = hdr + explainHtml;
        } else {
          fb.className = 'rounded-sm p-4 border border-[#fb7185]/50 bg-[#230b13] text-[#fecdd3] text-sm space-y-2.5 overflow-x-auto';
          const failHdr = q.mode === 'output'
            ? `<div class="font-bold text-[#fb7185]">✗ 輸出未完全符合，已記錄本次嘗試至 Google Sheet（請參考下方標準答案與追蹤表）</div>`
            : `<div class="font-bold text-[#fb7185]">✗ 答錯（你選了 ${escapeHtml(practiceState.selectedOpt)}，正確答案：${escapeHtml(res.correct || '?')}）— 已記錄本次嘗試至 Google Sheet</div>`;
          fb.innerHTML = failHdr + explainHtml;
        }
        fb.classList.remove('hidden');

        const st = state.student || {};
        const flags = Array.from(practiceState.aiFlags[q.id] || []);
        const attemptRecord = q.mode === 'mcq'
          ? `[${q.code}] ${attemptedText} | 正解: ${res.correct || ''} (${passed ? '正確' : '錯誤'})`
          : `[${q.code}] ${attemptedText}`;
        syncToGoogleSheet({
          cls: st.cls || '',
          no: st.no || '',
          name: st.name || '',
          lesson: `${q.subCode} ${q.subTitle}`,
          levelId: q.id,
          tier: '額外操練',
          practiceMeta: {
            sourceTab: '額外操練',
            unit: `${q.catNum}. ${q.catTitle} > ${q.subCode} ${q.subTitle}`,
            hierCode: q.code,
            qType: q.mode === 'mcq' ? '四選一選擇題' : (q.mode === 'output' ? '寫輸出' : '編程/結構化'),
            difficulty: q.diff || '★',
            ability: q.skill || q.sub || '',
            progressPct: `${Math.round((Object.keys(practiceState.done).length / getVisiblePracticeBank().length) * 100)}% (${Object.keys(practiceState.done).length}/${getVisiblePracticeBank().length})`
          },
          passed: passed,
          xp: state.xp,
          penalty: state.penalty,
          attempts: practiceState.attempts[q.id],
          tabSwitches: state.tabSwitches || 0,
          awaySeconds: state.awaySeconds || 0,
          aiFlags: flags,
          code: attemptRecord
        });
      } finally {
        practiceState.busy = false;
        submitBtn.disabled = false;
        submitBtn.innerHTML = origTxt;
      }
    }

    async function revealPracticeTeacherAnswer() {
      const q = PRACTICE_BANK.find((x) => x.id === practiceState.activeId);
      if (!q) return;
      const fb = document.getElementById('prFeedbackBox');
      const res = await callCloudGrader({
        action: 'teacher_answer',
        kind: 'practice',
        id: q.id,
        idToken: getTeacherIdToken()
      });
      if (!res || res.status !== 'ok' || !res.data) {
        fb.className = 'rounded-sm p-3.5 border border-[#fb7185]/40 bg-[#220c13] text-[#fda4af] text-sm';
        fb.innerHTML = `⚠ 無法載入老師答案：${escapeHtml((res && res.message) || '請重新登入老師帳戶')}`;
        fb.classList.remove('hidden');
        return;
      }
      const ansBadge = res.data.ans ? `正確答案：${escapeHtml(res.data.ans)}` : '參考答案與詳解';
      fb.className = 'rounded-sm p-4 border border-[#fbbf24]/50 bg-[#1c1608] text-[#fde68a] text-sm space-y-2.5 overflow-x-auto';
      fb.innerHTML = `<div class="font-bold text-[#fbbf24]">👁️ 老師模式 — ${ansBadge}</div><div class="pt-2 border-t border-[#fbbf24]/25 space-y-2 text-[#e2e8f0]">${renderPracticeMd(res.data.explain || '')}</div>`;
      fb.classList.remove('hidden');
    }

    function initPracticeTab() {

      document.querySelectorAll('#prStatusPills [data-prstatus]').forEach((btn) => {
        btn.addEventListener('click', () => {
          practiceState.status = btn.getAttribute('data-prstatus');
          document.querySelectorAll('#prStatusPills [data-prstatus]').forEach((b) => {
            const act = b.getAttribute('data-prstatus') === practiceState.status;
            b.className = act
              ? 'px-2 py-1 rounded-sm bg-[#1b2d4a] text-white transition'
              : 'px-2 py-1 rounded-sm text-[#94a3b8] hover:text-white transition';
          });
          const list = getSubUnitQuestions(practiceState.activeSubCode, true);
          if (list.length && !list.some((x) => x.id === practiceState.activeId)) {
            practiceState.activeId = list[0].id;
            loadPracticeQuestion(practiceState.activeId);
          }
          renderPracticeQuestionStrip();
        });
      });

      document.getElementById('prNavToggleBtn')?.addEventListener('click', () => {
        practiceState.stripExpanded = !practiceState.stripExpanded;
        renderPracticeQuestionStrip();
      });

      document.getElementById('prSearchInput')?.addEventListener('input', (e) => {
        practiceState.query = e.target.value;
        renderPracticeSearchResults();
      });
      document.getElementById('prSearchClearBtn')?.addEventListener('click', () => {
        practiceState.query = '';
        const inp = document.getElementById('prSearchInput');
        if (inp) inp.value = '';
        renderPracticeSearchResults();
      });

      document.getElementById('prSubmitBtn')?.addEventListener('click', submitPracticeAnswer);
      document.getElementById('prTeacherAnsBtn')?.addEventListener('click', revealPracticeTeacherAnswer);

      document.getElementById('prPrevBtn')?.addEventListener('click', () => {
        const list = getSubUnitQuestions(practiceState.activeSubCode, true);
        const idx = list.findIndex((x) => x.id === practiceState.activeId);
        if (idx > 0) {
          practiceState.activeId = list[idx - 1].id;
          loadPracticeQuestion(practiceState.activeId);
          renderPracticeQuestionStrip();
        }
      });
      document.getElementById('prNextBtn')?.addEventListener('click', () => {
        const list = getSubUnitQuestions(practiceState.activeSubCode, true);
        const idx = list.findIndex((x) => x.id === practiceState.activeId);
        if (idx >= 0 && idx < list.length - 1) {
          practiceState.activeId = list[idx + 1].id;
          loadPracticeQuestion(practiceState.activeId);
          renderPracticeQuestionStrip();
        }
      });

      // Anti-AI paste, drop & Ctrl+V/Cmd+V blocking on short-answer input
      const shortInp = document.getElementById('prShortInput');
      if (shortInp) {
        shortInp.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'v') {
            e.preventDefault();
            if (practiceState.activeId) {
              if (!practiceState.aiFlags[practiceState.activeId]) practiceState.aiFlags[practiceState.activeId] = new Set();
              practiceState.aiFlags[practiceState.activeId].add('ctrl_v_blocked');
            }
            const fb = document.getElementById('prFeedbackBox');
            if (fb) {
              fb.className = 'rounded-sm p-3 border border-[#fbbf24]/50 bg-[#1c1608] text-[#fde68a] text-xs font-bold';
              fb.innerHTML = '🛡 防 AI 保護：禁止使用 Ctrl+V 貼上，請自行輸入答案（已記錄異常標記）。';
              fb.classList.remove('hidden');
            }
          }
        });
        ['paste', 'drop'].forEach((ev) => {
          shortInp.addEventListener(ev, (e) => {
            e.preventDefault();
            if (practiceState.activeId) {
              if (!practiceState.aiFlags[practiceState.activeId]) practiceState.aiFlags[practiceState.activeId] = new Set();
              practiceState.aiFlags[practiceState.activeId].add(ev + '_blocked');
            }
            const fb = document.getElementById('prFeedbackBox');
            if (fb) {
              fb.className = 'rounded-sm p-3 border border-[#fbbf24]/50 bg-[#1c1608] text-[#fde68a] text-xs font-bold';
              fb.innerHTML = '🛡 防 AI 保護：禁止貼上或拖放外部文字，請自行輸入答案（已記錄異常標記）。';
              fb.classList.remove('hidden');
            }
          });
        });
      }

      // Anti-AI copy/contextmenu blocking on protected stem & options
      const protArea = document.getElementById('prProtectedArea');
      const mcqArea = document.getElementById('prMcqWrap');
      [protArea, mcqArea].forEach((el) => {
        if (!el) return;
        ['copy', 'cut', 'contextmenu', 'dragstart'].forEach((ev) => {
          el.addEventListener(ev, (e) => e.preventDefault());
        });
      });

      renderPracticeList();
      if (practiceState.activeId) loadPracticeQuestion(practiceState.activeId);
    }
    initPracticeTab();

