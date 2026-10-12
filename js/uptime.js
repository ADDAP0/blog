/* ========== 运行时长 ========== */
const START_DATE = new Date('2026-10-10T00:00:00');

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');

function updateUptime() {
  const now = new Date();
  let diff = Math.floor((now - START_DATE) / 1000);

  const year  = Math.floor(diff / (365 * 24 * 3600)); diff %= 365 * 24 * 3600;
  const month = Math.floor(diff / (30 * 24 * 3600)); diff %= 30 * 24 * 3600;
  const day   = Math.floor(diff / (24 * 3600)); diff %= 24 * 3600;
  const hour  = Math.floor(diff / 3600); diff %= 3600;
  const min   = Math.floor(diff / 60);
  const sec   = diff % 60;

  $('t-year')  && ($('t-year').textContent  = pad(year));
  $('t-month') && ($('t-month').textContent = pad(month));
  $('t-day')   && ($('t-day').textContent   = pad(day));
  $('t-hour')  && ($('t-hour').textContent  = pad(hour));
  $('t-min')   && ($('t-min').textContent   = pad(min));
  $('t-sec')   && ($('t-sec').textContent   = pad(sec));

  // 首页底部状态条上的运行时长（以前是写死的）
  const runEl = document.getElementById('runTime');
  if (runEl) {
    const ms = now - START_DATE;
    const days  = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    runEl.textContent = '系统已稳定运行：' + days + ' 天 ' + hours + ' 小时';
  }
}

/* ========== 进度条 ========== */
function updateProgress() {
  const now = new Date();

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthPct = ((now - monthStart) / (monthEnd - monthStart)) * 100;

  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
  const yearPct = ((now - yearStart) / (yearEnd - yearStart)) * 100;

  $('p-month')      && ($('p-month').style.width = monthPct.toFixed(2) + '%');
  $('p-year')       && ($('p-year').style.width = yearPct.toFixed(2) + '%');
  $('p-month-text') && ($('p-month-text').textContent = Math.floor(monthPct) + '%');
  $('p-year-text')  && ($('p-year-text').textContent = Math.floor(yearPct) + '%');
}

updateUptime();
updateProgress();
setInterval(updateUptime, 1000);
setInterval(updateProgress, 60000);