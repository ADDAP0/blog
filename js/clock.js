/* ========== 底部时钟 ========== */
function updateClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  el.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

updateClock();
setInterval(updateClock, 1000);