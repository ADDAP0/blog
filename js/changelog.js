/* ========== 更新日志渲染 ========== */
async function loadChangelog() {
  const timeline = document.getElementById('timeline');
  if (!timeline) return;

  try {
    const res = await fetch(SITE_ROOT + 'data/changelog.json');
    if (!res.ok) throw new Error('changelog.json 加载失败');
    const data = await res.json();

    if (!data.length) {
      timeline.innerHTML = '<div class="empty">暂时还没有更新记录</div>';
      return;
    }

    timeline.innerHTML = data.map(entry => `
      <div class="tl-item">
        <div class="tl-card">
          <div class="tl-head">
            <span class="tl-date">${entry.date}</span>
            ${entry.version ? `<span class="tl-version">${entry.version}</span>` : ''}
            ${entry.tag ? `<span class="tl-tag ${entry.tag}">${entry.tag}</span>` : ''}
          </div>
          <h2 class="tl-title">${entry.title}</h2>
          <ul class="tl-list">
            ${entry.items.map(item => `<li>${item}</li>`).join('')}
          </ul>
        </div>
      </div>
    `).join('');

  } catch (e) {
    console.error('[changelog]', e);
    timeline.innerHTML = '<div class="empty">加载失败，请检查 data/changelog.json</div>';
  }
}

loadChangelog();