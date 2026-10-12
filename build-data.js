/* ===================================================
   扫描 posts/*.md
   生成 data/heatmap.json        （热力图数据）
   生成 data/posts.json          （文章列表：首页 / 列表页用，不含正文）
   生成 data/content/<slug>.json （每篇的元信息 + 正文，详情页按需加载）
   更新 data/stats.json          （文章统计）
   =================================================== */

const fs = require('fs');
const path = require('path');

const POSTS_DIR     = './posts';
const HEATMAP_FILE  = './data/heatmap.json';
const POSTS_FILE    = './data/posts.json';
const STATS_FILE    = './data/stats.json';
const CONTENT_DIR   = './data/content';

// 没写 category 的文章归到这里
const DEFAULT_CATEGORY = '未分类';

/* ---------- 扫描所有文章 ---------- */
function scanPosts() {
  console.log(`\n📁 检查目录：${path.resolve(POSTS_DIR)}`);

  if (!fs.existsSync(POSTS_DIR)) {
    console.warn(`⚠️  目录不存在！`);
    return [];
  }

  const allFiles = fs.readdirSync(POSTS_DIR);
  const mdFiles = allFiles.filter(f => f.endsWith('.md'));

  console.log(`📂 共 ${mdFiles.length} 篇 .md 文件\n`);

  const posts = [];

  mdFiles.forEach(file => {
    const content = fs.readFileSync(path.join(POSTS_DIR, file), 'utf-8');

    // 抓 front matter
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!fmMatch) {
      console.warn(`  ⚠️  ${file} 没有 front matter，跳过`);
      return;
    }

    const fm = fmMatch[1];
    const body = fmMatch[2].trim();

    // 抓字段
    const title = (fm.match(/title:\s*(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '');
    const date  = (fm.match(/date:\s*(\d{4}-\d{2}-\d{2})/) || [])[1];
    const tags  = (fm.match(/tags:\s*\[(.+?)\]/) || [])[1]?.split(',').map(t => t.trim()).filter(Boolean) || [];
    const summary = (fm.match(/summary:\s*(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '');
    const category = (fm.match(/category:\s*(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '') || DEFAULT_CATEGORY;
    const draft = /draft:\s*true/.test(fm);

    if (!title || !date) {
      console.warn(`  ⚠️  ${file} 缺少 title 或 date，跳过`);
      return;
    }

    if (draft) {
      console.log(`  📝 ${file} 是草稿，跳过`);
      return;
    }

    // 摘要：没写就用正文前 100 字
    const autoSummary = summary || body
      .replace(/^#+\s.*/gm, '')       // 去标题
      .replace(/!\[.*?\]\(.*?\)/g, '') // 去图片
      .replace(/\[(.+?)\]\(.*?\)/g, '$1') // 链接保留文字
      .replace(/[`*_>#-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100) + '…';

    posts.push({
      file,
      title,
      date,
      tags,
      category,
      summary: autoSummary,
      slug: file.replace(/\.md$/, ''),
      body,   // 只用于生成 data/content/，不会写进 posts.json
    });

    console.log(`  ✅ ${file}  →  ${date} | [${category}] ${title}`);
  });

  // 按日期倒序（最新在前）
  posts.sort((a, b) => b.date.localeCompare(a.date));

  return posts;
}

/* ---------- 生成 heatmap.json ---------- */
function buildHeatmap(posts) {
  const dateCount = {};

  posts.forEach(p => {
    dateCount[p.date] = (dateCount[p.date] || 0) + 1;
  });

  const max = Math.max(1, ...Object.values(dateCount));

  const result = {};
  Object.keys(dateCount).forEach(date => {
    const count = dateCount[date];
    const level = Math.min(Math.ceil((count / max) * 4), 4);
    result[date] = { count, level };
  });

  ensureDir(HEATMAP_FILE);
  fs.writeFileSync(HEATMAP_FILE, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n✅ 已生成 ${HEATMAP_FILE}`);
}

/* ---------- 生成 posts.json（列表，不含正文） ---------- */
function buildPosts(posts) {
  // 正文单独放，列表页不需要下载
  const list = posts.map(({ body, ...meta }) => meta);

  ensureDir(POSTS_FILE);
  fs.writeFileSync(POSTS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  console.log(`✅ 已生成 ${POSTS_FILE}（共 ${list.length} 篇）`);
}

/* ---------- 生成 data/content/<slug>.json（详情页数据） ---------- */
function buildContent(posts) {
  if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });

  const keep = new Set();

  posts.forEach(p => {
    const file = `${p.slug}.json`;
    keep.add(file);

    fs.writeFileSync(
      path.join(CONTENT_DIR, file),
      JSON.stringify({
        slug:     p.slug,
        title:    p.title,
        date:     p.date,
        tags:     p.tags,
        category: p.category,
        summary:  p.summary,
        body:     p.body,
      }, null, 2),
      'utf-8'
    );
  });

  // 清掉已删除/改成草稿的文章留下的残骸，免得出现“幽灵文章”
  fs.readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.json') && !keep.has(f))
    .forEach(f => {
      fs.unlinkSync(path.join(CONTENT_DIR, f));
      console.log(`  🗑️  已清理失效的 ${f}`);
    });

  console.log(`✅ 已生成 ${CONTENT_DIR}/（共 ${posts.length} 篇正文）`);
}

/* ---------- 更新文章统计 ---------- */
function buildStats(posts) {
  const stats = fs.existsSync(STATS_FILE)
    ? JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'))
    : { articles: 0, essays: 0, photos: 0 };

  stats.articles = posts.length;
  ensureDir(STATS_FILE);
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8');
  console.log(`✅ 已更新 ${STATS_FILE}（文章 ${posts.length} 篇）`);
}

/* ---------- 工具 ---------- */
function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* ---------- 主流程 ---------- */
function build() {
  const posts = scanPosts();
  buildHeatmap(posts);
  buildPosts(posts);
  buildContent(posts);
  buildStats(posts);
  console.log('');
}

build();
