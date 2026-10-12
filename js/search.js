/* ===================================================
   首页搜索框：真实搜索
   - 输入时在下方弹出结果面板
   - ↑ ↓ 选择、Enter 打开选中的那篇
   - 没选中时按 Enter → 跳到列表页看全部结果
   - Esc / 点空白处 关闭
   =================================================== */
(function () {
  'use strict';

  const bar      = document.getElementById('searchBar');
  const input    = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  const panel    = document.getElementById('searchPanel');

  if (!bar || !input || !clearBtn || !panel) return;

  const MAX = 8;

  let index   = [];     // 搜索索引
  let results = [];     // 当前结果
  let active  = -1;     // 键盘选中的下标

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------- 索引 ---------- */
  async function loadIndex() {
    try {
      const res = await fetch(SITE_ROOT + 'data/search-index.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      index = await res.json();
    } catch (e) {
      console.warn('[search] 索引加载失败，退回到只搜标题', e);
      try {
        const res = await fetch(SITE_ROOT + 'data/posts.json');
        if (res.ok) index = (await res.json()).map(p => Object.assign({}, p, { text: '' }));
      } catch (e2) {
        index = [];
      }
    }
    if (!Array.isArray(index)) index = [];
  }

  /* ---------- 面板开关 ---------- */
  function closePanel() {
    panel.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
  }

  function openPanel() {
    if (!input.value.trim()) { closePanel(); return; }
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  /* ---------- 渲染 ---------- */
  function render() {
    const q = input.value.trim();

    if (!results.length) {
      panel.innerHTML = '<div class="search-empty">没有找到相关文章</div>';
      openPanel();
      return;
    }

    const shown = results.slice(0, MAX);

    panel.innerHTML = shown.map(function (r, i) {
      const snip = window.SearchCore.snippet(r.text, q, 56);
      return '<a class="search-item' + (i === active ? ' active' : '') + '" ' +
             'href="' + SITE_ROOT + 'pages/post.html?slug=' + encodeURIComponent(r.slug) + '" ' +
             'data-i="' + i + '" role="option">' +
               '<span class="si-title">' + window.SearchCore.highlight(r.title, q) + '</span>' +
               '<span class="si-meta">' + esc(r.date) + ' · ' + esc(r.category || '未分类') +
                 (r.tags && r.tags.length ? ' · ' + esc(r.tags.join(' / ')) : '') +
               '</span>' +
               (snip ? '<span class="si-snippet">' + window.SearchCore.highlight(snip, q) + '</span>' : '') +
             '</a>';
    }).join('') +
    (results.length > MAX
      ? '<div class="search-more">共 ' + results.length + ' 条，按 Enter 查看全部</div>'
      : '');

    openPanel();
  }

  /* ---------- 搜索 ---------- */
  function doSearch() {
    const q = input.value.trim();
    clearBtn.classList.toggle('visible', input.value.length > 0);

    if (!q) { results = []; closePanel(); return; }

    results = window.SearchCore.search(index, q);
    active = -1;
    render();
  }

  /* ---------- 跳到列表页看全部 ---------- */
  function goToList() {
    const q = input.value.trim();
    if (q) location.href = SITE_ROOT + 'pages/posts.html?q=' + encodeURIComponent(q);
  }

  /* ---------- 键盘上下移动 ---------- */
  function move(delta) {
    if (!results.length || panel.hidden) return;
    const n = Math.min(results.length, MAX);
    active = active + delta;
    if (active < 0) active = n - 1;
    if (active >= n) active = 0;
    render();
  }

  /* ---------- 事件 ---------- */
  bar.addEventListener('click', function (e) {
    if (e.target.closest('.search-clear')) return;
    input.focus();
  });

  input.addEventListener('input', doSearch);

  input.addEventListener('focus', function () {
    if (input.value.trim()) doSearch();
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && results[active]) {
        location.href = SITE_ROOT + 'pages/post.html?slug=' + encodeURIComponent(results[active].slug);
      } else {
        goToList();
      }
    } else if (e.key === 'Escape') {
      input.value = '';
      results = [];
      clearBtn.classList.remove('visible');
      closePanel();
      input.blur();
    }
  });

  clearBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    input.value = '';
    results = [];
    clearBtn.classList.remove('visible');
    closePanel();
    input.focus();
  });

  /* 点面板以外的地方就收起 */
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search-wrap')) closePanel();
  });

  /* ⌘K / Ctrl+K 唤起 */
  document.addEventListener('keydown', function (e) {
    const isMac = /MAC/i.test(navigator.platform || '');
    const modifier = isMac ? e.metaKey : e.ctrlKey;
    if (modifier && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (document.activeElement === input) {
        input.blur();
        closePanel();
      } else {
        input.focus();
        input.select();
      }
    }
  });

  /* ---------- 启动 ---------- */
  loadIndex();
})();
