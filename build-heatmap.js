/* ===================================================
   扫描 posts/*.md，统计每天的发布数
   生成 data/heatmap.json
   =================================================== */

const fs = require('fs');
const path = require('path');

const POSTS_DIR   = './posts';
const OUTPUT_FILE = './data/heatmap.json';

// 读取 posts 下所有 .md 文件
function scanPosts() {
  if (!fs.existsSync(POSTS_DIR)) {
    console.warn('⚠️  posts/ 目录不存在，跳过');
    return {};
  }

  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  const dateCount = {};

  files.forEach(file => {
    const content = fs.readFileSync(path.join(POSTS_DIR, file), 'utf-8');

    // 从 YAML front matter 里抓 date 字段
    const match = content.match(/^---[\s\S]*?date:\s*(\d{4}-\d{2}-\d{2})[\s\S]*?---/m);
    if (!match) {
      console.warn(`  ⚠️  ${file} 没有 date 字段，跳过`);
      return;
    }

    const date = match[1];
    dateCount[date] = (dateCount[date] || 0) + 1;
    console.log(`  📄 ${file}  →  ${date}`);
  });

  return dateCount;
}

// 转成 level（0~4）
function toLevels(dateCount) {
  const values = Object.values(dateCount);
  const max = values.length ? Math.max(...values) : 1;

  const result = {};
  Object.keys(dateCount).forEach(date => {
    const count = dateCount[date];
    // 1 篇 → lv1，最多 4 篇 → lv4
    const level = Math.min(Math.ceil((count / max) * 4), 4);
    result[date] = { count, level };
  });

  return result;
}

// 主流程
function build() {
  console.log('🔍 扫描 posts/ 目录…');
  const dateCount = scanPosts();

  console.log(`\n📊 共 ${Object.keys(dateCount).length} 天有更新`);

  const output = toLevels(dateCount);

  // 确保 data 目录存在
  const dataDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`✅ 已生成 ${OUTPUT_FILE}`);
}

build();