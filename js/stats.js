/* ========== 数据统计 ========== */
async function loadStats() {
  try {
    const res = await fetch(SITE_ROOT + 'data/stats.json');
    if (!res.ok) throw new Error('stats.json 加载失败');
    const stats = await res.json();

    document.querySelectorAll('.stat b[data-key]').forEach(el => {
      const key = el.dataset.key;
      if (stats[key] !== undefined) {
        el.textContent = stats[key];
      }
    });
  } catch (e) {
    console.warn('[stats] 加载失败，保持默认值', e);
  }
}

loadStats();