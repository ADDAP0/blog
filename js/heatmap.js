/* ========== 热力图（按周聚合，一列一个月） ========== */
async function loadHeatmap() {
  const heatmap = document.getElementById('heatmap');
  if (!heatmap) return;

  // 拿原始数据（按天）
  let dailyData = {};
  try {
    const res = await fetch('data/heatmap.json');
    if (res.ok) dailyData = await res.json();
  } catch (e) {
    console.warn('[heatmap] 数据加载失败', e);
  }

  // ===== 按周聚合 =====
  // 每篇 → 找它所在周的周一 → 周 key
  const weekMap = {};
  Object.keys(dailyData).forEach(dateStr => {
    const d = new Date(dateStr + 'T00:00:00');
    const monday = getMonday(d);
    const key = formatDate(monday);
    if (!weekMap[key]) weekMap[key] = 0;
    weekMap[key] += dailyData[dateStr].count;
  });

  // ===== 时间范围：当年 1 月 ~ 当月 =====
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = today.getFullYear();

  // 生成 12 个月 × 5 周的位置表
  // grid[row][col] = 该格对应的"周起始日期"（周一的 Date）
  const grid = [];
  const maxCountByWeek = Math.max(1, ...Object.values(weekMap));

  const ROWS = 5;
  const COLS = 12;

  // 初始化空网格
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = null;
    }
  }

  // 每个月填充
for (let m = 0; m < 12; m++) {
  const monthStart = new Date(year, m, 1);
  const monthEnd   = new Date(year, m + 1, 0);

  // 用"月初所在的周一"作为起点（可能在上个月）
  const firstMonday = getMonday(monthStart);

  // 从这个周一开始，每 7 天一个，直到月末
  const mondays = [];
  let cur = new Date(firstMonday);

  while (cur <= monthEnd) {
    mondays.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }

  // 最多 5 周
  mondays.slice(0, ROWS).forEach((d, i) => {
    grid[i][m] = d;
  });
}

  // ===== 渲染 =====
  heatmap.innerHTML = '';

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cellDate = grid[r][c];
      const cell = document.createElement('div');
      cell.className = 'heat-cell';

      if (!cellDate) {
        cell.classList.add('empty');
        heatmap.appendChild(cell);
        continue;
      }

      const key = formatDate(cellDate);
      const count = weekMap[key] || 0;

      if (count > 0) {
        const level = Math.min(Math.ceil((count / maxCountByWeek) * 4), 4);
        cell.classList.add('lv' + level);
      }

      // tooltip
      const weekEnd = new Date(cellDate);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
      cell.title = count
        ? `${fmt(cellDate)} ~ ${fmt(weekEnd)}：${count} 篇`
        : `${fmt(cellDate)} ~ ${fmt(weekEnd)}：无`;

      heatmap.appendChild(cell);
    }
  }
}

/* ===== 工具函数 ===== */
function getMonday(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

loadHeatmap();