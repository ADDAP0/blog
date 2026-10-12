/* ===================================================
   友情链接
   数据来自 data/friends.json
   =================================================== */
(function () {
  'use strict';

  const grid  = document.getElementById('friendGrid');
  const subEl = document.getElementById('friendSub');

  if (!grid) return;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function state(icon, text) {
    return '<div class="page-state">' +
      '<span class="material-symbols-rounded">' + icon + '</span>' + text + '</div>';
  }

  /* 头像可能是相对站点根的路径，也可能直接是外链 */
  function assetUrl(u) {
    if (!u) return '';
    return /^(https?:)?\/\//i.test(u) || u.indexOf('data:') === 0 ? u : SITE_ROOT + u;
  }

  async function init() {
    let items = [];

    try {
      const res = await fetch(SITE_ROOT + 'data/friends.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      items = await res.json();
    } catch (e) {
      console.error('[friends] 加载失败', e);
      grid.innerHTML = state('error', '加载失败，请确认 data/friends.json 存在');
      if (subEl) subEl.textContent = '加载失败';
      return;
    }

    if (!Array.isArray(items)) items = [];

    if (!items.length) {
      grid.innerHTML = state('group', '还没有友链，欢迎来交换');
      if (subEl) subEl.textContent = '虚位以待';
      return;
    }

    grid.innerHTML = items.map(function (it) {
      return '<a class="friend-card" href="' + esc(it.url) + '" target="_blank" rel="noopener">' +
        '<img class="friend-avatar" src="' +
             esc(it.avatar ? assetUrl(it.avatar) : SITE_ROOT + 'images/avatar.jpg') + '" ' +
             'alt="' + esc(it.name) + '" loading="lazy">' +
        '<span class="friend-text">' +
          '<span class="friend-name">' + esc(it.name) + '</span>' +
          '<span class="friend-desc">' + esc(it.desc || '') + '</span>' +
        '</span>' +
      '</a>';
    }).join('');

    if (subEl) subEl.textContent = '共 ' + items.length + ' 位朋友';
  }

  init();
})();
