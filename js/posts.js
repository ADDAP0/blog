/* ===================================================
   文章列表页
   几种状态，全部用 URL 参数切换：
     （无）           全部文章，按时间倒序
     view=category    分类，胶囊筛选
     view=tag         标签，胶囊筛选
     view=archive     归档，按年月分组
     q=关键词         搜索结果（首页搜索框回车后跳到这里）
   筛选状态都写进 URL，可分享、可前进后退。
   =================================================== */
(function () {
  'use strict';

  const VIEWS = ['all', 'category', 'tag', 'archive'];

  const tabsEl   = document.getElementById('viewTabs');
  const filterEl = document.getElementById('filterBar');
  const listEl   = document.getElementById('postList');
  const subEl    = document.getElementById('pageSub');

  let posts = [];
  let searchIndex = null;          // 搜索时按需加载
  const state = { view: 'all', category: null, tag: null, q: '' };

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 有搜索词时把命中处高亮；highlight 自己会转义 */
  function hl(text, query) {
    if (query && window.SearchCore && window.SearchCore.highlight) {
      return window.SearchCore.highlight(text, query);
    }
    return esc(text);
  }

  function listState(icon, text) {
    return '<div class="list-state">' +
      '<span class="material-symbols-rounded">' + icon + '</span>' + text + '</div>';
  }

  const catOf = p => p.category || '未分类';

  function postUrl(slug) {
    return SITE_ROOT + 'pages/post.html?slug=' + encodeURIComponent(slug);
  }

  /* ---------- URL <-> state ---------- */
  function readUrl() {
    const p = new URLSearchParams(location.search);
    const v = p.get('view');
    state.view = VIEWS.indexOf(v) !== -1 ? v : 'all';
    state.category = p.get('category');
    state.tag = p.get('tag');
    state.q = (p.get('q') || '').trim();
  }

  function currentUrl() {
    const p = new URLSearchParams();
    if (state.view !== 'all') p.set('view', state.view);
    if (state.view === 'category' && state.category) p.set('category', state.category);
    if (state.view === 'tag' && state.tag) p.set('tag', state.tag);
    if (state.q) p.set('q', state.q);
    const qs = p.toString();
    return location.pathname + (qs ? '?' + qs : '');
  }

  function pushUrl() {
    const url = currentUrl();
    if (url !== location.pathname + location.search) {
      history.pushState(null, '', url);
    }
  }

  /* 给 <a> 生成真实可用的 href —— 万一 JS 没跑，链接也能用 */
  function filterHref(view, value) {
    const p = new URLSearchParams();
    p.set('view', view);
    if (value) p.set(view === 'category' ? 'category' : 'tag', value);
    return SITE_ROOT + 'pages/posts.html?' + p.toString();
  }

  /* ---------- 状态切换 ---------- */
  function selectView(view) {
    state.view = view;
    state.category = null;
    state.tag = null;
    state.q = '';
    pushUrl();
    render();
  }

  function selectCategory(value) {
    state.category = value || null;
    pushUrl();
    render();
  }

  function selectTag(value) {
    state.tag = value || null;
    pushUrl();
    render();
  }

  /* ---------- 视图切换条 ---------- */
  function renderTabs() {
    if (!tabsEl) return;
    Array.prototype.forEach.call(tabsEl.querySelectorAll('.view-tab'), a => {
      a.classList.toggle('active', !state.q && a.dataset.view === state.view);
    });
  }

  /* ---------- 筛选胶囊 ---------- */
  function renderFilter() {
    if (!filterEl) return;

    /* 搜索模式下只给一个“清除搜索”的出口 */
    if (state.q) {
      filterEl.innerHTML =
        '<a class="filter-chip active" href="' + SITE_ROOT + 'pages/posts.html?view=all" title="清除搜索，回到全部文章">' +
          '搜索「' + esc(state.q) + '」 ✕' +
        '</a>';
      return;
    }

    const isCat = state.view === 'category';
    const isTag = state.view === 'tag';

    if (!isCat && !isTag) {
      filterEl.innerHTML = '';
      return;
    }

    const counts = new Map();
    posts.forEach(p => {
      const values = isCat ? [catOf(p)] : (p.tags || []);
      values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    });

    const entries = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'));

    const active = isCat ? state.category : state.tag;
    const view = state.view;

    let html = '<a class="filter-chip' + (active ? '' : ' active') + '" ' +
      'href="' + esc(filterHref(view, '')) + '">全部' +
      '<span class="count">' + posts.length + '</span></a>';

    html += entries.map(([name, n]) =>
      '<a class="filter-chip' + (name === active ? ' active' : '') + '" ' +
      'href="' + esc(filterHref(view, name)) + '">' + esc(name) +
      '<span class="count">' + n + '</span></a>'
    ).join('');

    filterEl.innerHTML = html;
  }

  /* ---------- 卡片 ---------- */
  function cardHtml(p, query) {
    const tags = (p.tags || []).map(t =>
      '<span class="tag-pill"><span class="material-symbols-rounded">sell</span>' + esc(t) + '</span>'
    ).join('');

    return '' +
      '<a class="post-item" href="' + esc(postUrl(p.slug)) + '">' +
        '<div class="post-item-head">' +
          '<span class="post-item-date">' + esc(p.date) + '</span>' +
          '<span class="post-item-cat"><span class="material-symbols-rounded">category</span>' +
            esc(catOf(p)) + '</span>' +
        '</div>' +
        '<h2 class="post-item-title">' + hl(p.title, query) + '</h2>' +
        '<p class="post-item-summary">' + hl(p.summary, query) + '</p>' +
        (tags ? '<div class="post-item-tags">' + tags + '</div>' : '') +
      '</a>';
  }

  /* ---------- 归档：按年月分组 ---------- */
  function archiveHtml() {
    const groups = new Map();
    posts.forEach(p => {
      const ym = String(p.date).slice(0, 7);
      if (!groups.has(ym)) groups.set(ym, []);
      groups.get(ym).push(p);
    });

    return Array.from(groups.keys()).sort().reverse().map(ym => {
      const parts = ym.split('-');
      const items = groups.get(ym);

      return '' +
        '<section class="archive-group">' +
          '<div class="archive-head">' +
            '<b>' + esc(parts[0]) + ' 年 ' + Number(parts[1]) + ' 月</b>' +
            '<span class="count">' + items.length + ' 篇</span>' +
          '</div>' +
          '<div class="archive-list">' +
            items.map(p =>
              '<a class="archive-item" href="' + esc(postUrl(p.slug)) + '">' +
                '<time>' + esc(String(p.date).slice(8, 10)) + ' 日</time>' +
                '<span class="title">' + esc(p.title) + '</span>' +
                '<span class="cat">' + esc(catOf(p)) + '</span>' +
              '</a>'
            ).join('') +
          '</div>' +
        '</section>';
    }).join('');
  }

  /* ---------- 搜索 ---------- */
  function runSearch(query) {
    if (searchIndex && window.SearchCore) {
      return window.SearchCore.search(searchIndex, query);
    }
    /* 索引没拿到时退化成只搜列表里已有的字段 */
    const q = query.toLowerCase();
    return posts.filter(p =>
      (p.title + ' ' + (p.summary || '') + ' ' + (p.tags || []).join(' ') + ' ' + catOf(p))
        .toLowerCase().indexOf(q) !== -1
    );
  }

  /* ---------- 副标题 ---------- */
  function subtitle() {
    const total = posts.length;
    if (state.q) return '搜索「' + state.q + '」· 找到 ' + runSearch(state.q).length + ' 篇';
    if (state.view === 'category') {
      return state.category ? '分类「' + state.category + '」' : '共 ' + total + ' 篇文章，按分类浏览';
    }
    if (state.view === 'tag') {
      return state.tag ? '标签「' + state.tag + '」' : '共 ' + total + ' 篇文章，按标签浏览';
    }
    if (state.view === 'archive') return '共 ' + total + ' 篇文章，按年月排列';
    return '共 ' + total + ' 篇文章，按时间倒序';
  }

  /* ---------- 渲染 ---------- */
  function render() {
    renderTabs();
    renderFilter();

    if (!posts.length) {
      listEl.innerHTML = listState('inbox', '还没有文章，去 posts/ 里写一篇吧');
      if (subEl) subEl.textContent = '还没有文章';
      return;
    }

    /* 搜索模式 */
    if (state.q) {
      const list = runSearch(state.q);
      listEl.innerHTML = list.length
        ? list.map(p => cardHtml(p, state.q)).join('')
        : listState('search_off', '没有找到和「' + esc(state.q) + '」有关的文章');
      if (subEl) subEl.textContent = subtitle();
      return;
    }

    let html;
    if (state.view === 'archive') {
      html = archiveHtml();
    } else if (state.view === 'category') {
      const list = state.category ? posts.filter(p => catOf(p) === state.category) : posts;
      html = list.map(p => cardHtml(p)).join('');
    } else if (state.view === 'tag') {
      const list = state.tag ? posts.filter(p => (p.tags || []).indexOf(state.tag) !== -1) : posts;
      html = list.map(p => cardHtml(p)).join('');
    } else {
      html = posts.map(p => cardHtml(p)).join('');
    }

    if (!html) {
      html = listState('search_off', '这里还没有文章');
    }

    listEl.innerHTML = html;
    if (subEl) subEl.textContent = subtitle();
  }

  /* ---------- 事件 ---------- */
  function bind() {
    if (tabsEl) {
      tabsEl.addEventListener('click', e => {
        const a = e.target.closest ? e.target.closest('.view-tab') : null;
        if (!a) return;
        e.preventDefault();
        selectView(a.dataset.view);
      });
    }

    if (filterEl) {
      filterEl.addEventListener('click', e => {
        const a = e.target.closest ? e.target.closest('.filter-chip') : null;
        if (!a) return;
        e.preventDefault();

        /* 搜索模式下的那个胶囊是“清除搜索” */
        if (state.q) {
          selectView('all');
          return;
        }

        /* 从 href 里取回筛选值，避免把中文塞进 data 属性 */
        const value = new URLSearchParams(a.getAttribute('href').split('?')[1]).get(
          state.view === 'category' ? 'category' : 'tag'
        );

        if (state.view === 'category') selectCategory(value);
        else selectTag(value);
      });
    }

    window.addEventListener('popstate', () => {
      readUrl();
      render();
      if (state.q && !searchIndex) loadSearchIndex();
    });
  }

  /* ---------- 按需加载搜索索引 ---------- */
  async function loadSearchIndex() {
    try {
      const res = await fetch(SITE_ROOT + 'data/search-index.json');
      if (res.ok) {
        const data = await res.json();
        searchIndex = Array.isArray(data) ? data : null;
      }
    } catch (e) {
      searchIndex = null;   // 退化到字段搜索
    }
    return searchIndex;
  }

  /* ---------- 启动 ---------- */
  async function init() {
    try {
      const res = await fetch(SITE_ROOT + 'data/posts.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      posts = await res.json();
    } catch (e) {
      console.error('[posts] 文章列表加载失败', e);
      listEl.innerHTML = listState('error', '加载失败，请确认 data/posts.json 存在');
      if (subEl) subEl.textContent = '加载失败';
      return;
    }

    if (!Array.isArray(posts)) posts = [];

    readUrl();

    if (state.q) await loadSearchIndex();

    render();
    bind();
  }

  init();
})();
