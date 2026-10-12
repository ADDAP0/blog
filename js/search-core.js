/* ===================================================
   搜索核心（纯函数，不碰 DOM，可单独测试）
   索引数据来自 data/search-index.json
   =================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SearchCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const norm = function (s) { return String(s == null ? '' : s).toLowerCase(); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 命中权重：标题 > 标签 > 分类 > 正文 */
  const W_TITLE = 10;
  const W_TAG   = 6;
  const W_CAT   = 4;
  const W_TEXT  = 2;

  /* 空格分词，要求每个词都命中（AND）
     返回按相关度排序的文章数组 */
  function search(index, query) {
    const q = norm(query).trim();
    if (!q || !Array.isArray(index)) return [];

    const terms = q.split(/\s+/).filter(Boolean);
    const hits = [];

    index.forEach(function (item) {
      const title = norm(item.title);
      const tags  = norm((item.tags || []).join(' '));
      const cat   = norm(item.category);
      const text  = norm(item.text);

      let score = 0;

      for (let i = 0; i < terms.length; i++) {
        const t = terms[i];
        let s = 0;
        if (title.indexOf(t) !== -1) s += W_TITLE;
        if (tags.indexOf(t) !== -1)  s += W_TAG;
        if (cat.indexOf(t) !== -1)   s += W_CAT;
        if (text.indexOf(t) !== -1)  s += W_TEXT;
        if (s === 0) { score = -1; break; }   // 有一个词没命中就整条丢掉
        score += s;
      }

      if (score >= 0) hits.push({ item: item, score: score });
    });

    hits.sort(function (a, b) {
      return b.score - a.score ||
             String(b.item.date).localeCompare(String(a.item.date));
    });

    return hits.map(function (h) { return h.item; });
  }

  /* 在已转义的文本里把命中词包成 <mark>。
     先按原文定位、再分段转义，避免在 &amp; 这种实体中间插标签。 */
  function highlight(raw, query) {
    const text = String(raw == null ? '' : raw);
    const terms = String(query == null ? '' : query).toLowerCase()
      .split(/\s+/).filter(Boolean);
    if (!terms.length) return esc(text);

    const lower = text.toLowerCase();
    const ranges = [];

    terms.forEach(function (t) {
      let from = 0;
      for (;;) {
        const at = lower.indexOf(t, from);
        if (at === -1) break;
        ranges.push([at, at + t.length]);
        from = at + t.length;
      }
    });

    if (!ranges.length) return esc(text);

    ranges.sort(function (a, b) { return a[0] - b[0]; });
    const merged = [ranges[0].slice()];
    for (let i = 1; i < ranges.length; i++) {
      const last = merged[merged.length - 1];
      if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1]);
      else merged.push(ranges[i].slice());
    }

    let out = '';
    let pos = 0;
    merged.forEach(function (r) {
      out += esc(text.slice(pos, r[0])) + '<mark>' + esc(text.slice(r[0], r[1])) + '</mark>';
      pos = r[1];
    });
    return out + esc(text.slice(pos));
  }

  /* 从正文里截一段包含关键词的上下文，给结果条目当副标题 */
  function snippet(text, query, len) {
    const t = String(text == null ? '' : text);
    if (!t) return '';
    len = len || 56;

    const first = String(query == null ? '' : query).toLowerCase()
      .split(/\s+/).filter(Boolean)[0] || '';
    const at = first ? t.toLowerCase().indexOf(first) : -1;

    if (at === -1) return t.slice(0, len) + (t.length > len ? '…' : '');

    const start = Math.max(0, at - 12);
    return (start > 0 ? '…' : '') +
           t.slice(start, start + len) +
           (start + len < t.length ? '…' : '');
  }

  return { search: search, highlight: highlight, snippet: snippet };
}));
