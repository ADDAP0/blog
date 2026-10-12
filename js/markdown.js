/* ===================================================
   极简 Markdown 渲染器（零依赖）
   ---------------------------------------------------
   支持：标题 / 粗体 / 斜体 / 行内代码 / 围栏代码块 /
        链接 / 图片 / 无序列表 / 有序列表 / 引用 /
        分隔线 / 段落

   安全：先把整段文本做 HTML 转义，再解析语法，
        所以文章里写的 <script> 只会被当普通文字显示；
        链接和图片再额外过滤 javascript: 之类的协议。

   约定：段落内的单个换行会渲染成 <br>。
        标准 CommonMark 会把软换行折成空格，但对中文写作来说
        “我换行了就给我换行”更符合直觉，也贴合本博客的写法。
   =================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Markdown = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- HTML 转义 ---------- */
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- 协议白名单 ---------- */
  function safeUrl(url, allowData) {
    const u = String(url).trim();
    if (/^(javascript|vbscript):/i.test(u)) return '#';
    if (!allowData && /^data:/i.test(u)) return '#';
    return u;
  }

  /* ---------- 行内元素 ---------- */
  function inline(text) {
    // 生成的 HTML 先存起来用占位符代替，避免后面的强调规则
    // 误伤 URL 里的下划线（比如 http://a.com/foo_bar_baz）
    const stash = [];
    const save = function (html) {
      stash.push(html);
      return '\u0000' + (stash.length - 1) + '\u0000';
    };

    // 1) 行内代码最先抽出：里面的 * _ 不该再被当成强调
    text = text.replace(/`([^`]+)`/g, function (m, code) {
      return save('<code>' + code + '</code>');
    });

    // 2) 图片
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, src) {
      return save('<img src="' + safeUrl(src, true) + '" alt="' + alt + '" loading="lazy">');
    });

    // 3) 链接
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, href) {
      const external = /^https?:\/\//i.test(href);
      const ext = external ? ' target="_blank" rel="noopener noreferrer"' : '';
      return save('<a href="' + safeUrl(href, false) + '"' + ext + '>' + inline(label) + '</a>');
    });

    // 4) 强调
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // 下划线斜体要求两侧不是字母/数字/下划线，否则 some_var_name 会被误伤
    text = text.replace(/(^|[^A-Za-z0-9_])_([^_]+)_(?![A-Za-z0-9_])/g, '$1<em>$2</em>');

    // 5) 还原占位符
    return text.replace(/\u0000(\d+)\u0000/g, function (m, n) {
      return stash[+n];
    });
  }

  /* ---------- 块级元素的起始特征 ----------
     注意：引用用的是 &gt; 而不是 >。
     因为整段文本在解析前已经过 HTML 转义，裸的 > 早就变成 &gt; 了。
     改这里时别顺手“修正”成 >，否则引用会失效。 */
  const BLOCK_START = [
    /^\s*```/,                    // 围栏代码块
    /^\s*&gt;\s?/,                // 引用
    /^\s*[-*+]\s+/,               // 无序列表
    /^\s*\d+\.\s+/,               // 有序列表
    /^\s*#{1,6}\s+/,              // 标题
    /^\s*([-*_])\s*(\1\s*){2,}$/, // 分隔线
  ];

  function isBlockStart(line) {
    return BLOCK_START.some(function (re) { return re.test(line); });
  }

  const isBlank = function (line) { return /^\s*$/.test(line); };

  /* 行首缩进宽度（Tab 按 4 空格算），用于列表嵌套 */
  function indentOf(line) {
    const m = line.match(/^[ \t]*/);
    return m ? m[0].replace(/\t/g, '    ').length : 0;
  }

  /* 把扁平的 {indent, text} 序列组装成嵌套的 <ul>/<ol>：
     用栈按缩进建树，再递归渲染，比按缩进取 substr 稳 */
  function buildList(tag, items) {
    const root = { children: [] };
    const stack = [{ indent: -1, node: root }];

    items.forEach(function (it) {
      while (stack.length > 1 && it.indent <= stack[stack.length - 1].indent) stack.pop();
      const node = { text: it.text, children: [] };
      stack[stack.length - 1].node.children.push(node);
      stack.push({ indent: it.indent, node: node });
    });

    function renderLi(node) {
      return '<li>' + inline(node.text) +
        (node.children.length
          ? '<' + tag + '>' + node.children.map(renderLi).join('') + '</' + tag + '>'
          : '') +
        '</li>';
    }

    return '<' + tag + '>' + root.children.map(renderLi).join('') + '</' + tag + '>';
  }

  /* ---------- 块级解析（输入必须是已转义的文本） ---------- */
  function renderBlocks(text) {
    const lines = text.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (isBlank(line)) { i++; continue; }

      /* --- 围栏代码块 --- */
      let m = line.match(/^\s*```+\s*(\S*)\s*$/);
      if (m) {
        const lang = m[1];
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) {
          buf.push(lines[i]);
          i++;
        }
        i++; // 跳过收尾的 ```
        out.push(
          '<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' +
          buf.join('\n') +
          '</code></pre>'
        );
        continue;
      }

      /* --- 分隔线 --- */
      if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
        out.push('<hr>');
        i++;
        continue;
      }

      /* --- 标题 --- */
      m = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (m) {
        const lv = m[1].length;
        out.push('<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>');
        i++;
        continue;
      }

      /* --- 引用（内部递归渲染；同样注意是 &gt;） --- */
      if (/^\s*&gt;\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*&gt;\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + renderBlocks(buf.join('\n')) + '</blockquote>');
        continue;
      }

      /* --- 无序列表（支持缩进嵌套） --- */
      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push({
            indent: indentOf(lines[i]),
            text: lines[i].replace(/^\s*[-*+]\s+/, ''),
          });
          i++;
        }
        out.push(buildList('ul', items));
        continue;
      }

      /* --- 有序列表（支持缩进嵌套） --- */
      if (/^\s*\d+\.\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          items.push({
            indent: indentOf(lines[i]),
            text: lines[i].replace(/^\s*\d+\.\s+/, ''),
          });
          i++;
        }
        out.push(buildList('ol', items));
        continue;
      }

      /* --- 段落 --- */
      const buf = [];
      while (i < lines.length && !isBlank(lines[i]) && !isBlockStart(lines[i])) {
        buf.push(lines[i]);
        i++;
      }

      // 保险：万一遇上没被上面接住的块级起始，至少保证 i 会前进
      if (buf.length === 0) { i++; continue; }

      out.push('<p>' + buf.map(inline).join('<br>') + '</p>');
    }

    return out.join('\n');
  }

  /* ---------- 对外入口 ---------- */
  function render(src) {
    if (src == null) return '';
    return renderBlocks(escapeHtml(String(src).replace(/\r\n?/g, '\n')));
  }

  return { render: render };
}));
