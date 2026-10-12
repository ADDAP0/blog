/* ===================================================
   相册
   数据来自 data/gallery.json，点击缩略图打开大图。
   支持 ← → 切换、Esc 关闭、点背景关闭。
   =================================================== */
(function () {
  'use strict';

  const grid    = document.getElementById('galleryGrid');
  const subEl   = document.getElementById('galSub');
  const lb      = document.getElementById('lightbox');
  const lbImg   = document.getElementById('lbImg');
  const lbTitle = document.getElementById('lbTitle');
  const lbDesc  = document.getElementById('lbDesc');
  const lbCount = document.getElementById('lbCount');
  const btnPrev = document.getElementById('lbPrev');
  const btnNext = document.getElementById('lbNext');
  const btnClose= document.getElementById('lbClose');

  if (!grid) return;

  let items = [];
  let cur = -1;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* 数据里写的是相对站点根的路径（images/xxx.jpg），
     页面收进 pages/ 之后要补上 SITE_ROOT 前缀；外链原样放行 */
  function assetUrl(u) {
    if (!u) return '';
    return /^(https?:)?\/\//i.test(u) || u.indexOf('data:') === 0 ? u : SITE_ROOT + u;
  }

  /* ---------- 网格 ---------- */
  function renderGrid() {
    if (!items.length) {
      grid.innerHTML = '<div class="page-state">' +
        '<span class="material-symbols-rounded">photo_library</span>' +
        '相册还是空的</div>';
      if (subEl) subEl.textContent = '还没有照片';
      return;
    }

    grid.innerHTML = items.map(function (it, i) {
      return '<button class="gal-item" type="button" data-i="' + i + '" ' +
             'aria-label="查看《' + esc(it.title || '照片') + '》">' +
               '<img src="' + esc(assetUrl(it.src)) + '" alt="' + esc(it.title || '') + '" loading="lazy">' +
               '<span class="gal-cap">' +
                 '<b>' + esc(it.title || '') + '</b>' +
                 '<span>' + esc(it.date || '') + '</span>' +
               '</span>' +
             '</button>';
    }).join('');

    if (subEl) subEl.textContent = '共 ' + items.length + ' 张照片';
  }

  /* ---------- 大图 ---------- */
  /* 让地址栏跟着当前这张走，方便直接分享某一张 */
  function syncUrl(index) {
    const p = new URLSearchParams(location.search);
    if (index === null) p.delete('i');
    else p.set('i', String(index + 1));
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  function show(i) {
    if (!items.length) return;
    cur = (i + items.length) % items.length;

    const it = items[cur];
    lbImg.src = assetUrl(it.src);
    lbImg.alt = it.title || '';
    lbTitle.textContent = it.title || '';
    lbDesc.textContent = it.desc || '';
    lbCount.textContent = (cur + 1) + ' / ' + items.length;

    syncUrl(cur);
  }

  function open(i) {
    show(i);
    lb.hidden = false;
    document.body.style.overflow = 'hidden';   // 锁住背后的页面滚动
    btnClose.focus();
  }

  function close() {
    lb.hidden = true;
    document.body.style.overflow = '';
    syncUrl(null);
    const btn = grid.querySelector('.gal-item[data-i="' + cur + '"]');
    if (btn) btn.focus();
  }

  /* ---------- 事件 ---------- */
  grid.addEventListener('click', function (e) {
    const btn = e.target.closest ? e.target.closest('.gal-item') : null;
    if (!btn) return;
    open(Number(btn.dataset.i));
  });

  if (btnPrev)  btnPrev.addEventListener('click', function () { show(cur - 1); });
  if (btnNext)  btnNext.addEventListener('click', function () { show(cur + 1); });
  if (btnClose) btnClose.addEventListener('click', close);

  /* 点图片以外的区域关闭（不含按钮本身） */
  if (lb) {
    lb.addEventListener('click', function (e) {
      if (e.target === lb) close();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') { close(); }
    else if (e.key === 'ArrowLeft')  { show(cur - 1); }
    else if (e.key === 'ArrowRight') { show(cur + 1); }
  });

  /* 手机上的左右滑动 */
  let touchX = null;
  if (lb) {
    lb.addEventListener('touchstart', function (e) {
      touchX = e.changedTouches[0].clientX;
    }, { passive: true });

    lb.addEventListener('touchend', function (e) {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
      touchX = null;
    }, { passive: true });
  }

  /* ---------- 启动 ---------- */
  async function init() {
    try {
      const res = await fetch(SITE_ROOT + 'data/gallery.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      items = await res.json();
    } catch (e) {
      console.error('[gallery] 加载失败', e);
      grid.innerHTML = '<div class="page-state">' +
        '<span class="material-symbols-rounded">error</span>' +
        '加载失败，请确认 data/gallery.json 存在</div>';
      if (subEl) subEl.textContent = '加载失败';
      return;
    }

    if (!Array.isArray(items)) items = [];
    renderGrid();

    /* URL 带了 ?i=N 就直接放大第 N 张（首页大图卡点进来会带上） */
    const want = parseInt(new URLSearchParams(location.search).get('i'), 10);
    if (want >= 1 && want <= items.length) open(want - 1);
  }

  init();
})();
