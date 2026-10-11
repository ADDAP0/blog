/* ========== 首页最新文章卡 ========== */
async function loadLatestPost() {
  const titleEl = document.getElementById('latestTitle');
  const dateEl  = document.getElementById('latestDate');
  if (!titleEl || !dateEl) return;

  try {
    const res = await fetch('data/posts.json');
    if (!res.ok) throw new Error('posts.json 加载失败');
    const posts = await res.json();

    if (!posts.length) {
      titleEl.textContent = '还没有文章';
      dateEl.textContent = '';
      return;
    }

    // 最新一篇（已按日期倒序）
    const latest = posts[0];

    titleEl.textContent = latest.title;
    dateEl.textContent  = latest.date.replace(/-/g, '.') + ' · ' + (latest.tags[0] || '随笔');

    // 点击卡片 → 跳到文章（等你有详情页再启用）
    // titleEl.parentElement.parentElement.addEventListener('click', () => {
    //   location.href = `post.html?slug=${latest.slug}`;
    // });

  } catch (e) {
    console.error('[latest-post]', e);
    titleEl.textContent = '加载失败';
  }
}

loadLatestPost();