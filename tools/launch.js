/* ===================================================
   写作后台启动器

   干三件事：
     1. 看看服务是不是已经在跑了
     2. 没跑就把服务起起来（同一个进程，不额外开窗口）
     3. 用浏览器的「应用模式」打开 —— 没有地址栏、没有标签页，
        看起来就是一个独立的软件窗口

   一般不用直接跑它，双击「启动后台.vbs」或者桌面快捷方式就行。
   =================================================== */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 4321;
const URL  = 'http://127.0.0.1:' + PORT;

/* 装在哪儿的浏览器都找一遍 */
function browserCandidates() {
  const la = process.env.LOCALAPPDATA || '';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const px = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  return [
    path.join(la, 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(px, 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(la, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(px, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
  ];
}

function findBrowser() {
  for (const p of browserCandidates()) {
    try { if (fs.existsSync(p)) return p; } catch (e) { /* 忽略 */ }
  }
  return null;
}

/* 服务活着吗 */
function isUp(cb) {
  const req = http.get(URL + '/api/status', { timeout: 800 }, res => {
    res.resume();
    cb(res.statusCode > 0);
  });
  req.on('error', () => cb(false));
  req.on('timeout', () => { req.destroy(); cb(false); });
}

/* 以应用模式打开窗口 */
function openWindow() {
  const exe = findBrowser();

  if (!exe) {
    /* 没有 Edge/Chrome，退回默认浏览器（会有地址栏，但能用） */
    spawn('cmd', ['/c', 'start', '', URL], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return;
  }

  /* 独立的用户数据目录：它会被当成一个单独的应用，
     不会跟平时开的浏览器标签混在一起，也不会互相影响 */
  const profile = path.join(__dirname, '.browser-profile');
  try { if (!fs.existsSync(profile)) fs.mkdirSync(profile, { recursive: true }); } catch (e) { /* 忽略 */ }

  const args = [
    '--app=' + URL,
    '--window-size=1400,940',
    '--no-first-run',
    '--no-default-browser-check',
  ];
  try { args.push('--user-data-dir=' + profile); } catch (e) { /* 忽略 */ }

  spawn(exe, args, { detached: true, stdio: 'ignore' }).unref();
}

/* ---------- 主流程 ---------- */
isUp(up => {
  if (up) {
    openWindow();          // 已经在跑，直接开窗口，不重复启动
    process.exit(0);
  }

  /* 没跑：把服务拉起来。server.js 会自己 listen */
  process.env.PORT = String(PORT);
  require('./server.js');

  /* 等服务真的起来了再开窗口，免得开出一个「无法访问」 */
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    isUp(ok => {
      if (ok) {
        clearInterval(timer);
        openWindow();
      } else if (tries > 60) {          // 最多等 15 秒
        clearInterval(timer);
        openWindow();
      }
    });
  }, 250);
});
