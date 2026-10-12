/* ===================================================
   日间 / 夜间模式
   - 本文件在 <head> 里“同步”引入（不加 defer），
     所以主题属性能在第一帧之前写好，不会闪白 / 闪黑。
   - 只有首页有切换入口（.mode-card）；其它页面只读取已保存的偏好。
   =================================================== */
(function () {
  const STORAGE_KEY = 'blog-theme';
  const root = document.documentElement;

  /* ---------- 读取偏好 ---------- */
  function readSaved() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'dark' || v === 'light' ? v : null;
    } catch (e) {
      return null;   // 隐私模式等场景下 localStorage 可能不可用
    }
  }

  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  /* ---------- 卡片文案 ---------- */
  const CARD_TEXT = {
    light: { icon: 'flare',     title: '日间模式', desc: '奈樱漫游的清晨' },
    dark:  { icon: 'dark_mode', title: '夜间模式', desc: '奈樱漫游的星夜' },
  };

  /* ---------- 应用主题 ---------- */
  function paint(theme, persist) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');   // 浅色就是默认态，不留属性

    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* 忽略 */ }
    }

    const card = document.getElementById('modeCard');
    if (!card) return;

    const t = CARD_TEXT[theme];
    const icon  = document.getElementById('modeIcon');
    const title = document.getElementById('modeTitle');
    const desc  = document.getElementById('modeDesc');

    if (icon)  icon.textContent  = t.icon;
    if (title) title.textContent = t.title;
    if (desc)  desc.textContent  = t.desc;

    card.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    card.setAttribute('title', theme === 'dark' ? '切换到日间模式' : '切换到夜间模式');
  }

  /* ---------- 首帧之前就定下主题（防闪烁）---------- */
  const saved = readSaved();
  paint(saved || (systemPrefersDark() ? 'dark' : 'light'), false);

  /* ---------- 跟随系统（仅当用户没手动选过）---------- */
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => {
      if (!readSaved()) paint(e.matches ? 'dark' : 'light', false);
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);   // 老浏览器
  }

  /* ---------- 切换（带一段柔和的颜色过渡）---------- */
  function toggle() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';

    root.classList.add('is-theming');
    paint(next, true);

    // 过渡结束后摘掉，避免影响后续其它交互（比如 hover）
    clearTimeout(toggle._t);
    toggle._t = setTimeout(() => root.classList.remove('is-theming'), 400);
  }

  /* ---------- 绑定首页那张卡 ---------- */
  function bind() {
    const card = document.getElementById('modeCard');
    if (!card) return;

    paint(currentTheme(), false);   // 把卡片文案同步成当前主题

    card.addEventListener('click', toggle);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();   // 空格默认会滚动页面
        toggle();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
