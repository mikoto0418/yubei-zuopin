/* ============================================================
   ExamPrep 前端逻辑 —— Apple 设计基底 + 命令行 + 时间块日历
   原生 JS，无构建步骤。
   视图 key：calendar / plan / exam / wrong / material / reminder /
            quiz / stats / goal / ai / admin / me
   ============================================================ */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const API = '';
  const VALID_VIEWS = ['calendar', 'plan', 'exam', 'wrong', 'material', 'reminder', 'quiz', 'stats', 'goal', 'ai', 'admin', 'me'];
  const state = {
    token: localStorage.getItem('ep_token') || null,
    user: JSON.parse(localStorage.getItem('ep_user') || 'null'),
    aiSource: null,
    cal: { date: today(), week: false },
  };
  let charts = {};
  let statsChart = null;
  let modalUpdater = null;

  // ===== 基础工具 =====
  function toast(msg, ok) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.style.color = ok ? 'var(--green)' : '';
    t.classList.add('show');
    clearTimeout(t.__timer);
    t.__timer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    let resp;
    try {
      resp = await fetch(API + path, { headers, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch (e) {
      throw new Error('网络连接失败，请确认后端服务已启动');
    }
    let data = {};
    try { data = await resp.json(); } catch (e) {}
    if (!resp.ok) throw new Error(data.message || ('请求失败 ' + resp.status));
    return data;
  }
  function saveSession(user, token) {
    state.user = user; state.token = token;
    if (user) localStorage.setItem('ep_user', JSON.stringify(user));
    else localStorage.removeItem('ep_user');
    if (token) localStorage.setItem('ep_token', token);
    else localStorage.removeItem('ep_token');
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function toMin(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }
  function fromMin(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function weekday(dateStr) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(dateStr + 'T00:00:00Z').getUTCDay()];
  }

  // 状态机元数据（与后端一致）
  const BLOCK_FLOW = { planned: ['in_progress', 'done'], in_progress: ['done'], done: [], skipped: [] };
  const BLOCK_LABEL = { planned: '待开始', in_progress: '进行中', done: '已完成', skipped: '已跳过' };
  const WRONG_LABEL = { new: '待重做', reviewing: '重做中', mastered: '已掌握' };
  const REM_LABEL = { pending: '待触发', sent: '已发送', done: '已完成', dismissed: '已忽略' };
  const MAT_LABEL = { reading: '阅读中', finished: '已完成', paused: '已暂停' };
  const MAT_TYPE = { book: '书籍', link: '链接', note: '笔记', video: '视频' };

  // 五态渲染：loading / empty / error / content
  function skeleton(n) {
    return Array.from({ length: n || 3 }, () => '<div class="skeleton-row apple-skeleton"></div>').join('');
  }
  function stateBox(mark, title, desc, actionHtml) {
    return '<div class="state"><div class="state-mark">' + mark + '</div>' +
      '<div class="state-title">' + esc(title) + '</div>' +
      '<div class="state-desc">' + esc(desc) + '</div>' + (actionHtml || '') + '</div>';
  }
  function renderState(el, { loading, empty, emptyAction, html, error, errorAction } = {}) {
    if (!el) return;
    if (error) {
      el.innerHTML = stateBox('!', '加载失败', error, errorAction ||
        '<button class="check-btn" data-retry="1">重试</button>');
      return;
    }
    if (loading) { el.innerHTML = skeleton(3); return; }
    if (!html) {
      el.innerHTML = stateBox('·', '暂无数据', empty || '这里还没有内容。', emptyAction || '');
      return;
    }
    el.innerHTML = html;
  }
  function bar(pct) {
    const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    return '<span class="bar"><i style="width:' + p + '%"></i></span><span class="barval">' + p + '%</span>';
  }
  function progressLine(pct) { return '<span class="progress-line">' + bar(pct) + '</span>'; }

  // ===== Markdown（AI 输出，先转义再渲染）=====
  function renderMarkdown(text) {
    const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[\t ]+$/, '')).map(esc);
    const out = []; let para = [];
    const flush = () => { if (para.length) { out.push('<p>' + para.join(' ') + '</p>'); para = []; } };
    const inline = renderInline;
    let i = 0;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (/^```/.test(t)) {
        flush(); const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
        i++; out.push('<pre><code>' + buf.join('\n') + '</code></pre>'); continue;
      }
      if (!t) { flush(); i++; continue; }
      const h = t.match(/^(#{1,6})\s+(.*)$/);
      if (h) { flush(); const lv = h[1].length; out.push('<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>'); i++; continue; }
      if (/^(-{3,}|\*{3,}|_+)\s*$/.test(t)) { flush(); out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(t)) {
        flush(); const q = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) { q.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
        out.push('<blockquote>' + inline(q.join(' ')) + '</blockquote>'); continue;
      }
      if (/^(?:[-*·])\s+/.test(t)) {
        flush(); const items = [];
        while (i < lines.length) {
          const m = lines[i].trim().match(/^(?:[-*·])\s+(.*)$/);
          if (!m) break;
          items.push('<li>' + inline(m[1]) + '</li>'); i++;
        }
        out.push('<ul>' + items.join('') + '</ul>'); continue;
      }
      if (/^\d+\.\s+/.test(t)) {
        flush(); const items = [];
        while (i < lines.length) {
          const m = lines[i].trim().match(/^\d+\.\s+(.*)$/);
          if (!m) break;
          items.push('<li>' + inline(m[1]) + '</li>'); i++;
        }
        out.push('<ol>' + items.join('') + '</ol>'); continue;
      }
      para.push(t); i++;
    }
    flush();
    return out.join('\n');
  }
  function renderInline(s) {
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
      const safe = /^(https?:|mailto:|#|\/)/i.test(u);
      return '<a href="' + (safe ? u : '#') + '" target="_blank" rel="noopener noreferrer">' + t + '</a>';
    });
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return s;
  }

  // ===== 路由 =====
  function showView(name) {
    if (!state.token && name !== 'login') { location.hash = '#/login'; return; }
    if (name === 'admin' && state.user && !['admin', 'mentor'].includes(state.user.role)) {
      showError('无权限', '当前账号无法访问管理后台，请使用管理员或助教账号。');
      return;
    }
    hideError();
    if (name === 'login') {
      $$('#views .view').forEach((v) => v.classList.remove('active'));
      $('#authView').classList.add('active');
      $('#errView').classList.remove('active');
      $('#navbar').style.display = 'none';
      $('#statusbar').style.display = 'none';
      setCmdEnabled(false);
      return;
    }
    if (!VALID_VIEWS.includes(name)) {
      showError('页面不存在', '目标视图「' + name + '」不存在，请检查地址或返回首页。');
      return;
    }
    $('#authView').classList.remove('active');
    $$('#views .view').forEach((v) => v.classList.remove('active'));
    const target = document.querySelector('.view[data-view="' + name + '"]');
    if (target) target.classList.add('active');
    $$('.navbtn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    const loaders = {
      calendar: loadCalendarView, plan: loadPlanView, exam: loadExamView,
      wrong: loadWrongView, material: loadMaterialView, reminder: loadReminderView,
      quiz: loadQuizView, stats: loadStatsView, goal: loadGoalView,
      ai: () => {}, admin: loadAdminView, me: loadMeView,
    };
    (loaders[name] || (() => {}))();
    scrollTo(0, 0);
  }
  function showError(title, msg) {
    $$('#views .view').forEach((v) => v.classList.remove('active'));
    $('#authView').classList.remove('active');
    $('#errCode').textContent = title;
    $('#errMsg').textContent = msg;
    $('#errView').classList.add('active');
    scrollTo(0, 0);
  }
  function hideError() { $('#errView').classList.remove('active'); }

  // ===== 登录 / 注册 =====
  function showAuthedUI() {
    $('#authView').classList.remove('active');
    $('#errView').classList.remove('active');
    $('#navbar').style.display = 'flex';
    $('#statusbar').style.display = 'flex';
    $$('.admin-only').forEach((e) => {
      e.style.display = state.user && ['admin', 'mentor'].includes(state.user.role) ? '' : 'none';
    });
    $('#statusMsg').textContent = state.user.username + ' · ' + (state.user.target_exam || '未设置考试') +
      (state.user.exam_date ? ' · 考试日期 ' + state.user.exam_date : '') +
      ' · ' + String(state.user.role || 'student').toUpperCase();
    setCmdEnabled(true);
    printBanner();
    const hash = (location.hash || '').replace('#/', '');
    const route = VALID_VIEWS.includes(hash) ? hash : 'calendar';
    location.hash = '#/' + route;
    showView(route);
  }
  function showAuthUI(msg) {
    location.hash = '#/login';
    showView('login');
    if (msg) toast(msg);
  }

  // ============================================================
  // 时间块日历
  // ============================================================
  const CAL_FALLBACK = { from: 6, to: 23 }; // 06:00 - 23:00

  function calRange(blocks) {
    let from = CAL_FALLBACK.from, to = CAL_FALLBACK.to;
    for (const b of blocks) {
      const s = toMin(b.start_time) / 60, e = Math.ceil(toMin(b.end_time) / 60);
      if (s < from) from = Math.floor(s);
      if (e > to) to = e;
    }
    return { from: Math.max(0, from), to: Math.min(24, Math.max(to, from + 1)) };
  }

  async function loadCalendarView() {
    const wrap = $('#calDayWrap');
    const list = $('#calList');
    if (state.cal.week) return loadWeekView();

    renderState(list, { loading: true });
    $('#calDate').textContent = state.cal.date + ' ' + weekday(state.cal.date);
    try {
      const d = await api('/api/blocks/calendar?date=' + state.cal.date + '&days=1');
      const day = d.days[0] || { blocks: [], minutes: 0 };
      drawDay(day);

      const blocks = day.blocks;
      if (!blocks.length) {
        renderState(list, {
          empty: '这一天还没有时间块。可以新建，或让 AI 帮你排一版计划。',
          emptyAction: '<div class="field row" style="margin-top:var(--sp-3);">' +
            '<button class="check-btn" data-act="new-block">新建时间块</button>' +
            '<button class="check-btn" data-act="ai-plan">生成 AI 计划</button></div>',
        });
        return;
      }
      renderState(list, { html: blocks.map(blockRow).join('') });
    } catch (e) {
      renderState(list, { error: e.message });
      const box = $('#calDay');
      if (box) box.querySelectorAll('.block').forEach((n) => n.remove());
    }
  }

  function drawDay(day) {
    const blocks = day.blocks || [];
    const { from, to } = calRange(blocks);
    const hourH = 56;
    const totalMin = (to - from) * 60;

    // 刻度轴
    const axis = $('#calAxis');
    let axisHtml = '';
    for (let h = from; h <= to; h++) {
      axisHtml += '<div class="tick hour">' + String(h).padStart(2, '0') + ':00</div>';
      if (h < to) axisHtml += '<div class="tick"></div>';
    }
    axis.innerHTML = axisHtml;

    // 网格与投递槽
    const grid = $('#calGrid');
    let gridHtml = '';
    for (let h = from; h < to; h++) {
      gridHtml += '<div class="line hour"></div><div class="line"></div>';
    }
    grid.innerHTML = gridHtml;

    const slots = $('#calSlots');
    slots.style.height = (totalMin / 60 * hourH) + 'px';
    slots.innerHTML = '';

    // 时间块
    for (const b of blocks) {
      const s = toMin(b.start_time) - from * 60;
      const e = toMin(b.end_time) - from * 60;
      if (e <= 0 || s >= totalMin) continue;
      const top = Math.max(0, s) / 60 * hourH;
      const height = Math.max(24, (Math.min(e, totalMin) - Math.max(0, s)) / 60 * hourH - 4);
      const el = document.createElement('div');
      el.className = 'block';
      el.style.top = top + 'px';
      el.style.height = height + 'px';
      el.dataset.status = b.status;
      el.dataset.id = b.id;
      el.draggable = b.status === 'planned' || b.status === 'in_progress';
      el.innerHTML =
        '<div class="b-sub">' + esc(b.subject) + '</div>' +
        '<div class="b-title">' + esc(b.title) + '</div>' +
        '<div class="b-time">' + esc(b.start_time) + '–' + esc(b.end_time) + ' · ' + BLOCK_LABEL[b.status] + '</div>';
      el.title = b.title + '（拖动可调整时段）';
      slots.appendChild(el);
    }
  }

  function blockRow(b) {
    const next = (BLOCK_FLOW[b.status] || [])[0];
    const nextLabel = next ? ('标记' + BLOCK_LABEL[next]) : '';
    return '<div class="row-item">' +
      '<span class="dot dot--' + b.status + '"></span>' +
      '<div class="lead">' +
        '<span class="tagk">' + esc(b.subject) + '</span>' +
        '<span class="desc">' + esc(b.title) + '</span>' +
        '<span class="meta">' + esc(b.start_time) + '–' + esc(b.end_time) + ' · ' + BLOCK_LABEL[b.status] +
          (b.source === 'ai' ? ' · AI' : '') + '</span>' +
        (b.skip_reason ? '<span class="meta">跳过原因：' + esc(b.skip_reason) + '</span>' : '') +
      '</div>' +
      '<div class="lead" style="flex:0 0 auto;gap:var(--sp-1);">' +
        (next ? '<button class="check-btn" data-block-status="' + b.id + '" data-next="' + next + '">' + nextLabel + '</button>' : '') +
        (b.status === 'planned' || b.status === 'in_progress'
          ? '<button class="check-btn" data-block-skip="' + b.id + '">跳过</button>' : '') +
        '<button class="check-btn" data-block-edit="' + b.id + '">编辑</button>' +
        '<button class="del-btn" data-block-del="' + b.id + '" title="删除">✕</button>' +
      '</div>' +
    '</div>';
  }

  async function loadWeekView() {
    const list = $('#calList');
    renderState(list, { loading: true });
    $('#calDate').textContent = '本周 · 从 ' + state.cal.date + ' 起';
    try {
      const d = await api('/api/blocks/calendar?date=' + state.cal.date + '&days=7');
      const week = $('#calWeek');
      week.innerHTML = d.days.map((day) => {
        const isToday = day.date === today();
        return '<div class="day-col" data-drop-date="' + day.date + '">' +
          '<div class="day-head' + (isToday ? ' today' : '') + '">' + day.date.slice(5) + ' ' + weekday(day.date) + '</div>' +
          '<div class="day-blocks">' +
          (day.blocks.length ? day.blocks.map((b) =>
            '<div class="mini" draggable="' + (b.status === 'planned' || b.status === 'in_progress') + '" data-id="' + b.id + '" data-status="' + b.status + '">' +
              '<div class="t">' + esc(b.start_time) + '</div>' +
              '<div>' + esc(b.subject) + ' · ' + esc(b.title) + '</div>' +
            '</div>').join('') : '<div class="meta" style="color:var(--label-tertiary);font-size:var(--fs-caption);text-align:center;padding:var(--sp-3) 0;">空闲</div>') +
          '</div></div>';
      }).join('');

      const total = d.days.reduce((s, x) => s + x.blocks.length, 0);
      const minutes = d.days.reduce((s, x) => s + x.minutes, 0);
      renderState(list, {
        empty: '本周还没有任何时间块。',
        html: '<div class="row-item"><span class="meta">本周共 ' + total + ' 个时间块 · 计划总时长 ' +
          Math.round(minutes / 60 * 10) / 10 + ' 小时（拖动可跨天调整）</span></div>',
      });
    } catch (e) {
      renderState(list, { error: e.message });
    }
  }

  // 拖拽：日历内改时段 / 周视图跨天
  function bindCalendarDnD() {
    let dragId = null;

    document.addEventListener('dragstart', (e) => {
      const el = e.target.closest && e.target.closest('.block, .mini');
      if (!el || !el.draggable) return;
      dragId = el.dataset.id;
      el.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', dragId); } catch (_) {}
      e.dataTransfer.effectAllowed = 'move';
    });
    document.addEventListener('dragend', (e) => {
      const el = e.target.closest && e.target.closest('.block, .mini');
      if (el) el.classList.remove('dragging');
      dragId = null;
    });
    document.addEventListener('dragover', (e) => {
      const day = e.target.closest && e.target.closest('#calDay, .day-col');
      if (!day || !dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    document.addEventListener('drop', async (e) => {
      const day = e.target.closest && e.target.closest('#calDay, .day-col');
      if (!day || !dragId) return;
      e.preventDefault();
      const id = dragId;
      dragId = null;
      try {
        if (day.id === 'calDay') {
          // 日内改时段：按落点 y 计算新开始时间（30 分钟对齐）
          const blocks = await currentDayBlocks();
          const { from } = calRange(blocks);
          const rect = day.getBoundingClientRect();
          const y = e.clientY - rect.top;
          const hourH = 56;
          let mins = from * 60 + (y / hourH) * 60;
          mins = Math.max(0, Math.min(23 * 60 + 30, Math.round(mins / 30) * 30));
          const target = blocks.find((b) => String(b.id) === String(id));
          if (!target) return;
          const dur = toMin(target.end_time) - toMin(target.start_time);
          await api('/api/blocks/' + id + '/schedule', {
            method: 'PUT',
            body: { start_time: fromMin(mins), end_time: fromMin(Math.min(24 * 60, mins + dur)) },
          });
          toast('已调整到 ' + fromMin(mins), true);
          loadCalendarView();
        } else {
          const date = day.dataset.dropDate;
          await api('/api/blocks/' + id + '/schedule', { method: 'PUT', body: { block_date: date } });
          toast('已移动到 ' + date, true);
          loadWeekView();
        }
      } catch (err) { toast(err.message); }
    });
  }
  async function currentDayBlocks() {
    const d = await api('/api/blocks/calendar?date=' + state.cal.date + '&days=1');
    return (d.days[0] && d.days[0].blocks) || [];
  }

  function bindCalendarToolbar() {
    $('#btnCalPrev').onclick = () => { state.cal.date = shiftDate(state.cal.date, -1); loadCalendarView(); };
    $('#btnCalNext').onclick = () => { state.cal.date = shiftDate(state.cal.date, 1); loadCalendarView(); };
    $('#btnCalToday').onclick = () => { state.cal.date = today(); loadCalendarView(); };
    $('#btnCalWeek').onclick = () => {
      state.cal.week = !state.cal.week;
      $('#calDayWrap').style.display = state.cal.week ? 'none' : '';
      $('#calWeekWrap').style.display = state.cal.week ? '' : 'none';
      $('#btnCalWeek').textContent = state.cal.week ? '日视图' : '周视图';
      loadCalendarView();
    };
    $('#btnAddBlock').onclick = () => openBlockModal();
    $('#btnAiPlanCal').onclick = genAiPlan;
  }

  function openBlockModal(prefill) {
    const p = prefill || {};
    openModal(p.id ? '编辑时间块' : '新建时间块', [
      { key: 'subject', label: '科目', value: p.subject || '' },
      { key: 'title', label: '标题', value: p.title || '' },
      { key: 'block_date', label: '日期 (YYYY-MM-DD)', value: p.block_date || state.cal.date },
      { key: 'start_time', label: '开始时间 (HH:MM，须对齐 30 分钟)', value: p.start_time || '08:00' },
      { key: 'end_time', label: '结束时间 (HH:MM)', value: p.end_time || '09:00' },
    ], async (v) => {
      if (!v.subject.trim() || !v.title.trim()) throw new Error('科目与标题不能为空');
      if (p.id) {
        await api('/api/blocks/' + p.id, { method: 'PUT', body: { subject: v.subject.trim(), title: v.title.trim() } });
        await api('/api/blocks/' + p.id + '/schedule', {
          method: 'PUT',
          body: { block_date: v.block_date, start_time: v.start_time, end_time: v.end_time },
        });
        toast('时间块已更新', true);
      } else {
        await api('/api/blocks', {
          method: 'POST',
          body: {
            subject: v.subject.trim(), title: v.title.trim(), block_date: v.block_date,
            start_time: v.start_time, end_time: v.end_time,
          },
        });
        toast('时间块已创建', true);
      }
      loadCalendarView();
    });
  }

  async function advanceBlock(id, next) {
    try {
      await api('/api/blocks/' + id + '/status', { method: 'PUT', body: { status: next } });
      toast('已标记为「' + BLOCK_LABEL[next] + '」', true);
      loadCalendarView();
    } catch (e) { toast(e.message); }
  }
  function skipBlock(id) {
    openModal('跳过时间块', [
      { key: 'skip_reason', label: '跳过原因（必填）', value: '', type: 'textarea' },
    ], async (v) => {
      if (!v.skip_reason.trim()) throw new Error('跳过必须填写原因');
      await api('/api/blocks/' + id + '/status', { method: 'PUT', body: { status: 'skipped', skip_reason: v.skip_reason.trim() } });
      toast('已跳过', true);
      loadCalendarView();
    });
  }

  // ============================================================
  // 计划
  // ============================================================
  async function loadPlanView() {
    const list = $('#planList');
    renderState(list, { loading: true });
    const rangeVal = ($('#planRange') && $('#planRange').value) || '30';
    const q = ($('#planSearch') && $('#planSearch').value.trim()) || '';
    try {
      let url;
      if (rangeVal === 'today') url = '/api/plans/today';
      else if (rangeVal === 'all') url = '/api/plans?q=' + encodeURIComponent(q);
      else url = '/api/plans?range=' + rangeVal + (q ? '&q=' + encodeURIComponent(q) : '');
      const d = await api(url);
      const plans = d.plans || [];
      if (!plans.length) {
        renderState(list, {
          empty: rangeVal === 'today' ? '今天还没有计划，可以让 AI 排一版。' : '没有匹配的计划。',
          emptyAction: '<button class="check-btn" data-act="ai-plan" style="margin-top:var(--sp-3);">生成 AI 计划</button>',
        });
        return;
      }
      const doneCnt = plans.filter((p) => p.done).length;
      renderState(list, { html:
        '<div class="row-item"><span class="meta">共 ' + plans.length + ' 条 · 已完成 ' + doneCnt + ' 条</span></div>' +
        plans.map((p) => '<div class="row-item' + (p.done ? ' done' : '') + '">' +
          '<span class="dot dot--' + (p.done ? 'done' : 'planned') + '"></span>' +
          '<div class="lead">' +
            '<span class="tagk">' + esc(p.subject) + '</span>' +
            '<span class="desc">' + esc(p.content) + '</span>' +
            '<span class="meta">' + esc(p.plan_date) + ' · ~' + p.exam_hours + 'h</span>' +
          '</div>' +
          '<div class="lead" style="flex:0 0 auto;gap:var(--sp-1);">' +
            '<button class="check-btn" data-plan-toggle="' + p.id + '" data-done="' + p.done + '">' + (p.done ? '重开' : '完成') + '</button>' +
            '<button class="check-btn" data-plan-edit="' + p.id + '">编辑</button>' +
            '<button class="del-btn" data-plan-del="' + p.id + '">✕</button>' +
          '</div></div>').join('') });
    } catch (e) { renderState(list, { error: e.message }); }
  }

  // ============================================================
  // 模考
  // ============================================================
  async function loadExamView() {
    const list = $('#examList');
    renderState(list, { loading: true });
    try {
      const [trend, page] = await Promise.all([
        api('/api/exams/trend'),
        api('/api/exams?page=1&pageSize=20'),
      ]);
      const kpi = [
        ['模考次数', trend.count + ' 次'],
        ['最新总分', trend.trend.length ? trend.trend[trend.trend.length - 1].total_score : '—'],
        ['提分幅度', (trend.delta >= 0 ? '+' : '') + trend.delta],
        ['平均得分率', trend.avg_rate + '%'],
        ['最好成绩', trend.best ? trend.best.total_score : '—'],
      ];
      $('#examKpis').innerHTML = kpi.map(([l, n]) =>
        '<div class="kpi"><div class="num">' + esc(n) + '</div><div class="lab">' + esc(l) + '</div></div>').join('');

      drawExamCharts(trend);

      const exams = page.exams || [];
      if (!exams.length) {
        renderState(list, { empty: '还没有模考记录，先录入一次成绩吧。' });
        return;
      }
      renderState(list, { html:
        '<div class="row-item"><span class="meta">共 ' + page.total + ' 次模考</span></div>' +
        exams.map((e) => '<div class="row-item">' +
          '<div class="lead">' +
            '<span class="tagk">' + esc(e.exam_date) + '</span>' +
            '<span class="desc">' + esc(e.exam_name) + '</span>' +
            '<span class="meta">' + e.total_score + ' / ' + e.full_score +
              (e.rank_no ? ' · 第 ' + e.rank_no + ' 名' : '') + '</span>' +
            (e.subject_scores && e.subject_scores.length
              ? '<span class="meta">' + e.subject_scores.map((s) => esc(s.subject) + ' ' + s.score).join(' · ') + '</span>' : '') +
          '</div>' +
          '<div class="lead" style="flex:0 0 auto;gap:var(--sp-1);">' +
            '<button class="del-btn" data-exam-del="' + e.id + '">✕</button>' +
          '</div></div>').join('') });
    } catch (e) { renderState(list, { error: e.message }); }
  }
  function drawExamCharts(d) {
    if (typeof Chart === 'undefined') return;
    if (charts.examTrend) charts.examTrend.destroy();
    if (charts.examSubject) charts.examSubject.destroy();
    const tint = cssVar('--tint');
    charts.examTrend = new Chart($('#examTrendChart').getContext('2d'), {
      type: 'line',
      data: {
        labels: d.trend.map((t) => t.exam_date.slice(5)),
        datasets: [{ label: '总分', data: d.trend.map((t) => t.total_score), borderColor: tint, backgroundColor: hexA(tint, 0.12), fill: true, tension: 0.3, pointBackgroundColor: tint }],
      },
      options: appleOptions(false),
    });
    charts.examSubject = new Chart($('#examSubjectChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: d.subjects.map((s) => s.subject),
        datasets: [{ label: '平均得分率%', data: d.subjects.map((s) => s.rate), backgroundColor: hexA(cssVar('--blue'), 0.55), borderColor: cssVar('--blue'), borderWidth: 1, borderRadius: 6 }],
      },
      options: appleOptions(false),
    });
  }

  // ============================================================
  // 错题本
  // ============================================================
  async function loadWrongView() {
    const list = $('#wrongList');
    renderState(list, { loading: true });
    try {
      const sum = await api('/api/wrong/summary');
      $('#wrongKpis').innerHTML = [
        ['错题总数', sum.total + ' 道'],
        ['待重做', sum.by_status.new + ' 道'],
        ['重做中', sum.by_status.reviewing + ' 道'],
        ['已掌握', sum.by_status.mastered + ' 道'],
        ['掌握率', sum.mastery_rate + '%'],
      ].map(([l, n]) => '<div class="kpi"><div class="num">' + esc(n) + '</div><div class="lab">' + esc(l) + '</div></div>').join('');

      const q = ($('#wrongSearch') && $('#wrongSearch').value.trim()) || '';
      const st = ($('#wrongStatus') && $('#wrongStatus').value) || '';
      const d = await api('/api/wrong?page=1&pageSize=50' +
        (q ? '&q=' + encodeURIComponent(q) : '') + (st ? '&status=' + st : ''));
      const rows = d.wrong_questions || [];
      if (!rows.length) {
        renderState(list, { empty: '没有匹配的错题。' });
        return;
      }
      renderState(list, { html:
        '<div class="row-item"><span class="meta">共 ' + d.total + ' 道（按科目掌握率：' +
          sum.subjects.slice(0, 3).map((s) => esc(s.subject) + ' ' + s.mastery_rate + '%').join(' · ') + '）</span></div>' +
        rows.map((w) => '<div class="row-item">' +
          '<span class="dot dot--' + w.status + '"></span>' +
          '<div class="lead">' +
            '<span class="tagk">' + esc(w.subject) + '</span>' +
            (w.knowledge_point ? '<span class="tagk">' + esc(w.knowledge_point) + '</span>' : '') +
            '<span class="desc">' + esc(w.question) + '</span>' +
            (w.wrong_reason ? '<span class="meta">错因：' + esc(w.wrong_reason) + '</span>' : '') +
            '<span class="meta">复做 ' + (w.review_count || 0) + ' 次 · ' + WRONG_LABEL[w.status] + '</span>' +
          '</div>' +
          '<div class="lead" style="flex:0 0 auto;gap:var(--sp-1);">' +
            '<button class="check-btn" data-wrong-review="' + w.id + '">重做</button>' +
            (w.status === 'mastered'
              ? '<button class="check-btn" data-wrong-master="' + w.id + '" data-mastered="0">取消掌握</button>'
              : '<button class="check-btn" data-wrong-master="' + w.id + '" data-mastered="1">标记掌握</button>') +
            '<button class="del-btn" data-wrong-del="' + w.id + '">✕</button>' +
          '</div></div>').join('') });
    } catch (e) { renderState(list, { error: e.message }); }
  }

  // ============================================================
  // 资料库
  // ============================================================
  async function loadMaterialView() {
    const list = $('#matList');
    renderState(list, { loading: true });
    try {
      const sum = await api('/api/materials/summary');
      $('#matKpis').innerHTML = [
        ['资料总数', sum.total + ' 份'],
        ['已读完', sum.finished + ' 份'],
        ['总页数', sum.pages + ' 页'],
        ['已读页数', sum.read_pages + ' 页'],
        ['整体进度', sum.progress + '%'],
      ].map(([l, n]) => '<div class="kpi"><div class="num">' + esc(n) + '</div><div class="lab">' + esc(l) + '</div></div>').join('');

      const q = ($('#matSearch') && $('#matSearch').value.trim()) || '';
      const st = ($('#matStatus') && $('#matStatus').value) || '';
      const d = await api('/api/materials?page=1&pageSize=50' +
        (q ? '&q=' + encodeURIComponent(q) : '') + (st ? '&status=' + st : ''));
      const rows = d.materials || [];
      if (!rows.length) {
        renderState(list, { empty: '还没有资料，先添加一份吧。' });
        return;
      }
      renderState(list, { html:
        '<div class="row-item"><span class="meta">共 ' + d.total + ' 份</span></div>' +
        rows.map((m) => {
          const pct = m.total_pages ? Math.round(m.read_pages / m.total_pages * 100) : 0;
          return '<div class="row-item">' +
            '<div class="lead">' +
              '<span class="tagk">' + esc(m.subject) + '</span>' +
              '<span class="tagk">' + (MAT_TYPE[m.type] || m.type) + '</span>' +
              '<span class="desc">' + esc(m.title) + '</span>' +
              (m.url ? '<a class="meta" href="' + esc(m.url) + '" target="_blank" rel="noopener noreferrer">打开链接</a>' : '') +
              '<span class="meta">' + MAT_LABEL[m.status] + ' · ' + m.read_pages + '/' + m.total_pages + ' 页</span>' +
            '</div>' +
            '<div class="mat-progress">' + bar(pct) + '</div>' +
            '<div class="lead" style="flex:0 0 auto;gap:var(--sp-1);">' +
              '<button class="check-btn" data-mat-progress="' + m.id + '" data-read="' + m.read_pages + '" data-total="' + m.total_pages + '">更新进度</button>' +
              '<button class="del-btn" data-mat-del="' + m.id + '">✕</button>' +
            '</div></div>';
        }).join('') });
    } catch (e) { renderState(list, { error: e.message }); }
  }

  // ============================================================
  // 提醒中心
  // ============================================================
  async function loadReminderView() {
    const list = $('#remList');
    renderState(list, { loading: true });
    try {
      const sum = await api('/api/reminders/summary');
      $('#remKpis').innerHTML = [
        ['提醒总数', sum.total + ' 条'],
        ['待触发', sum.by_status.pending + ' 条'],
        ['已发送', sum.by_status.sent + ' 条'],
        ['已完成', sum.by_status.done + ' 条'],
        ['逾期未处理', sum.overdue + ' 条'],
      ].map(([l, n]) => '<div class="kpi"><div class="num">' + esc(n) + '</div><div class="lab">' + esc(l) + '</div></div>').join('');

      const q = ($('#remSearch') && $('#remSearch').value.trim()) || '';
      const st = ($('#remStatus') && $('#remStatus').value) || '';
      const d = await api('/api/reminders?page=1&pageSize=50' +
        (q ? '&q=' + encodeURIComponent(q) : '') + (st ? '&status=' + st : ''));
      const rows = d.reminders || [];
      if (!rows.length) {
        renderState(list, {
          empty: '暂无提醒。可点「扫描未完成计划」自动生成补做提醒。',
        });
        return;
      }
      renderState(list, { html:
        '<div class="row-item"><span class="meta">共 ' + d.total + ' 条</span></div>' +
        rows.map((r) => '<div class="row-item">' +
          '<span class="dot dot--' + r.status + '"></span>' +
          '<div class="lead">' +
            '<span class="desc">' + esc(r.title) + '</span>' +
            '<span class="meta">' + esc(r.remind_at) + ' · ' + REM_LABEL[r.status] + ' · ' + esc(r.channel) + '</span>' +
          '</div>' +
          '<div class="lead" style="flex:0 0 auto;gap:var(--sp-1);">' +
            (r.status === 'pending' || r.status === 'sent'
              ? '<button class="check-btn" data-rem-status="' + r.id + '" data-next="done">完成</button>' +
                '<button class="check-btn" data-rem-status="' + r.id + '" data-next="dismissed">忽略</button>'
              : '') +
            '<button class="del-btn" data-rem-del="' + r.id + '">✕</button>' +
          '</div></div>').join('') });
    } catch (e) { renderState(list, { error: e.message }); }
  }

  // ============================================================
  // 做题
  // ============================================================
  async function loadQuizView() {
    const list = $('#taskList');
    renderState(list, { loading: true });
    const q = ($('#taskSearch') && $('#taskSearch').value.trim()) || '';
    try {
      const d = await api('/api/tasks?page=1&pageSize=50' + (q ? '&q=' + encodeURIComponent(q) : ''));
      const tasks = d.tasks || [];
      if (!tasks.length) { renderState(list, { empty: '暂无做题记录，请先录入。' }); }
      else {
        renderState(list, { html: tasks.map((t) =>
          '<div class="row-item">' +
            '<span class="dot dot--done"></span>' +
            '<div class="lead">' +
              '<span class="tagk">' + esc(t.subject) + '</span>' +
              '<span class="desc">' + esc(t.tags || '未标注知识点') + '</span>' +
              '<span class="meta">' + t.correct + '/' + t.total + ' 题 · ' +
                (t.total ? Math.round(t.correct / t.total * 100) : 0) + '%</span>' +
            '</div>' +
            '<div class="lead" style="flex:0 0 auto;gap:var(--sp-1);">' +
              '<button class="check-btn" data-task-edit="' + t.id + '">编辑</button>' +
              '<button class="del-btn" data-task-del="' + t.id + '">✕</button>' +
            '</div></div>').join('') });
      }
      loadQuizAccuracy();
    } catch (e) { renderState(list, { error: e.message }); }
  }
  async function loadQuizAccuracy() {
    const v = $('#accuracyView');
    try {
      const d = await api('/api/tasks/accuracy');
      if (!d.accuracy.length) { renderState(v, { empty: '暂无做题记录，无法统计正确率。' }); return; }
      const overall = d.overall
        ? '<div class="row-item"><span class="tagk">总体</span><span class="meta">' +
          d.overall.correct + '/' + d.overall.total + ' 题</span>' + progressLine(d.overall.accuracy) + '</div>' : '';
      renderState(v, { html: overall + d.accuracy.map((s) =>
        '<div class="row-item">' +
          '<div class="lead">' +
            '<span class="tagk">' + esc(s.subject) + '</span>' +
            '<span class="meta">' + s.correct + '/' + s.total + ' 题</span>' +
            progressLine(s.accuracy) +
          '</div>' +
          '<span class="meta">' + (s.tags.length ? s.tags.map((t) => esc(t.tag) + ' ' + t.accuracy + '%').join(' · ') : '无知识点标注') + '</span>' +
        '</div>').join('') });
    } catch (e) { renderState(v, { error: e.message }); }
  }

  // ============================================================
  // 统计
  // ============================================================
  async function loadStatsView() {
    try {
      const d = await api('/api/stats/14');
      const txt = $('#statText');
      renderState(txt, {
        empty: '近 14 天暂无学习时长记录。',
        html: '<div class="row-item"><span class="tagk">近 14 天累计</span><span class="meta">' + d.total_hours + ' 小时</span></div>' +
          d.stats.map((s) => '<div class="row-item">' +
            '<span class="meta">' + esc(s.stat_date) + '</span>' +
            '<span class="tagk">' + s.hours + ' 小时</span>' +
            progressLine(Math.min(100, s.hours / 8 * 100)) +
          '</div>').join(''),
      });
      drawStatsChart(d.stats);
    } catch (e) { toast(e.message); }
  }
  function drawStatsChart(stats) {
    if (typeof Chart === 'undefined') return;
    if (statsChart) statsChart.destroy();
    const tint = cssVar('--tint');
    statsChart = new Chart($('#statsChart').getContext('2d'), {
      type: 'line',
      data: {
        labels: stats.map((s) => s.stat_date.slice(5)),
        datasets: [{ label: '学习时长(h)', data: stats.map((s) => s.hours), borderColor: tint, backgroundColor: hexA(tint, 0.12), fill: true, tension: 0.3, pointBackgroundColor: tint }],
      },
      options: appleOptions(false),
    });
  }

  // ============================================================
  // 目标
  // ============================================================
  async function loadGoalView() {
    try {
      const q = ($('#goalSearch') && $('#goalSearch').value.trim()) || '';
      const d = await api('/api/goals?page=1&pageSize=100' + (q ? '&q=' + encodeURIComponent(q) : ''));
      const goals = d.goals || [];
      const total = goals.reduce((s, g) => s + g.target * g.weight, 0);
      const prog = goals.reduce((s, g) => s + g.progress * g.weight, 0);
      renderState($('#goalSummary'), {
        empty: '',
        html: goals.length
          ? '<div class="row-item"><span class="tagk">加权总目标</span><span class="meta">' + prog + ' / ' + total + '</span>' +
            progressLine(total ? prog / total * 100 : 0) + '</div>' : '',
      });
      const v = $('#goalList');
      if (!goals.length) { renderState(v, { empty: '还没有目标，先添加一个吧。' }); return; }
      renderState(v, { html: goals.map((g) => {
        const pct = g.target ? Math.round(g.progress / g.target * 100) : 0;
        return '<div class="row-item">' +
          '<span class="dot dot--' + (pct >= 100 ? 'done' : pct >= 60 ? 'in_progress' : 'new') + '"></span>' +
          '<div class="lead">' +
            '<span class="tagk">' + esc(g.subject) + '</span>' +
            '<span class="meta">目标 ' + g.target + ' · 权重 ' + g.weight + ' · 当前 ' + g.progress + '</span>' +
            progressLine(pct) +
          '</div>' +
          '<div class="lead" style="flex:0 0 auto;gap:var(--sp-1);">' +
            '<button class="check-btn" data-goal-edit="' + g.id + '">编辑</button>' +
            '<button class="check-btn" data-goal-plus="' + g.id + '" data-progress="' + g.progress + '">+3</button>' +
            '<button class="del-btn" data-goal-del="' + g.id + '">✕</button>' +
          '</div></div>'; }).join('') });
    } catch (e) { toast(e.message); }
  }

  // ============================================================
  // 我的
  // ============================================================
  async function loadMeView() {
    try {
      const d = await api('/api/auth/overview');
      const o = d.overview;
      $('#meKpis').innerHTML = [
        ['距考试', o.days_left != null ? o.days_left + ' 天' : '未设置'],
        ['目标完成度', o.goal_progress + '%'],
        ['总正确率', o.accuracy + '%'],
        ['今日时长', o.today_hours + 'h'],
        ['今日时间块', o.plan_done + ' / ' + o.plan_total],
        ['错题掌握', o.wrong_mastered + ' / ' + o.wrong_total],
        ['资料进度', o.material_progress + '%'],
        ['待处理提醒', o.pending_reminders + ' 条'],
      ].map(([l, n]) => '<div class="kpi"><div class="num">' + esc(n) + '</div><div class="lab">' + esc(l) + '</div></div>').join('');
      $('#meExam').value = o.target_exam;
      $('#meDate').value = o.exam_date || '';

      const sub = await api('/api/subjects');
      renderState($('#meSubjects'), {
        empty: '还没有科目，可在计划或错题中直接使用科目名。',
        html: sub.subjects.map((s) => '<div class="row-item">' +
          '<span class="tagk">' + esc(s.name) + '</span>' +
          '<span class="meta">' + s.kp_count + ' 个知识点 · 平均掌握度 ' + (s.avg_mastery || 0) + '%</span>' +
          progressLine(s.avg_mastery || 0) +
        '</div>').join(''),
      });
    } catch (e) { toast(e.message); }
  }

  // ============================================================
  // 管理
  // ============================================================
  async function loadAdminView() {
    try {
      const d = await api('/api/admin/dashboard');
      const b = d.dashboard;
      $('#adminKpis').innerHTML = [
        ['注册用户', b.users],
        ['活跃用户(7d)', b.active_users],
        ['时间块总数', b.blocks_total],
        ['错题总数', b.wrong_total],
        ['模考次数', b.mock_count],
        ['资料份数', b.material_count],
        ['计划完成率', b.plan_done_rate + '%'],
        ['预测水平', b.predicted_level + '/100'],
      ].map(([l, n]) => '<div class="kpi"><div class="num">' + esc(n) + '</div><div class="lab">' + esc(l) + '</div></div>').join('');
      drawAdminCharts(b);
      loadAdminUsers();
    } catch (e) { toast('管理接口：' + e.message); }
  }
  async function loadAdminUsers() {
    try {
      const d = await api('/api/admin/users?page=1&pageSize=50');
      renderState($('#adminUsers'), {
        empty: '暂无用户。',
        html: d.users.map((u) => '<div class="row-item">' +
          '<span class="tagk">' + esc(u.username) + '</span>' +
          '<span class="tagk">' + esc(u.role) + '</span>' +
          '<span class="meta">' + esc(u.target_exam) + '</span>' +
          '<span class="meta">目标 ' + u.goals + ' · 时间块 ' + u.blocks + ' · 错题 ' + u.wrongs + ' · 模考 ' + u.mocks + '</span>' +
          '<span class="meta">' + esc(u.created_at) + '</span>' +
        '</div>').join(''),
      });
    } catch (e) { toast(e.message); }
  }
  function drawAdminCharts(b) {
    if (typeof Chart === 'undefined') return;
    Object.values(charts).forEach((c) => { try { c.destroy(); } catch (_) {} });
    charts = {};
    const tint = cssVar('--tint'), blue = cssVar('--blue'), green = cssVar('--green'),
      orange = cssVar('--orange'), purple = cssVar('--purple'), red = cssVar('--red');

    charts.radar = new Chart($('#radarChart').getContext('2d'), {
      type: 'radar',
      data: { labels: b.subject_accuracy.map((s) => s.subject), datasets: [{ label: '正确率%', data: b.subject_accuracy.map((s) => s.accuracy), borderColor: tint, backgroundColor: hexA(tint, 0.18), pointBackgroundColor: tint }] },
      options: appleOptions(true),
    });
    charts.trend = new Chart($('#trendChart').getContext('2d'), {
      type: 'line',
      data: { labels: b.trend.map((t) => t.date.slice(5)), datasets: [{ label: '总时长(h)', data: b.trend.map((t) => t.hours), borderColor: blue, backgroundColor: hexA(blue, 0.12), fill: true, tension: 0.3, pointBackgroundColor: blue }] },
      options: appleOptions(false),
    });
    const bs = b.blocks_by_status;
    charts.blocks = new Chart($('#barBlockChart').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['待开始', '进行中', '已完成', '已跳过'],
        datasets: [{ data: [bs.planned, bs.in_progress, bs.done, bs.skipped], backgroundColor: [hexA(tint, 0.7), hexA(orange, 0.8), hexA(green, 0.8), hexA('#8E8E93', 0.6)], borderWidth: 0 }],
      },
      options: appleOptions(true),
    });
    charts.goal = new Chart($('#barGoalChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: b.subject_accuracy.length ? b.subject_accuracy.map((s) => s.subject) : ['目标'],
        datasets: [{
          label: '累计目标分',
          data: b.subject_accuracy.length ? b.subject_accuracy.map(() => Math.round(b.goal_target / (b.subject_accuracy.length || 1))) : [b.goal_target],
          backgroundColor: hexA(orange, 0.55), borderColor: orange, borderWidth: 1, borderRadius: 6,
        }],
      },
      options: appleOptions(false),
    });
    charts.exam = new Chart($('#barExamChart').getContext('2d'), {
      type: 'bar',
      data: { labels: b.exam_distribution.map((e) => e.exam), datasets: [{ label: '人数', data: b.exam_distribution.map((e) => e.c), backgroundColor: hexA(purple, 0.55), borderColor: purple, borderWidth: 1, borderRadius: 6 }] },
      options: appleOptions(false),
    });
    charts.role = new Chart($('#barRoleChart').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: b.role_distribution.map((r) => r.role),
        datasets: [{ data: b.role_distribution.map((r) => r.c), backgroundColor: [hexA(tint, 0.8), hexA(blue, 0.75), hexA(red, 0.7)], borderWidth: 0 }],
      },
      options: appleOptions(true),
    });
  }

  // Chart.js 通用 Apple 配色
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#007AFF';
  }
  function hexA(color, a) {
    const c = String(color).trim();
    if (c.startsWith('#')) {
      const hex = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1);
      const n = parseInt(hex, 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    return c;
  }
  function appleOptions(legend) {
    const label = cssVar('--label-secondary') || 'rgba(60,60,67,0.6)';
    const grid = cssVar('--separator') || 'rgba(60,60,67,0.16)';
    const font = { family: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif', size: 12 };
    return {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: !!legend, labels: { color: label, font, boxWidth: 12, boxHeight: 12, usePointStyle: true } } },
      scales: {
        r: { angleLines: { color: grid }, grid: { color: grid }, pointLabels: { color: label, font }, ticks: { color: label, backdropColor: 'transparent', font } },
        x: { ticks: { color: label, font }, grid: { color: grid, drawBorder: false } },
        y: { ticks: { color: label, font }, grid: { color: grid, drawBorder: false } },
      },
    };
  }

  // ============================================================
  // AI
  // ============================================================
  async function genAiPlan() {
    toast('AI 正在生成今日计划并排入日历…');
    try {
      const d = await api('/api/ai/plan', { method: 'POST', body: { date: state.cal.date } });
      state.aiSource = d.source;
      const el = $('#aiSource');
      if (el) el.textContent = '来源：' + d.source + ' · 已排入 ' + d.blocks.length + ' 个时间块';
      toast('AI 计划已排入日历（' + d.source + '）', true);
      loadCalendarView();
      loadPlanView();
    } catch (e) { toast(e.message); }
  }
  async function runAnalyze(save) {
    const subj = ($('#aiSubject') && $('#aiSubject').value.trim()) || '';
    const box = $('#aiResult');
    box.innerHTML = skeleton(2);
    try {
      const d = await api('/api/ai/analysis', { method: 'POST', body: { subject: subj, save: !!save } });
      state.aiSource = d.source;
      box.innerHTML =
        '<div class="subtitle" style="margin-top:0;">' + esc(subj || (d.data[0] ? d.data[0].subject : '目标科目')) +
          ' · 来源 ' + esc(d.source) + '</div>' +
        '<div class="md-content">' + renderMarkdown(d.advice) + '</div>' +
        (d.reminder ? '<div class="row-item" style="margin-top:var(--sp-4);"><span class="dot dot--pending"></span>' +
          '<span class="meta">已落库为待办提醒：' + esc(d.reminder.title) + '（' + esc(d.reminder.remind_at) + '）</span></div>' : '');
      toast(save ? '建议已生成并落库为待办' : '分析完成', true);
    } catch (e) {
      renderState(box, { error: e.message });
    }
  }
  async function runExplain() {
    const s = ($('#aiExpSubject') && $('#aiExpSubject').value.trim()) || '';
    const q = ($('#aiExpQuestion') && $('#aiExpQuestion').value.trim()) || '';
    const box = $('#aiExplainResult');
    if (!q) { toast('请先填写题目内容'); return; }
    box.innerHTML = skeleton(2);
    try {
      const d = await api('/api/ai/explain', { method: 'POST', body: { subject: s, question: q } });
      box.innerHTML = '<div class="subtitle" style="margin-top:0;">来源 ' + esc(d.source) + '</div>' +
        '<div class="md-content">' + renderMarkdown(d.explanation) + '</div>';
    } catch (e) { renderState(box, { error: e.message }); }
  }

  // ============================================================
  // 弹窗
  // ============================================================
  function openModal(title, fields, onSave) {
    $('#modal').setAttribute('label', title);
    $('#modalBody').innerHTML = fields.map((f) => {
      if (f.type === 'textarea') {
        return '<div class="field"><label>' + esc(f.label) + '</label>' +
          '<sl-textarea data-field="' + f.key + '" rows="3" value="' + esc(f.value == null ? '' : f.value) + '"></sl-textarea></div>';
      }
      if (f.type === 'select') {
        return '<div class="field"><label>' + esc(f.label) + '</label>' +
          '<sl-select data-field="' + f.key + '" value="' + esc(f.value == null ? '' : f.value) + '">' +
          f.options.map((o) => '<sl-option value="' + esc(o) + '">' + esc(o) + '</sl-option>').join('') +
          '</sl-select></div>';
      }
      return '<div class="field"><label>' + esc(f.label) + '</label>' +
        '<sl-input data-field="' + f.key + '" type="' + (f.type || 'text') + '"' +
        (f.min != null ? ' min="' + f.min + '"' : '') + (f.step ? ' step="' + f.step + '"' : '') +
        ' value="' + esc(f.value == null ? '' : f.value) + '"></sl-input></div>';
    }).join('');
    modalUpdater = { onSave, fields };
    const dlg = $('#modal');
    if (dlg && typeof dlg.show === 'function') dlg.show();
    else if (dlg) dlg.setAttribute('open', '');
  }
  function closeModal() {
    const dlg = $('#modal');
    if (dlg && typeof dlg.hide === 'function') dlg.hide();
    else if (dlg) dlg.removeAttribute('open');
    modalUpdater = null;
  }
  function bindModalEvents() {
    $('#btnModalCancel').onclick = closeModal;
    const dlg = $('#modal');
    if (dlg && dlg.addEventListener) dlg.addEventListener('sl-after-hide', () => { modalUpdater = null; });
    $('#btnModalSave').onclick = async () => {
      const mu = modalUpdater;
      if (!mu) return;
      const values = {};
      (mu.fields || []).forEach((f) => {
        const el = $('#modalBody [data-field="' + f.key + '"]');
        values[f.key] = el ? (el.value == null ? '' : el.value) : '';
      });
      try {
        await mu.onSave(values);
        closeModal();
      } catch (e) { toast(e.message); }
    };
  }

  // ============================================================
  // 语音
  // ============================================================
  function speak(text, cb) {
    if (!('speechSynthesis' in window)) { toast('当前浏览器不支持语音合成'); cb && cb(); return; }
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 1; u.pitch = 1;
      speechSynthesis.cancel();
      u.onend = () => cb && cb();
      u.onerror = () => cb && cb();
      speechSynthesis.speak(u);
    } catch (e) { toast('语音合成失败'); cb && cb(); }
  }
  async function speakPlan() {
    try {
      const d = await api('/api/blocks/calendar?date=' + today() + '&days=1');
      const blocks = (d.days[0] && d.days[0].blocks) || [];
      const text = blocks.length
        ? '今日备考时间块：' + blocks.map((b) => b.start_time + ' 到 ' + b.end_time + '，' + b.subject + '，' + b.title + '。').join('')
        : '今日暂无时间块，请先生成 AI 备考计划。';
      toast('正在朗读今日计划…');
      speak(text, () => toast('朗读结束', true));
    } catch (e) { toast(e.message); }
  }
  function voiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('当前浏览器不支持语音识别（建议 Chrome）'); return; }
    const rec = new SR();
    rec.lang = 'zh-CN';
    toast('请说，例如「学习数学2小时」');
    rec.onresult = async (ev) => {
      const txt = ev.results[0][0].transcript;
      const m = txt.match(/(\d+(?:\.\d+)?)\s*小?\s*时?/) || txt.match(/(\d+(?:\.\d+)?)\s*h/i);
      if (!m) { toast('未识别到时长，请说「学习数学2小时」'); return; }
      const hours = parseFloat(m[1]);
      try {
        await api('/api/stats', { method: 'POST', body: { hours, stat_date: today() } });
        toast('已记录 ' + hours + ' 小时学习时长', true);
        loadStatsView(); loadMeView();
      } catch (e) { toast(e.message); }
    };
    rec.onerror = (ev) => toast('语音识别失败：' + ev.error);
    try { rec.start(); } catch (e) { toast('无法启动语音识别'); }
  }

  // ============================================================
  // 命令行引擎
  // ============================================================
  const cmdHistoryLog = [];
  let histIdx = -1, acIdx = 0, acList = [], printQueue = [], printing = false;

  const VIEW_LABEL = {
    calendar: '时间块日历', plan: '备考计划', exam: '模考记录', wrong: '错题本',
    material: '学习资料库', reminder: '提醒中心', quiz: '做题追踪', stats: '学习统计',
    goal: '目标管理', ai: 'AI 智能分析', admin: '管理后台', me: '我的',
  };

  const COMMANDS = [
    { name: 'calendar', usage: 'calendar', desc: '切换视图 → 时间块日历' },
    { name: 'plan', usage: 'plan', desc: '切换视图 → 备考计划' },
    { name: 'exam', usage: 'exam', desc: '切换视图 → 模考记录' },
    { name: 'wrong', usage: 'wrong', desc: '切换视图 → 错题本' },
    { name: 'material', usage: 'material', desc: '切换视图 → 学习资料库' },
    { name: 'reminder', usage: 'reminder', desc: '切换视图 → 提醒中心' },
    { name: 'quiz', usage: 'quiz', desc: '切换视图 → 做题追踪' },
    { name: 'stats', usage: 'stats', desc: '切换视图 → 学习统计' },
    { name: 'goal', usage: 'goal', desc: '切换视图 → 目标管理' },
    { name: 'ai', usage: 'ai', desc: '切换视图 → AI 智能分析' },
    { name: 'me', usage: 'me', desc: '切换视图 → 我的' },
    { name: 'admin', usage: 'admin', desc: '切换视图 → 管理后台（管理员/助教）' },
    { name: 'block', usage: 'block add <科目> <标题> <HH:MM> <HH:MM>', desc: '快捷新增时间块（默认今天）' },
    { name: 'done', usage: 'done <块ID>', desc: '把时间块标记为已完成' },
    { name: 'skip', usage: 'skip <块ID> <原因>', desc: '跳过时间块（必须写原因）' },
    { name: 'aiplan', usage: 'aiplan', desc: '生成 AI 计划并排入日历' },
    { name: 'help', usage: 'help', desc: '列出全部可用命令' },
    { name: 'history', usage: 'history', desc: '显示本次会话的历史指令' },
    { name: 'clear', usage: 'clear', desc: '清屏' },
  ];

  function pushLine(text, cls) {
    return new Promise((resolve) => {
      printQueue.push({ text: String(text == null ? '' : text), cls: cls || '', resolve });
      drainPrint();
    });
  }
  function drainPrint() {
    if (printing) return;
    const job = printQueue.shift();
    if (!job) return;
    const box = $('#console');
    if (!box) { job.resolve(); return; }
    printing = true;
    const line = document.createElement('div');
    line.className = 'cline ' + job.cls;
    box.appendChild(line);
    const full = job.text;
    const speed = (full.length > 240 || !job.cls) ? 0 : 9;
    if (!speed) {
      line.textContent = full;
      box.scrollTop = box.scrollHeight;
      printing = false; job.resolve();
      setTimeout(drainPrint, 0);
      return;
    }
    let i = 0;
    (function step() {
      i += 1;
      line.textContent = full.slice(0, i);
      box.scrollTop = box.scrollHeight;
      if (i < full.length) setTimeout(step, speed);
      else { printing = false; job.resolve(); drainPrint(); }
    })();
  }
  async function printLines(rows) {
    for (const r of rows) {
      if (typeof r === 'string') await pushLine(r, '');
      else await pushLine(r[0], r[1] || '');
    }
  }
  function printBanner() {
    const box = $('#console');
    if (box) box.innerHTML = '';
    printLines([
      ['ExamPrep 命令行已就绪', 'head'],
      ['输入命令后回车执行 · Tab 补全 · ↑↓ 翻历史 · help 查看全部命令', 'sys'],
      ['会话：' + (state.user ? state.user.username : '-') + '（' + String(state.user && state.user.role).toUpperCase() + '）· 目标考试：' + ((state.user && state.user.target_exam) || '未设置'), 'sys'],
    ]);
  }
  function setCmdEnabled(on) {
    const bar = $('#inputbar');
    if (bar) bar.style.display = on ? 'flex' : 'none';
    const ci = $('#cmdInput');
    if (ci) ci.disabled = !on;
    if (!on) {
      hideAc();
      const box = $('#console');
      if (box) box.innerHTML = '';
    }
  }
  function acCandidates(prefix) {
    const p = String(prefix || '').trim().toLowerCase();
    if (!p) return COMMANDS.slice();
    return COMMANDS.filter((c) => c.usage.toLowerCase().startsWith(p));
  }
  function renderAc() {
    const box = $('#cmdAc'), ci = $('#cmdInput');
    if (!box || !ci) return;
    const val = ci.value || '';
    acList = acCandidates(val);
    if (!acList.length || (acList.length === 1 && acList[0].usage.toLowerCase() === val.trim().toLowerCase())) { hideAc(); return; }
    acIdx = 0;
    box.innerHTML = acList.map((c, i) =>
      '<div class="ac-item' + (i === 0 ? ' sel' : '') + '" data-ac="' + i + '">' +
        '<span class="ac-cmd">' + esc(c.usage) + '</span>' +
        '<span class="ac-desc">' + esc(c.desc) + '</span>' +
      '</div>').join('') +
      '<div class="ac-hint">Tab / Enter 补全 · ↑↓ 选择 · Esc 关闭</div>';
    box.classList.add('show');
  }
  function hideAc() {
    const box = $('#cmdAc');
    if (box) { box.classList.remove('show'); box.innerHTML = ''; }
    acList = []; acIdx = 0;
  }
  function acMove(d) {
    const box = $('#cmdAc');
    if (!box || !acList.length) return;
    acIdx = (acIdx + d + acList.length) % acList.length;
    Array.from(box.querySelectorAll('.ac-item')).forEach((el, i) => el.classList.toggle('sel', i === acIdx));
  }
  function acAccept() {
    if (!acList.length) return false;
    const ci = $('#cmdInput');
    if (ci) ci.value = acList[acIdx].usage.replace(/\s*<[^>]*>|\s*\[[^\]]*\]/g, '');
    hideAc();
    return true;
  }

  function gotoView(v) {
    if (!state.token) { pushLine('尚未登录，请先登录。', 'err'); return; }
    if (v === 'admin' && (!state.user || !['admin', 'mentor'].includes(state.user.role))) {
      pushLine('无权限：当前账号不是管理员或助教。', 'err');
      return;
    }
    location.hash = '#/' + v;
    showView(v);
    pushLine('已切换到 ' + (VIEW_LABEL[v] || v), 'ok');
  }
  async function cmdBlockAdd(rest) {
    const toks = String(rest || '').trim().split(/\s+/).filter(Boolean);
    const body = (toks[0] && toks[0].toLowerCase() === 'add') ? toks.slice(1) : toks;
    if (body.length < 4) {
      pushLine('用法：block add <科目> <标题> <开始HH:MM> <结束HH:MM>', 'warn');
      pushLine('示例：block add 数学 洛必达法则专项 08:00 09:00', 'sys');
      return;
    }
    const end = body[body.length - 1], start = body[body.length - 2];
    const subject = body[0];
    const title = body.slice(1, body.length - 2).join(' ');
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
      pushLine('时间格式应为 HH:MM，且对齐 30 分钟。', 'err');
      return;
    }
    const d = await api('/api/blocks', {
      method: 'POST',
      body: { subject, title, block_date: state.cal.date, start_time: start, end_time: end },
    });
    pushLine('时间块已创建：' + subject + ' · ' + title + ' · ' + start + '–' + end + '（ID ' + d.block.id + '）', 'ok');
    loadCalendarView();
  }
  async function cmdBlockStatus(rest, status) {
    const toks = String(rest || '').trim().split(/\s+/).filter(Boolean);
    const id = parseInt(toks[0], 10);
    if (!id) { pushLine('用法：' + (status === 'done' ? 'done <块ID>' : 'skip <块ID> <原因>'), 'warn'); return; }
    const body = { status };
    if (status === 'skipped') {
      const reason = toks.slice(1).join(' ');
      if (!reason) { pushLine('跳过必须写原因，例如：skip 12 临时加课', 'err'); return; }
      body.skip_reason = reason;
    }
    const d = await api('/api/blocks/' + id + '/status', { method: 'PUT', body });
    pushLine('时间块 ' + id + ' 已标记为「' + BLOCK_LABEL[d.block.status] + '」', 'ok');
    loadCalendarView();
  }
  async function cmdHelp() {
    const rows = [['ExamPrep 命令一览（' + COMMANDS.length + '）', 'head']];
    COMMANDS.forEach((c) => rows.push(['  ' + c.usage.padEnd(42, ' ') + '  ' + c.desc, 'sys']));
    rows.push(['提示：命令不区分大小写；视图命令与顶部导航等价。', '']);
    await printLines(rows);
  }
  async function cmdHistoryCmd() {
    if (!cmdHistoryLog.length) { pushLine('（历史为空）', 'sys'); return; }
    const rows = [['历史指令（' + cmdHistoryLog.length + '）', 'head']];
    cmdHistoryLog.forEach((h, i) => rows.push(['  ' + String(i + 1).padStart(3, ' ') + '  ' + h, 'sys']));
    await printLines(rows);
  }
  function cmdClear() {
    const box = $('#console');
    if (box) box.innerHTML = '';
    pushLine('屏幕已清空。', 'sys');
  }

  async function execCommand(raw) {
    const input = String(raw || '').trim();
    if (!input) return;
    cmdHistoryLog.push(input);
    if (cmdHistoryLog.length > 200) cmdHistoryLog.shift();
    histIdx = cmdHistoryLog.length;
    await pushLine(input, 'echo');
    const head = input.split(/\s+/)[0].toLowerCase();
    const rest = input.slice(input.split(/\s+/)[0].length).trim();
    const hit = COMMANDS.find((c) => c.name === head);
    if (!hit) {
      await pushLine('未知命令：' + head, 'err');
      await pushLine('输入 help 查看全部可用命令。', 'sys');
      return;
    }
    try {
      if (VALID_VIEWS.includes(hit.name)) return gotoView(hit.name);
      if (hit.name === 'block') return await cmdBlockAdd(rest);
      if (hit.name === 'done') return await cmdBlockStatus(rest, 'done');
      if (hit.name === 'skip') return await cmdBlockStatus(rest, 'skipped');
      if (hit.name === 'aiplan') {
        const d = await api('/api/ai/plan', { method: 'POST', body: { date: state.cal.date } });
        await pushLine('AI 计划已排入日历：' + d.blocks.length + ' 个时间块（来源 ' + d.source + '）', 'ok');
        d.blocks.forEach((b) => pushLine('  ' + b.start_time + '–' + b.end_time + '  ' + b.subject + ' · ' + b.title, 'sys'));
        loadCalendarView();
        return;
      }
      if (hit.name === 'help') return await cmdHelp();
      if (hit.name === 'history') return await cmdHistoryCmd();
      if (hit.name === 'clear') return cmdClear();
    } catch (e) {
      await pushLine('错误：' + (e && e.message ? e.message : e), 'err');
    }
  }

  function nativeCmdInput() {
    const ci = $('#cmdInput');
    if (!ci) return null;
    if (ci.input && ci.input.tagName === 'INPUT') return ci.input;
    if (ci.shadowRoot) return ci.shadowRoot.querySelector('input');
    return null;
  }
  function bindCommandLine() {
    const ci = $('#cmdInput'), ac = $('#cmdAc');
    if (!ci) return;
    ci.addEventListener('sl-input', () => renderAc());
    ci.addEventListener('sl-focus', () => renderAc());
    ci.addEventListener('sl-blur', () => setTimeout(hideAc, 150));
    if (ac) {
      ac.addEventListener('mousedown', (e) => {
        const item = e.target.closest && e.target.closest('.ac-item');
        if (!item) return;
        e.preventDefault();
        acIdx = Number(item.dataset.ac) || 0;
        acAccept();
        const n = nativeCmdInput();
        if (n) n.focus();
      });
    }
    let n = nativeCmdInput();
    if (!n) setTimeout(() => { const r = nativeCmdInput(); if (r) attachCmdKeys(ci, r); }, 400);
    else attachCmdKeys(ci, n);
  }
  function attachCmdKeys(ci, n) {
    if (n.__epBound) return;
    n.__epBound = true;
    n.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); if (acList.length) { if (!acAccept()) renderAc(); } else renderAc(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (acList.length) acMove(1); return; }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (acList.length) { acMove(-1); return; }
        if (!cmdHistoryLog.length) return;
        histIdx = Math.max(0, (histIdx < 0 ? cmdHistoryLog.length : histIdx) - 1);
        ci.value = cmdHistoryLog[histIdx] || '';
        hideAc();
        return;
      }
      if (e.key === 'Escape') { hideAc(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (acList.length && acList[acIdx] && (ci.value || '').trim().toLowerCase() !== acList[acIdx].name) acAccept();
        const cmd = (ci.value || '').trim();
        if (!cmd) return;
        ci.value = '';
        hideAc();
        execCommand(cmd);
      }
    });
  }

  // ============================================================
  // 事件绑定
  // ============================================================
  function bindEvents() {
    // 登录
    $('#btnLogin').onclick = async () => {
      const username = $('#loginUser').value.trim();
      const password = $('#loginPass').value;
      if (!username || !password) { $('#loginMsg').textContent = '用户名和密码不能为空'; return; }
      if (password.length < 6) { $('#loginMsg').textContent = '密码至少 6 位'; return; }
      try {
        const d = await api('/api/auth/login', { method: 'POST', body: { username, password } });
        saveSession(d.user, d.token);
        $('#loginMsg').textContent = '';
        showAuthedUI();
        toast('欢迎回来，' + d.user.username, true);
      } catch (e) { $('#loginMsg').textContent = e.message; }
    };
    $('#loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnLogin').click(); });
    $('#btnGotoRegister').onclick = () => { $('#registerBox').style.display = ''; $('#loginMsg').textContent = ''; };
    $('#btnBackLogin').onclick = () => { $('#registerBox').style.display = 'none'; };
    $('#btnRegister').onclick = async () => {
      const username = $('#regUser').value.trim();
      const password = $('#regPass').value;
      if (!username || !password) { $('#regMsg').textContent = '用户名和密码不能为空'; return; }
      if (password.length < 6) { $('#regMsg').textContent = '密码至少 6 位'; return; }
      try {
        const d = await api('/api/auth/register', {
          method: 'POST',
          body: { username, password, target_exam: $('#regExam').value, exam_date: $('#regDate').value },
        });
        saveSession(d.user, d.token);
        $('#registerBox').style.display = 'none';
        $('#regMsg').textContent = '';
        $('#regUser').value = $('#regPass').value = $('#regDate').value = '';
        showAuthedUI();
        toast('注册成功，已自动登录', true);
      } catch (e) { $('#regMsg').textContent = e.message; }
    };
    $('#btnLogout').onclick = () => { saveSession(null, null); showAuthUI('已退出登录'); };

    // 路由与导航
    $('#btnErrBack').onclick = () => { location.hash = state.token ? '#/calendar' : '#/login'; };
    window.addEventListener('hashchange', () => {
      const v = (location.hash || '').replace('#/', '');
      showView(v || (state.token ? 'calendar' : 'login'));
    });
    $$('.navbtn').forEach((b) => b.addEventListener('click', () => { location.hash = '#/' + b.dataset.view; }));

    bindCalendarToolbar();
    bindCalendarDnD();

    // 计划
    $('#btnAiPlan').onclick = genAiPlan;
    $('#btnSpeakPlan').onclick = speakPlan;
    $('#btnSpeakRecognize').onclick = voiceInput;
    $('#planSearch').addEventListener('sl-input', () => { clearTimeout(window.__ps); window.__ps = setTimeout(loadPlanView, 220); });
    $('#planRange').addEventListener('sl-change', loadPlanView);
    $('#btnAddPlan').onclick = async () => {
      const subject = $('#pSubject').value.trim();
      const content = $('#pContent').value.trim();
      const hours = parseFloat($('#pHours').value);
      if (!subject || !content) { toast('科目与内容不能为空'); return; }
      if (!(hours >= 0)) { toast('请输入合法的预计时长（0-24 小时）'); return; }
      try {
        await api('/api/plans', { method: 'POST', body: { plan_date: today(), subject, content, exam_hours: hours } });
        $('#pSubject').value = ''; $('#pContent').value = ''; $('#pHours').value = '';
        toast('计划已添加', true);
        $('#planRange').value = 'today';
        loadPlanView();
      } catch (e) { toast(e.message); }
    };

    // 模考
    $('#btnAddExam').onclick = async () => {
      const name = $('#exName').value.trim();
      const date = $('#exDate').value || today();
      const total = parseFloat($('#exTotal').value);
      const full = parseFloat($('#exFull').value) || 500;
      if (!name) { toast('模考名称不能为空'); return; }
      if (!(total >= 0)) { toast('请输入总分'); return; }
      let scores = [];
      const raw = $('#exScores').value.trim();
      if (raw) {
        try { scores = JSON.parse(raw); } catch (e) { toast('各科得分不是合法 JSON'); return; }
        if (!Array.isArray(scores)) { toast('各科得分需为 JSON 数组'); return; }
      }
      try {
        await api('/api/exams', {
          method: 'POST',
          body: {
            exam_name: name, exam_date: date, total_score: total, full_score: full,
            subject_scores: scores, rank_no: parseFloat($('#exRank').value) || null,
          },
        });
        $('#exName').value = $('#exTotal').value = $('#exRank').value = $('#exScores').value = '';
        toast('模考已录入', true);
        loadExamView(); loadMeView();
      } catch (e) { toast(e.message); }
    };

    // 错题
    $('#btnAddWrong').onclick = async () => {
      const subject = $('#wSubject').value.trim();
      const question = $('#wQuestion').value.trim();
      if (!subject || !question) { toast('科目与题目不能为空'); return; }
      try {
        await api('/api/wrong', {
          method: 'POST',
          body: {
            subject, question,
            knowledge_point: $('#wKp').value.trim(),
            my_answer: $('#wMine').value.trim(),
            right_answer: $('#wRight').value.trim(),
            wrong_reason: $('#wReason').value.trim(),
          },
        });
        ['#wSubject', '#wQuestion', '#wKp', '#wMine', '#wRight', '#wReason'].forEach((s) => { $(s).value = ''; });
        toast('错题已录入', true);
        loadWrongView();
      } catch (e) { toast(e.message); }
    };
    $('#wrongSearch').addEventListener('sl-input', () => { clearTimeout(window.__ws); window.__ws = setTimeout(loadWrongView, 220); });
    $('#wrongStatus').addEventListener('sl-change', loadWrongView);

    // 资料
    $('#btnAddMat').onclick = async () => {
      const subject = $('#mSubject').value.trim();
      const title = $('#mTitle').value.trim();
      if (!subject || !title) { toast('科目与标题不能为空'); return; }
      try {
        await api('/api/materials', {
          method: 'POST',
          body: {
            subject, title, type: $('#mType').value, url: $('#mUrl').value.trim(),
            total_pages: parseFloat($('#mPages').value) || 0,
          },
        });
        ['#mSubject', '#mTitle', '#mUrl', '#mPages'].forEach((s) => { $(s).value = ''; });
        toast('资料已新增', true);
        loadMaterialView();
      } catch (e) { toast(e.message); }
    };
    $('#matSearch').addEventListener('sl-input', () => { clearTimeout(window.__ms); window.__ms = setTimeout(loadMaterialView, 220); });
    $('#matStatus').addEventListener('sl-change', loadMaterialView);

    // 提醒
    $('#btnScanReminders').onclick = async () => {
      try {
        const d = await api('/api/reminders/scan', { method: 'POST' });
        toast(d.created ? ('已生成 ' + d.created + ' 条补做提醒') : '没有需要补做的计划', true);
        loadReminderView();
      } catch (e) { toast(e.message); }
    };
    $('#btnAddReminder').onclick = () => {
      openModal('新建提醒', [
        { key: 'title', label: '提醒标题', value: '' },
        { key: 'remind_at', label: '提醒时间 (YYYY-MM-DD HH:MM)', value: today() + ' 20:00' },
        { key: 'channel', label: '渠道', value: 'app', type: 'select', options: ['app', 'sms', 'email'] },
      ], async (v) => {
        if (!v.title.trim()) throw new Error('提醒标题不能为空');
        await api('/api/reminders', { method: 'POST', body: { title: v.title.trim(), remind_at: v.remind_at.trim(), channel: v.channel } });
        toast('提醒已创建', true);
        loadReminderView();
      });
    };
    $('#remSearch').addEventListener('sl-input', () => { clearTimeout(window.__rs); window.__rs = setTimeout(loadReminderView, 220); });
    $('#remStatus').addEventListener('sl-change', loadReminderView);

    // 做题
    $('#taskSearch').addEventListener('sl-input', () => { clearTimeout(window.__ts); window.__ts = setTimeout(loadQuizView, 220); });
    $('#btnAddTask').onclick = async () => {
      const subject = $('#qSubject').value.trim();
      const total = parseInt($('#qTotal').value, 10);
      const correct = parseInt($('#qCorrect').value, 10);
      const tags = $('#qTags').value.trim();
      if (!subject) { toast('科目不能为空'); return; }
      if (!total || total <= 0) { toast('做题数需大于 0'); return; }
      if (!(correct >= 0) || correct > total) { toast('做对数需在 0-' + total + ' 之间'); return; }
      try {
        await api('/api/tasks', { method: 'POST', body: { subject, total, correct, tags } });
        ['#qSubject', '#qTotal', '#qCorrect', '#qTags'].forEach((s) => { $(s).value = ''; });
        toast('做题记录已录入', true);
        loadQuizView(); loadMeView();
      } catch (e) { toast(e.message); }
    };

    // 统计
    $('#btnAddStat').onclick = async () => {
      const hours = parseFloat($('#statHours').value);
      if (!(hours > 0)) { toast('时长需大于 0'); return; }
      try {
        await api('/api/stats', { method: 'POST', body: { hours } });
        $('#statHours').value = '';
        toast('学习时长已记录', true);
        loadStatsView(); loadMeView();
      } catch (e) { toast(e.message); }
    };

    // 目标
    $('#goalSearch').addEventListener('sl-input', () => { clearTimeout(window.__gs); window.__gs = setTimeout(loadGoalView, 220); });
    $('#btnAddGoal').onclick = async () => {
      const subject = $('#gSubject').value.trim();
      const target = parseInt($('#gTarget').value, 10);
      const weight = parseInt($('#gWeight').value, 10) || 1;
      const progress = parseInt($('#gProgress').value, 10) || 0;
      if (!subject) { toast('科目不能为空'); return; }
      if (!(target > 0)) { toast('目标分需大于 0'); return; }
      try {
        await api('/api/goals', { method: 'POST', body: { subject, target, weight, progress } });
        ['#gSubject', '#gTarget', '#gWeight', '#gProgress'].forEach((s) => { $(s).value = ''; });
        toast('目标已添加', true);
        loadGoalView(); loadMeView();
      } catch (e) { toast(e.message); }
    };

    // AI
    $('#btnAnalyze').onclick = () => runAnalyze(false);
    $('#btnAnalyzeSave').onclick = () => runAnalyze(true);
    $('#btnExplain').onclick = runExplain;

    // 我的
    $('#btnUpdateMe').onclick = async () => {
      try {
        const d = await api('/api/auth/me', { method: 'PUT', body: { target_exam: $('#meExam').value, exam_date: $('#meDate').value } });
        saveSession(d.user, state.token);
        $('#statusMsg').textContent = d.user.username + ' · ' + (d.user.target_exam || '未设置考试') +
          (d.user.exam_date ? ' · 考试日期 ' + d.user.exam_date : '') + ' · ' + String(d.user.role).toUpperCase();
        toast('个人信息已更新', true);
        loadMeView();
      } catch (e) { toast(e.message); }
    };

    bindModalEvents();
    bindCommandLine();

    // 动态事件委托
    document.addEventListener('click', async (e) => {
      const t = e.target.closest ? e.target.closest('button') : null;
      if (!t) return;
      const d = t.dataset;
      try {
        // 日历 / 时间块
        if (d.blockStatus) return advanceBlock(d.blockStatus, d.next);
        if (d.blockSkip) return skipBlock(d.blockSkip);
        if (d.blockEdit) {
          const b = await api('/api/blocks/' + d.blockEdit);
          return openBlockModal(b.block);
        }
        if (d.blockDel) {
          if (!confirm('确定删除该时间块？')) return;
          await api('/api/blocks/' + d.blockDel, { method: 'DELETE' });
          toast('已删除', true);
          return loadCalendarView();
        }
        if (d.act === 'new-block') return openBlockModal();
        if (d.act === 'ai-plan') return genAiPlan();
        // 计划
        if (d.planToggle) {
          await api('/api/plans/' + d.planToggle, { method: 'PUT', body: { done: d.done !== '1' } });
          return loadPlanView();
        }
        if (d.planEdit) {
          const p = (await api('/api/plans/' + d.planEdit)).plan;
          return openModal('编辑计划', [
            { key: 'subject', label: '科目', value: p.subject },
            { key: 'content', label: '内容', value: p.content, type: 'textarea' },
            { key: 'exam_hours', label: '时长(h)', value: p.exam_hours, type: 'number', min: 0, step: '0.5' },
          ], async (v) => {
            if (!v.subject.trim() || !v.content.trim()) throw new Error('科目与内容不能为空');
            await api('/api/plans/' + p.id, {
              method: 'PUT',
              body: { subject: v.subject.trim(), content: v.content.trim(), exam_hours: parseFloat(v.exam_hours) || 0 },
            });
            toast('计划已更新', true);
            loadPlanView();
          });
        }
        if (d.planDel) {
          if (!confirm('确定删除该计划？')) return;
          await api('/api/plans/' + d.planDel, { method: 'DELETE' });
          return loadPlanView();
        }
        // 模考
        if (d.examDel) {
          if (!confirm('确定删除该模考记录？')) return;
          await api('/api/exams/' + d.examDel, { method: 'DELETE' });
          toast('已删除', true);
          return loadExamView();
        }
        // 错题
        if (d.wrongReview) {
          await api('/api/wrong/' + d.wrongReview + '/review', { method: 'PUT', body: {} });
          toast('已记一次重做', true);
          return loadWrongView();
        }
        if (d.wrongMaster) {
          await api('/api/wrong/' + d.wrongMaster + '/master', { method: 'PUT', body: { mastered: d.mastered === '1' } });
          toast(d.mastered === '1' ? '已标记掌握' : '已取消掌握', true);
          return loadWrongView();
        }
        if (d.wrongDel) {
          if (!confirm('确定删除该错题？')) return;
          await api('/api/wrong/' + d.wrongDel, { method: 'DELETE' });
          return loadWrongView();
        }
        // 资料
        if (d.matProgress) {
          return openModal('更新阅读进度', [
            { key: 'read_pages', label: '已读页数（总 ' + d.total + ' 页）', value: d.read, type: 'number', min: 0 },
          ], async (v) => {
            await api('/api/materials/' + d.matProgress + '/progress', {
              method: 'PUT', body: { read_pages: parseInt(v.read_pages, 10) || 0 },
            });
            toast('进度已更新', true);
            loadMaterialView();
          });
        }
        if (d.matDel) {
          if (!confirm('确定删除该资料？')) return;
          await api('/api/materials/' + d.matDel, { method: 'DELETE' });
          return loadMaterialView();
        }
        // 提醒
        if (d.remStatus) {
          await api('/api/reminders/' + d.remStatus + '/status', { method: 'PUT', body: { status: d.next } });
          toast('已更新', true);
          return loadReminderView();
        }
        if (d.remDel) {
          if (!confirm('确定删除该提醒？')) return;
          await api('/api/reminders/' + d.remDel, { method: 'DELETE' });
          return loadReminderView();
        }
        // 做题
        if (d.taskEdit) {
          const task = (await api('/api/tasks/' + d.taskEdit)).task;
          return openModal('编辑做题记录', [
            { key: 'subject', label: '科目', value: task.subject },
            { key: 'total', label: '做题数', value: task.total, type: 'number', min: 1 },
            { key: 'correct', label: '做对数', value: task.correct, type: 'number', min: 0 },
            { key: 'tags', label: '知识点', value: task.tags || '' },
          ], async (v) => {
            const total = parseInt(v.total, 10), correct = parseInt(v.correct, 10);
            if (!v.subject.trim()) throw new Error('科目不能为空');
            if (!(total > 0)) throw new Error('做题数需大于 0');
            if (correct < 0 || correct > total) throw new Error('做对数需在 0-' + total + ' 之间');
            await api('/api/tasks/' + task.id, {
              method: 'PUT',
              body: { subject: v.subject.trim(), total, correct, tags: v.tags.trim() },
            });
            toast('记录已更新', true);
            loadQuizView();
          });
        }
        if (d.taskDel) {
          if (!confirm('确定删除该做题记录？')) return;
          await api('/api/tasks/' + d.taskDel, { method: 'DELETE' });
          return loadQuizView();
        }
        // 目标
        if (d.goalPlus) {
          await api('/api/goals/' + d.goalPlus, { method: 'PUT', body: { progress: parseInt(d.progress, 10) + 3 } });
          loadGoalView(); loadMeView();
          return;
        }
        if (d.goalEdit) {
          const goals = (await api('/api/goals')).goals;
          const g = goals.find((x) => String(x.id) === String(d.goalEdit));
          if (!g) { toast('目标不存在'); return; }
          return openModal('编辑目标 · ' + g.subject, [
            { key: 'subject', label: '科目', value: g.subject },
            { key: 'target', label: '目标分', value: g.target, type: 'number', min: 1 },
            { key: 'weight', label: '权重', value: g.weight, type: 'number', min: 0 },
            { key: 'progress', label: '当前进度分', value: g.progress, type: 'number', min: 0 },
          ], async (v) => {
            const target = parseInt(v.target, 10), weight = parseInt(v.weight, 10), progress = parseInt(v.progress, 10);
            if (!v.subject.trim()) throw new Error('科目不能为空');
            if (!(target > 0)) throw new Error('目标分需大于 0');
            await api('/api/goals/' + g.id, { method: 'PUT', body: { subject: v.subject.trim(), target, weight, progress } });
            toast('目标已更新', true);
            loadGoalView(); loadMeView();
          });
        }
        if (d.goalDel) {
          if (!confirm('确定删除该目标？')) return;
          await api('/api/goals/' + d.goalDel, { method: 'DELETE' });
          loadGoalView(); loadMeView();
          return;
        }
      } catch (err) { toast(err.message); }
    });
  }

  // ===== 时钟 =====
  function clock() {
    const el = $('#statusClock');
    if (!el) return;
    const n = new Date();
    el.textContent = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
  }

  // ===== 启动 =====
  function init() {
    setInterval(clock, 1000); clock();
    bindEvents();
    if (state.token && state.user) {
      api('/api/auth/me').then(() => showAuthedUI()).catch(() => { saveSession(null, null); showAuthUI('登录已过期，请重新登录'); });
    } else {
      showAuthUI();
    }
  }
  function boot() {
    if (window.customElements && customElements.whenDefined) {
      Promise.race([customElements.whenDefined('sl-input'), new Promise((r) => setTimeout(r, 1500))]).then(init);
    } else init();
  }
  boot();
})();
