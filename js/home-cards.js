/* ===================================================
   首页中部两张卡：
   - 左卡：轮播最新文章（data/posts.json）
   - 右卡：轮播相册图片（data/gallery.json）
   两张卡由同一个定时器驱动，节奏保持一致。
   =================================================== */
(function () {
  'use strict';

  const INTERVAL   = 6000;   // 切换间隔
  const MAX_POSTS  = 6;      // 文章最多轮播几篇
  const MAX_PHOTOS = 8;      // 图片最多轮播几张

  const postCard  = document.getElementById('postCard');
  const titleEl   = document.getElementById('latestTitle');
  const dateEl    = document.getElementById('latestDate');
  const postDots  = document.getElementById('postDots');

  const featCard  = document.getElementById('featureCard');
  const imgA      = document.getElementById('featureImgA');
  const imgB      = document.getElementById('featureImgB');
  const featTitle = document.getElementById('featureTitle');
  const featSub   = document.getElementById('featureSub');
  const featDots  = document.getElementById('featureDots');

  if (!postCard && !featCard) return;

  const reduceMotion = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  let posts  = [];
  let photos = [];
  let pi = 0;            // 文章下标
  let fi = 0;            // 图片下标
  let frontLayer = 0;    // 当前显示的是 A 层还是 B 层
  let timer = null;
  let paused = false;

  /* 重播一次淡入动画：先摘掉类并强制重排，否则动画不会重新触发 */
  function replay() {
    Array.prototype.forEach.call(arguments, function (el) {
      if (!el) return;
      el.classList.remove('swap');
      void el.offsetWidth;
      el.classList.add('swap');
    });
  }

  /* 相册里的 src 是相对站点根的路径，补上前缀；外链原样放行 */
  function assetUrl(u) {
    if (!u) return '';
    return /^(https?:)?\/\//i.test(u) || u.indexOf('data:') === 0 ? u : SITE_ROOT + u;
  }

  /* ---------- 左卡：文章 ---------- */
  function showPost(i, animate) {
    if (!posts.length) return;

    pi = ((i % posts.length) + posts.length) % posts.length;
    const p = posts[pi];

    if (titleEl) titleEl.textContent = p.title || '';
    if (dateEl) {
      dateEl.textContent = String(p.date || '').replace(/-/g, '.') +
        ' · ' + (p.category || '未分类');
    }
    if (animate) replay(titleEl, dateEl);

    if (postDots) {
      Array.prototype.forEach.call(postDots.children, function (d, n) {
        d.classList.toggle('active', n === pi);
      });
    }

    if (postCard) {
      postCard.dataset.slug = p.slug;
      postCard.setAttribute('aria-label', '打开文章：' + (p.title || ''));
    }
  }

  /* ---------- 右卡：图片（两层交叉淡入） ---------- */
  function showPhoto(i, animate) {
    if (!photos.length) return;

    fi = ((i % photos.length) + photos.length) % photos.length;
    const it = photos[fi];

    if (photos.length < 2) {
      /* 只有一张就别玩交叉淡入了 */
      if (imgA) {
        imgA.src = assetUrl(it.src);
        imgA.alt = it.title || '';
        imgA.classList.add('show');
      }
    } else {
      const layers = [imgA, imgB];
      const next = layers[1 - frontLayer];
      const prev = layers[frontLayer];

      if (next) {
        next.src = assetUrl(it.src);
        next.alt = it.title || '';
        next.classList.add('show');
      }
      if (prev) prev.classList.remove('show');
      frontLayer = 1 - frontLayer;
    }

    if (featTitle) featTitle.textContent = it.title || '';
    if (featSub) featSub.textContent = it.desc || '';
    if (animate) replay(featTitle, featSub);

    if (featDots) {
      Array.prototype.forEach.call(featDots.children, function (d, n) {
        d.classList.toggle('active', n === fi);
      });
    }
  }

  /* ---------- 小圆点 ---------- */
  function buildDots(container, count, onPick) {
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < count; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dot' + (i === 0 ? ' active' : '');
      b.setAttribute('aria-label', '第 ' + (i + 1) + ' 项');
      b.addEventListener('click', function (e) {
        e.stopPropagation();   // 别顺带触发卡片的跳转
        e.preventDefault();
        onPick(i);
        restart();             // 手动切过之后重新计时
      });
      container.appendChild(b);
    }
  }

  /* ---------- 定时器 ---------- */
  function tick() {
    if (paused) return;
    if (posts.length > 1) showPost(pi + 1, true);
    if (photos.length > 1) showPhoto(fi + 1, true);
  }

  function restart() {
    clearInterval(timer);
    if (reduceMotion) return;   // 用户不想看动效就不自动轮播
    timer = setInterval(tick, INTERVAL);
  }

  function bindPause(el) {
    if (!el) return;
    el.addEventListener('mouseenter', function () { paused = true; });
    el.addEventListener('mouseleave', function () { paused = false; });
    el.addEventListener('focusin',  function () { paused = true; });
    el.addEventListener('focusout', function () { paused = false; });
  }

  /* ---------- 点整张卡跳转 ---------- */
  function bindOpen(el, getHref) {
    if (!el) return;

    function go() {
      const href = getHref();
      if (href) location.href = href;
    }

    el.addEventListener('click', go);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        go();
      }
    });
  }

  /* ---------- 数据 ---------- */
  async function fetchJSON(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      console.warn('[home-cards] ' + url + ' 加载失败', e);
      return null;
    }
  }

  /* ---------- 启动 ---------- */
  async function init() {
    const [p, g] = await Promise.all([
      fetchJSON(SITE_ROOT + 'data/posts.json'),
      fetchJSON(SITE_ROOT + 'data/gallery.json'),
    ]);

    posts  = (Array.isArray(p) ? p : []).slice(0, MAX_POSTS);
    photos = (Array.isArray(g) ? g : [])
      .filter(function (x) { return x && x.src; })
      .slice(0, MAX_PHOTOS);

    /* 左卡 */
    if (posts.length) {
      buildDots(postDots, posts.length, function (i) { showPost(i, true); });
      showPost(0, false);
    } else {
      if (titleEl) titleEl.textContent = '还没有文章';
      if (dateEl) dateEl.textContent = '';
    }

    /* 右卡 */
    if (photos.length) {
      buildDots(featDots, photos.length, function (i) { showPhoto(i, true); });
      showPhoto(0, false);
    } else {
      if (featTitle) featTitle.textContent = '相册还空着';
      if (featSub) featSub.textContent = '去 data/gallery.json 里加几张图吧';
    }

    bindPause(postCard);
    bindPause(featCard);

    bindOpen(postCard, function () {
      const slug = postCard.dataset.slug;
      return slug ? SITE_ROOT + 'pages/post.html?slug=' + encodeURIComponent(slug) : null;
    });
    bindOpen(featCard, function () {
      /* 带上当前这张的序号，相册页会自动放大它 */
      return SITE_ROOT + 'pages/gallery.html?i=' + (fi + 1);
    });

    /* 切到别的标签页时先别转 */
    document.addEventListener('visibilitychange', function () {
      paused = document.hidden;
    });

    restart();
  }

  init();
})();
