/* ===================================================
   写作后台前端
   =================================================== */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  /* ---------- 通用 ---------- */
  async function api(url, opts) {
    const res = await fetch(url, opts);
    let data;
    try { data = await res.json(); }
    catch (e) { throw new Error('服务器没有返回 JSON'); }
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  function msg(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msg' + (kind ? ' ' + kind : '');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const fmtSize = n => n < 1024 ? n + ' B' : (n / 1024).toFixed(0) + ' KB';

  /* ---------- 切换页签 ---------- */
  const LOADERS = { list: loadPosts, album: loadAlbum, images: loadImages, publish: loadStatus };

  function showTab(name) {
    document.querySelectorAll('.side button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.tab').forEach(s => {
      s.classList.toggle('active', s.id === 'tab-' + name);
    });
    const fn = LOADERS[name];
    if (fn) fn();
  }

  document.querySelectorAll('.side button').forEach(b => {
    b.addEventListener('click', () => showTab(b.dataset.tab));
  });

  /* ===================================================
     写文章
     =================================================== */
  let editing = { file: '', slug: '' };

  function updatePreview() {
    const text = $('f-body').value;
    $('preview').innerHTML = window.Markdown ? Markdown.render(text) : esc(text);
    $('bodyCount').textContent = text.length + ' 字';
  }

  function loadPostIntoForm(p) {
    editing = { file: p.file, slug: p.slug };
    $('f-title').value    = p.title || '';
    $('f-date').value     = p.date || todayStr();
    $('f-category').value = p.category || '';
    $('f-tags').value     = (p.tags || []).join(', ');
    $('f-summary').value  = p.summary || '';
    $('f-slug').value     = String(p.slug || '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
    $('f-draft').checked  = !!p.draft;
    $('f-body').value     = p.body || '';
    $('writeTitle').textContent = '编辑文章';
    updatePreview();
    showTab('write');
    msg($('writeMsg'), '已载入《' + p.title + '》，改完记得保存', 'busy');
  }

  function newPost() {
    editing = { file: '', slug: '' };
    ['f-title', 'f-category', 'f-tags', 'f-summary', 'f-slug', 'f-body']
      .forEach(id => { $(id).value = ''; });
    $('f-date').value = todayStr();
    $('f-draft').checked = false;
    $('writeTitle').textContent = '写文章';
    updatePreview();
    msg($('writeMsg'), '');
    $('f-title').focus();
  }

  async function savePost() {
    const title = $('f-title').value.trim();
    if (!title) { msg($('writeMsg'), '标题不能为空', 'err'); $('f-title').focus(); return; }

    $('btnSave').disabled = true;
    msg($('writeMsg'), '保存中…', 'busy');

    try {
      const r = await api('/api/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          date:     $('f-date').value,
          category: $('f-category').value.trim(),
          tags:     $('f-tags').value,
          summary:  $('f-summary').value,
          slug:     $('f-slug').value.trim(),
          draft:    $('f-draft').checked,
          body:     $('f-body').value,
          oldFile:  editing.file,
        }),
      });

      editing = { file: r.file, slug: r.slug };
      $('writeTitle').textContent = '编辑文章';
      msg($('writeMsg'), '已保存 ' + r.file + '，站点数据已刷新', 'ok');
      loadCats();
    } catch (e) {
      msg($('writeMsg'), '保存失败：' + e.message, 'err');
    } finally {
      $('btnSave').disabled = false;
    }
  }

  $('f-body').addEventListener('input', updatePreview);
  $('btnSave').addEventListener('click', savePost);
  $('btnNew').addEventListener('click', newPost);

  /* 标题变化时，如果别名还空着就顺手提示一下 */
  $('f-title').addEventListener('blur', () => {
    if (!$('f-slug').value.trim()) {
      $('f-slug').placeholder = $('f-title').value.trim() || 'about-site';
    }
  });

  /* ===================================================
     图片上传
     =================================================== */
  async function uploadFiles(files) {
    const list = Array.from(files).filter(f => f.type.indexOf('image/') === 0);
    if (!list.length) return [];

    const done = [];
    for (const f of list) {
      try {
        const r = await api('/api/upload?name=' + encodeURIComponent(f.name), {
          method: 'POST',
          body: f,                 // 原始二进制，服务器直接落盘
        });
        done.push(r);
      } catch (e) {
        console.warn('[upload] ' + f.name + ' 失败：' + e.message);
      }
    }
    return done;
  }

  /* 写文章页：上传后插入 Markdown */
  $('btnPickImage').addEventListener('click', () => $('filePick').click());
  $('filePick').addEventListener('change', async e => {
    const files = e.target.files;
    if (!files || !files.length) return;

    msg($('writeMsg'), '上传中…', 'busy');
    const done = await uploadFiles(files);
    e.target.value = '';

    if (!done.length) { msg($('writeMsg'), '上传失败', 'err'); return; }

    const ta = $('f-body');
    const snippet = done.map(r => '![' + r.name.replace(/\.[^.]+$/, '') + '](../' + r.src + ')').join('\n');
    const pos = ta.selectionStart || ta.value.length;
    const before = ta.value.slice(0, pos);
    const after = ta.value.slice(pos);
    ta.value = before + (before && !before.endsWith('\n') ? '\n\n' : '') + snippet + '\n' + after;
    updatePreview();

    msg($('writeMsg'), '已插入 ' + done.length + ' 张图片（路径写成 ../ 是因为文章在 pages/ 下渲染）', 'ok');
  });

  /* ===================================================
     文章列表
     =================================================== */
  async function loadPosts() {
    const box = $('postList');
    try {
      const r = await api('/api/posts');
      $('badgePosts').textContent = r.posts.length;

      if (!r.posts.length) {
        box.innerHTML = '<div class="empty">还没有文章，去「写文章」写一篇吧</div>';
        return;
      }

      box.innerHTML = r.posts.map(p => `
        <div class="item">
          <div class="grow">
            <div class="t">${esc(p.title)}</div>
            <div class="m">
              ${esc(p.date)} · ${esc(p.category || '未分类')} · ${p.body.length} 字
              <span class="tagline">
                ${p.draft ? '<span class="pill draft">草稿</span>' : ''}
                ${(p.tags || []).map(t => '<span class="pill">' + esc(t) + '</span>').join('')}
              </span>
            </div>
          </div>
          <button class="btn sm" data-edit="${esc(p.file)}">编辑</button>
          <button class="btn sm danger" data-del="${esc(p.file)}">删除</button>
        </div>
      `).join('');
    } catch (e) {
      box.innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
    }
  }

  $('postList').addEventListener('click', async e => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn  = e.target.closest('[data-del]');

    if (editBtn) {
      const r = await api('/api/posts');
      const p = r.posts.find(x => x.file === editBtn.dataset.edit);
      if (p) loadPostIntoForm(p);
      return;
    }

    if (delBtn) {
      const file = delBtn.dataset.del;
      if (!confirm('确定删掉 ' + file + ' 吗？此操作会直接从磁盘删除文件。')) return;
      try {
        await api('/api/post?file=' + encodeURIComponent(file), { method: 'DELETE' });
        loadPosts();
      } catch (err) {
        alert('删除失败：' + err.message);
      }
    }
  });

  /* 分类候选：从现有文章里收集 */
  async function loadCats() {
    try {
      const r = await api('/api/posts');
      const set = new Set();
      r.posts.forEach(p => { if (p.category) set.add(p.category); });
      $('catList').innerHTML = Array.from(set).map(c => '<option value="' + esc(c) + '">').join('');
    } catch (e) { /* 忽略 */ }
  }

  /* ===================================================
     相册
     =================================================== */
  let album = [];

  function renderAlbum() {
    const box = $('albumList');
    $('badgeAlbum').textContent = album.length;

    if (!album.length) {
      box.innerHTML = '<div class="empty">相册是空的，把图片拖到上面加进来吧</div>';
      return;
    }

    box.innerHTML = album.map((it, i) => `
      <div class="album-row">
        <img src="/${esc(it.src)}" alt="" loading="lazy">
        <div class="fields">
          <input type="text" data-a="title" data-i="${i}" value="${esc(it.title)}" placeholder="标题">
          <textarea data-a="desc" data-i="${i}" placeholder="描述（首页大图卡会显示这行）">${esc(it.desc)}</textarea>
        </div>
        <input type="date" data-a="date" data-i="${i}" value="${esc(it.date)}">
        <button class="del" data-del-album="${i}" title="从相册移除">✕</button>
      </div>
    `).join('');
  }

  async function loadAlbum() {
    try {
      const r = await api('/api/gallery');
      album = r.items;
      renderAlbum();
    } catch (e) {
      $('albumList').innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
    }
  }

  $('albumList').addEventListener('input', e => {
    const el = e.target;
    const i = Number(el.dataset.i);
    const key = el.dataset.a;
    if (!key || isNaN(i) || !album[i]) return;
    album[i][key] = el.value;
  });

  $('albumList').addEventListener('click', e => {
    const b = e.target.closest('[data-del-album]');
    if (!b) return;
    album.splice(Number(b.dataset.delAlbum), 1);
    renderAlbum();
  });

  $('btnAlbumSave').addEventListener('click', async () => {
    $('btnAlbumSave').disabled = true;
    msg($('albumMsg'), '保存中…', 'busy');
    try {
      const r = await api('/api/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: album }),
      });
      msg($('albumMsg'), '已保存 ' + r.count + ' 张，站点数据已刷新', 'ok');
    } catch (e) {
      msg($('albumMsg'), '保存失败：' + e.message, 'err');
    } finally {
      $('btnAlbumSave').disabled = false;
    }
  });

  $('btnAlbumReload').addEventListener('click', loadAlbum);

  /* 拖拽上传到相册 */
  function bindDrop(zone, onFiles) {
    if (!zone) return;

    zone.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.addEventListener('change', () => onFiles(input.files));
      input.click();
    });

    ['dragenter', 'dragover'].forEach(t => {
      zone.addEventListener(t, e => { e.preventDefault(); zone.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(t => {
      zone.addEventListener(t, e => { e.preventDefault(); zone.classList.remove('over'); });
    });
    zone.addEventListener('drop', e => {
      if (e.dataTransfer && e.dataTransfer.files) onFiles(e.dataTransfer.files);
    });
  }

  bindDrop($('albumDrop'), async files => {
    msg($('albumMsg'), '上传中…', 'busy');
    const done = await uploadFiles(files);
    if (!done.length) { msg($('albumMsg'), '上传失败', 'err'); return; }

    done.forEach(r => {
      album.push({
        src: r.src,
        title: r.name.replace(/\.[^.]+$/, ''),
        date: todayStr(),
        desc: '',
      });
    });
    renderAlbum();
    msg($('albumMsg'), '上传了 ' + done.length + ' 张，填好标题描述后点保存', 'ok');
  });

  /* ===================================================
     图片库
     =================================================== */
  async function loadImages() {
    const grid = $('imageGrid');
    try {
      const r = await api('/api/images');
      $('badgeImages').textContent = r.images.length;

      if (!r.images.length) {
        grid.innerHTML = '<div class="empty">images/ 里还没有图片</div>';
        return;
      }

      grid.innerHTML = r.images.map(img => `
        <div class="thumb">
          <img src="/images/${encodeURIComponent(img.name)}" alt="" loading="lazy">
          <div class="cap">
            <b title="${esc(img.name)}">${esc(img.name)}</b>
            <i>${fmtSize(img.size)}</i>
          </div>
          <div class="ops">
            <button class="btn sm" data-copy="${esc(img.src)}">复制引用</button>
            <button class="btn sm danger" data-delimg="${esc(img.name)}">删除</button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      grid.innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
    }
  }

  $('imageGrid').addEventListener('click', async e => {
    const copy = e.target.closest('[data-copy]');
    const del  = e.target.closest('[data-delimg]');

    if (copy) {
      const src = copy.dataset.copy;
      const md = '![' + src.replace(/^images\//, '').replace(/\.[^.]+$/, '') + '](../' + src + ')';
      try {
        await navigator.clipboard.writeText(md);
        copy.textContent = '已复制';
        setTimeout(() => { copy.textContent = '复制引用'; }, 1200);
      } catch (err) {
        prompt('复制这段 Markdown：', md);
      }
      return;
    }

    if (del) {
      const name = del.dataset.delimg;
      if (!confirm('确定删除 images/' + name + ' 吗？已经引用它的文章和相册会显示不出来。')) return;
      try {
        await api('/api/image?name=' + encodeURIComponent(name), { method: 'DELETE' });
        loadImages();
      } catch (err) {
        alert('删除失败：' + err.message);
      }
    }
  });

  bindDrop($('imgDrop'), async files => {
    const done = await uploadFiles(files);
    if (done.length) loadImages();
    else alert('没有可上传的图片');
  });

  /* ===================================================
     发布
     =================================================== */
  async function loadStatus() {
    try {
      const r = await api('/api/status');
      $('gitInfo').textContent =
        '分支 ' + r.branch + ' · 未推送 ' + r.ahead + ' 个提交 · 未提交改动 ' + r.changes.length + ' 个';

      const box = $('changeList');
      if (!r.changes.length) {
        box.textContent = '没有未提交的改动';
        return;
      }

      box.innerHTML = r.changes.map(line => {
        const st = line.slice(0, 2);
        const file = line.slice(3);
        const cls = st.indexOf('??') === 0 ? 'add' : (st.indexOf('D') !== -1 ? 'del' : 'mod');
        return '<div><span class="st ' + cls + '">' + esc(st) + '</span>' + esc(file) + '</div>';
      }).join('');
    } catch (e) {
      $('gitInfo').textContent = '读取 git 状态失败：' + e.message;
    }
  }

  $('btnStatus').addEventListener('click', loadStatus);

  $('btnBuild').addEventListener('click', async () => {
    msg($('publishMsg'), '重建中…', 'busy');
    try {
      const r = await api('/api/build', { method: 'POST' });
      msg($('publishMsg'), '数据已重建', 'ok');
      $('publishOut').textContent = r.output || '';
    } catch (e) {
      msg($('publishMsg'), '失败：' + e.message, 'err');
    }
  });

  $('btnPublish').addEventListener('click', async () => {
    const btn = $('btnPublish');
    btn.disabled = true;
    msg($('publishMsg'), '正在提交并推送…', 'busy');

    try {
      const r = await api('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: $('commitMsg').value }),
      });
      msg($('publishMsg'), r.message || (r.ok ? '完成' : '失败'), r.ok ? 'ok' : 'err');
      $('publishOut').textContent = r.output || '';
    } catch (e) {
      msg($('publishMsg'), '失败：' + e.message, 'err');
    } finally {
      btn.disabled = false;
      loadStatus();
    }
  });

  /* ===================================================
     启动
     =================================================== */
  $('f-date').value = todayStr();
  updatePreview();
  loadCats();

  /* 支持用 #list / #album 这样的锚点直接打开某个页签 */
  const TABS = ['write', 'list', 'album', 'images', 'publish'];
  const hash = (location.hash || '').replace(/^#/, '');
  if (TABS.indexOf(hash) !== -1) showTab(hash);

  /* 侧栏计数先填上，不用等切页签 */
  (async function initBadges() {
    try {
      const [p, g, im] = await Promise.all([
        api('/api/posts'), api('/api/gallery'), api('/api/images'),
      ]);
      $('badgePosts').textContent  = p.posts.length;
      $('badgeAlbum').textContent  = g.items.length;
      $('badgeImages').textContent = im.images.length;
    } catch (e) { /* 拿不到就先空着 */ }
  })();
})();
