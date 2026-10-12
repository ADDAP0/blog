/* ===================================================
   文章详情页
   URL: post.html?slug=<文件名去掉 .md>
   正文用 js/markdown.js 渲染；上下篇从 posts.json 里定位。
   =================================================== */
(function () {
  'use strict';

  const bodyEl = document.getElementById('postBody');
  const navEl  = document.getElementById('postNav');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const slugOf = () => new URLSearchParams(location.search).get('slug');

  function fail(html) {
    if (bodyEl) {
      bodyEl.innerHTML = '<div class="post-state">' +
        '<span class="material-symbols-rounded">error</span>' + html +
        '<br><br><a href="' + SITE_ROOT + 'pages/posts.html?view=all">← 返回文章列表</a></div>';
    }
  }

  /* ---------- 正文 ---------- */
  function renderPost(p) {
    const cat = p.category || '未分类';

    const tags = (p.tags || []).map(t =>
      '<a class="meta-tag" href="' + SITE_ROOT + 'pages/posts.html?view=tag&tag=' + encodeURIComponent(t) + '">' +
        '<span class="material-symbols-rounded">sell</span>' + esc(t) +
      '</a>'
    ).join('');

    bodyEl.innerHTML = '' +
      '<article class="post-article">' +
        '<header class="post-header">' +
          '<h1 class="post-h1">' + esc(p.title) + '</h1>' +
          '<div class="post-meta">' +
            '<time datetime="' + esc(p.date) + '">' + esc(p.date) + '</time>' +
            '<span class="sep">·</span>' +
            '<a class="meta-cat" href="' + SITE_ROOT + 'pages/posts.html?view=category&category=' +
              encodeURIComponent(cat) + '">' +
              '<span class="material-symbols-rounded">category</span>' + esc(cat) +
            '</a>' +
            tags +
          '</div>' +
        '</header>' +
        '<div class="post-content">' +
          (window.Markdown ? window.Markdown.render(p.body || '') : esc(p.body || '')) +
        '</div>' +
      '</article>';
  }

  /* ---------- 上一篇 / 下一篇 ---------- */
  async function renderNav(slug) {
    if (!navEl) return;

    let list = [];
    try {
      const res = await fetch(SITE_ROOT + 'data/posts.json');
      if (res.ok) list = await res.json();
    } catch (e) {
      return;   // 导航拿不到就算了，不影响正文
    }
    if (!Array.isArray(list)) return;

    const i = list.findIndex(x => x.slug === slug);
    if (i === -1) return;

    // posts.json 按日期倒序：索引更小 = 更新，更大 = 更早
    const newer = list[i - 1];
    const older = list[i + 1];

    const items = [];

    if (older) {
      items.push('' +
        '<a class="prev" href="' + SITE_ROOT + 'pages/post.html?slug=' + encodeURIComponent(older.slug) + '">' +
          '<span class="nav-label"><span class="material-symbols-rounded">arrow_back</span>上一篇</span>' +
          '<span class="nav-title">' + esc(older.title) + '</span>' +
        '</a>');
    }

    if (newer) {
      items.push('' +
        '<a class="next" href="' + SITE_ROOT + 'pages/post.html?slug=' + encodeURIComponent(newer.slug) + '">' +
          '<span class="nav-label">下一篇<span class="material-symbols-rounded">arrow_forward</span></span>' +
          '<span class="nav-title">' + esc(newer.title) + '</span>' +
        '</a>');
    }

    navEl.innerHTML = items.join('');
  }

  /* ---------- 启动 ---------- */
  async function init() {
    const slug = slugOf();
    if (!slug) {
      fail('没有指定文章');
      return;
    }

    let post;
    try {
      const res = await fetch(SITE_ROOT + 'data/content/' + encodeURIComponent(slug) + '.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      post = await res.json();
    } catch (e) {
      console.error('[post] 正文加载失败', e);
      fail('找不到这篇文章，它可能已被删除或改名');
      return;
    }

    document.title = post.title + ' · 米饭多加水の小窝';
    renderPost(post);
    renderNav(slug);
  }

  init();
})();
