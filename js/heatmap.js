/* ========== 热力图 ========== */
async function loadHeatmap() {
  const heatmap = document.getElementById('heatmap');
  if (!heatmap) return;

  let data = {};
  try {
    const res = await fetch('data/heatmap.json');
    if (res.ok) data = await res.json();
    else console.warn('heatmap.json 加载失败，用空数据');
  } catch (e) {
    console.warn('[heatmap] 数据加载失败', e);
  }

  // 12 周 × 7 天 = 84 格
  const WEEKS = 12;
  const DAYS  = 7;
  const TOTAL = WEEKS * DAYS;

  // 今天
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 从 84 天前开始
  const start = new Date(today);
  start.setDate(today.getDate() - TOTAL + 1);

  // 调整到"周一"起始
  const dayOfWeek = start.getDay();     // 0=周日
  const offsetToMonday = (dayOfWeek + 6) % 7;   // 周一 → 0
  start.setDate(start.getDate() - offsetToMonday);

  heatmap.innerHTML = '';

  for (let i = 0; i < TOTAL; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);

    const key = d.toISOString().slice(0, 10);
    const item = data[key];

    const cell = document.createElement('div');
    cell.className = 'heat-cell';
    if (item && item.level > 0) cell.classList.add('lv' + item.level);
    cell.title = item
      ? `${key}：${item.count} 篇文章`
      : `${key}：无`;
    heatmap.appendChild(cell);
  }
}

loadHeatmap();