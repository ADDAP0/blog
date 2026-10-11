/* ========== 热力图 ========== */
const heatmap = document.getElementById('heatmap');
if (heatmap) {
  const TOTAL = 60;
  for (let i = 0; i < TOTAL; i++) {
    const cell = document.createElement('div');
    cell.className = 'heat-cell';

    const rand = Math.random();
    let level = 0;
    if (rand > 0.9) level = 4;
    else if (rand > 0.75) level = 3;
    else if (rand > 0.55) level = 2;
    else if (rand > 0.3) level = 1;

    if (level) cell.classList.add('lv' + level);
    heatmap.appendChild(cell);
  }
}