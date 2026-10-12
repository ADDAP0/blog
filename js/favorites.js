/* ===================================================
   收藏
   数据来自 data/favorites.json，按 category 分组展示。
   =================================================== */
(function () {
  'use strict';

  const listEl = document.getElementById('favList');
  const subEl  = document.getElementById('favSub');

  if (!listEl) return;

  let items = [];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function render() {
    if (!items.length) {
      listEl.innerHTML = '<div class="page-state">' +
        '<span class="material-symbols-rounded">bookmark</span>' +
        '还没有收藏，去 data/favorites.json 里加几条吧</div>';
      if (subEl) subEl.textContent = '空空如也';
      return;
    }

    /* 按 category 分组，保留 JSON 里首次出现的顺序 */
    const order = [];
    const groups = new Map();

    items.forEach(function (it) {
      const c = it.category || '其他';
      if (!groups.has(c)) { groups.set(c, []); order.push(c); }
      groups.get(c).push(it);
    });

    listEl.innerHTML = order.map(function (c) {
      const arr = groups.get(c);

      return '<section class="fav-group">' +
        '<div class="fav-group-head">' +
          '<b>' + esc(c) + '</b>' +
          '<span class="count">' + arr.length + ' 个</span>' +
        '</div>' +
        '<div class="fav-grid">' +
          arr.map(function (it) {
            return '<a class="fav-card" href="' + esc(it.url) + '" target="_blank" rel="noopener">' +
              '<span class="fav-icon">' +
                '<span class="material-symbols-rounded">' + esc(it.icon || 'bookmark') + '</span>' +
              '</span>' +
              '<span class="fav-text">' +
                '<span class="fav-name">' + esc(it.name) + '</span>' +
                '<span class="fav-desc">' + esc(it.desc || '') + '</span>' +
              '</span>' +
            '</a>';
          }).join('') +
        '</div>' +
      '</section>';
    }).join('');

    if (subEl) subEl.textContent = '共 ' + items.length + ' 个，都是平时用得上的';
  }

  async function init() {
    try {
      const res = await fetch(SITE_ROOT + 'data/favorites.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      items = await res.json();
    } catch (e) {
      console.error('[favorites] 加载失败', e);
      listEl.innerHTML = '<div class="page-state">' +
        '<span class="material-symbols-rounded">error</span>' +
        '加载失败，请确认 data/favorites.json 存在</div>';
      if (subEl) subEl.textContent = '加载失败';
      return;
    }

    if (!Array.isArray(items)) items = [];
    render();
  }

  init();
})();
