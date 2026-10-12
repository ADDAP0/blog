/* ========== 热力图（按周聚合，一列一个月） ========== */
async function loadHeatmap() {
  const heatmap = document.getElementById('heatmap');
  if (!heatmap) return;

  // 拿原始数据（按天）
  let dailyData = {};
  try {
    const res = await fetch(SITE_ROOT + 'data/heatmap.json');
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

  // ===== 时间范围：当年 1 月 ~ 12 月 =====
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = today.getFullYear();

  // 生成 12 个月 × 5 周的位置表
  // grid[row][col] = 该格对应的"周起始日期"（周一的 Date）
  const grid = [];

  const ROWS = 5;
  const COLS = 12;

  // 初始化空网格
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = null;
    }
  }

  // 每周归属到一个月份列（单次按时间顺序遍历，天然不会重复）
  // 归属规则：一周（周一~周日）算进"周四"所在的那个月 —— 周四落在哪个月，
  // 这一周就有 4 天属于该月，是多数派；所以同一周只可能出现一次。
  // 例外是跨年那一周（周四落在上一年 12 月 / 下一年 1 月）：把它归到本年的
  // 1 月 / 12 月，否则年初、年末那几天写的文章会整个消失。
  // 一个月最多有 5 个周四，跨年首/末周各再补 1 个也仍是 5，所以 5 行刚好够。
  const yearEnd = new Date(year, 11, 31);
  const weeksOfMonth = Array.from({ length: COLS }, () => []);

  for (let cur = getMonday(new Date(year, 0, 1)); cur <= yearEnd; cur.setDate(cur.getDate() + 7)) {
    const thursday = new Date(cur);
    thursday.setDate(thursday.getDate() + 3);

    let col;
    if (thursday.getFullYear() < year)      col = 0;              // 跨年首周 → 归 1 月
    else if (thursday.getFullYear() > year) col = COLS - 1;       // 跨年末周 → 归 12 月
    else                                    col = thursday.getMonth();

    weeksOfMonth[col].push(new Date(cur));
  }

  weeksOfMonth.forEach((mondays, m) => {
    mondays.slice(0, ROWS).forEach((d, i) => {
      grid[i][m] = d;
    });
  });

  // 色阶只按"真正显示出来的周"算，避免范围外的数据把整年压暗
  const maxCountByWeek = Math.max(
    1,
    ...grid.flat().filter(Boolean).map(d => weekMap[formatDate(d)] || 0)
  );

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