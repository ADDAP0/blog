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
  const LOADERS = {
    list:    loadPosts,
    album:   loadAlbum,
    music:   loadMusic,
    images:  loadImages,
    friends: loadFriends,
    trash:   loadTrash,
    backup:  loadBackup,
    publish: loadStatus,
  };

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
      afterWrite();
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
  async function uploadFiles(files, accept) {
    const list = Array.from(files).filter(f => !accept || accept(f));
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

  const isImage = f => f.type.indexOf('image/') === 0;

  /* 写文章页：上传后插入 Markdown */
  $('btnPickImage').addEventListener('click', () => $('filePick').click());
  $('filePick').addEventListener('change', async e => {
    const files = e.target.files;
    if (!files || !files.length) return;

    msg($('writeMsg'), '上传中…', 'busy');
    const done = await uploadFiles(files, isImage);
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
      if (!confirm('删除 ' + file + ' ？\n\n会先放进「回收站」，之后随时能恢复。')) return;
      try {
        await api('/api/post?file=' + encodeURIComponent(file), { method: 'DELETE' });
        loadPosts();
        afterWrite();
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
      afterWrite();
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
    const done = await uploadFiles(files, isImage);
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
      if (!confirm('删除 images/' + name + ' ？\n\n会先放进「回收站」，之后随时能恢复。\n' +
                   '（引用它的文章和相册会暂时显示不出来）')) return;
      try {
        await api('/api/file?src=' + encodeURIComponent('images/' + name), { method: 'DELETE' });
        loadImages();
        afterWrite();
      } catch (err) {
        alert('删除失败：' + err.message);
      }
    }
  });

  bindDrop($('imgDrop'), async files => {
    const done = await uploadFiles(files, isImage);
    if (done.length) loadImages();
    else alert('没有可上传的图片');
  });

  /* ===================================================
     音乐
     =================================================== */
  let music = [];
  let musicFiles = { audio: [], lrc: [] };
  let imagePool = [];                 // 封面下拉用

  function optionsHtml(list, current, emptyLabel) {
    const all = list.slice();
    if (current && all.indexOf(current) === -1) all.unshift(current);

    let html = '<option value="">' + esc(emptyLabel) + '</option>';
    all.forEach(function (v) {
      if (!v) return;
      html += '<option value="' + esc(v) + '"' +
              (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    return html;
  }

  function coverSrc(v) {
    if (!v) return '';
    return /^https?:/i.test(v) ? v : '/' + v;
  }

  function renderMusic() {
    const box = $('musicList');
    $('badgeMusic').textContent = music.length;

    if (!music.length) {
      box.innerHTML = '<div class="empty">播放列表是空的。把音频拖到上面，或点「添加一条」再选文件</div>';
      return;
    }

    box.innerHTML = music.map(function (s, i) {
      return '<div class="music-row">' +
        '<img src="' + esc(coverSrc(s.cover)) + '" alt="">' +
        '<div class="fields">' +
          '<input type="text" data-m="title" data-i="' + i + '" value="' + esc(s.title) + '" placeholder="曲名">' +
          '<input type="text" data-m="artist" data-i="' + i + '" value="' + esc(s.artist) + '" placeholder="艺术家">' +
          '<select data-m="src" data-i="' + i + '">' +
            optionsHtml(musicFiles.audio, s.src, '（选择音频文件）') + '</select>' +
          '<select data-m="lrc" data-i="' + i + '">' +
            optionsHtml(musicFiles.lrc, s.lrc, '（无歌词）') + '</select>' +
          '<select data-m="cover" data-i="' + i + '">' +
            optionsHtml(imagePool, s.cover, '（无封面）') + '</select>' +
          (s.src ? '<audio class="preview" controls preload="none" src="/' + esc(s.src) + '"></audio>' : '') +
        '</div>' +
        '<div class="ops">' +
          '<button type="button" data-move="up" data-i="' + i + '" title="上移"' +
            (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" data-move="down" data-i="' + i + '" title="下移"' +
            (i === music.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="del" data-del-music="' + i + '" title="移除">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  async function loadMusic() {
    try {
      const [m, im] = await Promise.all([api('/api/music'), api('/api/images')]);
      music = m.items || [];
      musicFiles = m.files || { audio: [], lrc: [] };
      imagePool = (im.images || []).map(x => x.src);
      renderMusic();
    } catch (e) {
      $('musicList').innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
    }
  }

  $('musicList').addEventListener('input', e => {
    const el = e.target;
    if (el.tagName === 'SELECT') return;      // select 走 change
    const i = Number(el.dataset.i);
    const key = el.dataset.m;
    if (!key || isNaN(i) || !music[i]) return;
    music[i][key] = el.value;
  });

  $('musicList').addEventListener('change', e => {
    const el = e.target;
    if (el.tagName !== 'SELECT') return;
    const i = Number(el.dataset.i);
    const key = el.dataset.m;
    if (!key || isNaN(i) || !music[i]) return;

    music[i][key] = el.value;
    if (key === 'cover' || key === 'src') renderMusic();   // 封面/音频变了要重绘
  });

  $('musicList').addEventListener('click', e => {
    const del = e.target.closest('[data-del-music]');
    if (del) {
      music.splice(Number(del.dataset.delMusic), 1);
      renderMusic();
      return;
    }

    const mv = e.target.closest('[data-move]');
    if (mv) {
      const i = Number(mv.dataset.i);
      const to = mv.dataset.move === 'up' ? i - 1 : i + 1;
      if (to < 0 || to >= music.length) return;
      const tmp = music[i]; music[i] = music[to]; music[to] = tmp;
      renderMusic();
    }
  });

  $('btnMusicAdd').addEventListener('click', () => {
    music.push({ src: '', title: '', artist: '', lrc: '', cover: '' });
    renderMusic();
  });

  $('btnMusicReload').addEventListener('click', loadMusic);

  $('btnMusicSave').addEventListener('click', async () => {
    $('btnMusicSave').disabled = true;
    msg($('musicMsg'), '保存中…', 'busy');
    try {
      const r = await api('/api/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: music }),
      });
      msg($('musicMsg'), '已保存 ' + r.count + ' 首', 'ok');
      loadMusic();
      afterWrite();
    } catch (e) {
      msg($('musicMsg'), '保存失败：' + e.message, 'err');
    } finally {
      $('btnMusicSave').disabled = false;
    }
  });

  bindDrop($('musicDrop'), async files => {
    msg($('musicMsg'), '上传中…', 'busy');
    const done = await uploadFiles(files);
    if (!done.length) { msg($('musicMsg'), '上传失败', 'err'); return; }

    /* 音频自动加一条，歌词和封面只是传上去供下拉选择 */
    let added = 0;
    done.forEach(function (r) {
      if (/\.(mp3|m4a|ogg|wav|flac|aac|opus)$/i.test(r.name)) {
        music.push({
          src: r.src,
          title: r.name.replace(/\.[^.]+$/, ''),
          artist: '',
          lrc: '',
          cover: '',
        });
        added++;
      }
    });

    await loadMusic();
    msg($('musicMsg'),
        '上传了 ' + done.length + ' 个文件' + (added ? '，自动新增 ' + added + ' 首' : ''),
        'ok');
    afterWrite();
  });

  /* ===================================================
     友链
     =================================================== */
  let friends = [];

  function renderFriends() {
    const box = $('friendEditList');
    $('badgeFriends').textContent = friends.length;

    if (!friends.length) {
      box.innerHTML = '<div class="empty">还没有友链，点「添加一条」开始</div>';
      return;
    }

    box.innerHTML = friends.map(function (f, i) {
      return '<div class="friend-row">' +
        '<img src="' + esc(coverSrc(f.avatar)) + '" alt="">' +
        '<div class="fields">' +
          '<input type="text" data-f="name" data-i="' + i + '" value="' + esc(f.name) + '" placeholder="站点名称">' +
          '<input type="text" data-f="url" data-i="' + i + '" value="' + esc(f.url) + '" placeholder="https://example.com">' +
          '<input type="text" data-f="avatar" data-i="' + i + '" value="' + esc(f.avatar) + '" placeholder="头像：外链，或 images/avatar.jpg">' +
          '<textarea data-f="desc" data-i="' + i + '" placeholder="一句话介绍">' + esc(f.desc) + '</textarea>' +
        '</div>' +
        '<button type="button" class="del" data-del-friend="' + i + '" title="移除">✕</button>' +
      '</div>';
    }).join('');
  }

  async function loadFriends() {
    try {
      const r = await api('/api/friends');
      friends = r.items || [];
      renderFriends();
    } catch (e) {
      $('friendEditList').innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
    }
  }

  $('friendEditList').addEventListener('input', e => {
    const el = e.target;
    const i = Number(el.dataset.i);
    const key = el.dataset.f;
    if (!key || isNaN(i) || !friends[i]) return;
    friends[i][key] = el.value;
  });

  $('friendEditList').addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.f !== 'avatar') return;
    renderFriends();
  });

  $('friendEditList').addEventListener('click', e => {
    const del = e.target.closest('[data-del-friend]');
    if (!del) return;
    friends.splice(Number(del.dataset.delFriend), 1);
    renderFriends();
  });

  $('btnFriendAdd').addEventListener('click', () => {
    friends.push({ name: '', url: 'https://', avatar: '', desc: '' });
    renderFriends();
  });

  $('btnFriendReload').addEventListener('click', loadFriends);

  $('btnFriendSave').addEventListener('click', async () => {
    $('btnFriendSave').disabled = true;
    msg($('friendMsg'), '保存中…', 'busy');
    try {
      const r = await api('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: friends }),
      });
      msg($('friendMsg'), '已保存 ' + r.count + ' 条', 'ok');
      loadFriends();
      afterWrite();
    } catch (e) {
      msg($('friendMsg'), '保存失败：' + e.message, 'err');
    } finally {
      $('btnFriendSave').disabled = false;
    }
  });

  /* ===================================================
     同步状态（顶部常驻条）
     =================================================== */
  async function refreshSync() {
    const bar = $('syncBar');
    const txt = $('syncText');

    try {
      const r = await api('/api/status');

      bar.classList.remove('ok', 'dirty', 'ahead', 'error');

      /* 三种「没同步」的情况都要列出来，别漏掉落后云端 */
      const bits = [];
      if (r.changes.length) bits.push(r.changes.length + ' 处改动没提交');
      if (r.ahead)   bits.push(r.ahead + ' 个提交没推送');
      if (r.behind)  bits.push('落后云端 ' + r.behind + ' 个提交');

      if (!bits.length) {
        bar.classList.add('ok');
        txt.textContent = '已与 GitHub 同步';
      } else if (r.behind && !r.ahead && !r.changes.length) {
        /* 本地很干净，只是云端更新了 */
        bar.classList.add('ahead');
        txt.textContent = bits.join(' · ');
      } else {
        bar.classList.add('dirty');
        txt.textContent = bits.join(' · ');
      }

      $('badgeTrash').textContent = r.trash;
      return r;
    } catch (e) {
      bar.classList.remove('ok', 'dirty', 'ahead');
      bar.classList.add('error');
      txt.textContent = '读不到 git 状态';
      return null;
    }
  }

  $('syncBar').addEventListener('click', () => showTab('publish'));

  /* 任何写操作之后都刷一次，保证顶上那条始终是真的 */
  const afterWrite = () => refreshSync();

  /* ===================================================
     云端核对
     =================================================== */
  function paintSyncPanel(r) {
    const panel = $('syncPanel');
    const ico   = $('syncPanelIco');
    const title = $('syncPanelTitle');
    const text  = $('syncPanelText');
    const btnPull  = $('btnSyncPull');
    const btnForce = $('btnSyncForce');

    panel.classList.remove('ok', 'warn', 'err');
    btnPull.hidden = true;
    btnForce.hidden = true;

    /* 连不上云端 —— 最要紧的是别撒谎说"已一致" */
    if (!r.fetched) {
      panel.classList.add('err');
      ico.textContent = '📡';
      title.textContent = '连不上云端，这次没核对上';
      text.textContent = '到 GitHub 的网络不通：' + r.fetchError +
        '\n下方显示的「云端 ' + r.remote + '」是上一次成功同步时的记录，不一定是最新的。';
      return;
    }

    if (r.inSync) {
      panel.classList.add('ok');
      ico.textContent = '✅';
      title.textContent = '已核对：本地和云端完全一致';
      text.textContent = '本地 ' + r.head + ' = 云端 ' + r.remote + '，没有待处理的东西。';
      return;
    }

    /* 本地干净 + 云端领先 = 可以安全地用云端覆盖，这是你要的自动同步 */
    if (r.canFastForward) {
      panel.classList.add('warn');
      ico.textContent = '⬇️';
      title.textContent = '云端有 ' + r.behind + ' 个新提交';
      text.textContent = '本地很干净，同步不会丢任何东西。';
      btnPull.hidden = false;
      return;
    }

    /* 本地领先 */
    if (r.ahead > 0 && r.behind === 0) {
      panel.classList.add('warn');
      ico.textContent = '⬆️';
      title.textContent = '本地有 ' + r.ahead + ' 个提交没推上去';
      text.textContent = '本地比云端新，不需要同步。去上面点「只推送」就行。';
      return;
    }

    /* 分叉 */
    if (r.ahead > 0 && r.behind > 0) {
      panel.classList.add('err');
      ico.textContent = '⚠️';
      title.textContent = '本地和云端分叉了';
      text.textContent = '本地领先 ' + r.ahead + ' 个提交、落后 ' + r.behind + ' 个提交。' +
        '\n两边都有对方没有的内容，直接覆盖必定丢掉一边。想清楚再动。';
      btnForce.hidden = false;
      return;
    }

    /* 有未提交改动 */
    if (r.dirty) {
      panel.classList.add('warn');
      ico.textContent = '✏️';
      title.textContent = '有 ' + r.dirty + ' 处改动没提交';
      text.textContent = r.behind
        ? '本地有没提交的改动，云端又领先 ' + r.behind + ' 个提交。\n要把云端拉下来就会覆盖这些改动，所以先提交或放弃它们。'
        : '本地有没提交的改动，云端没有新东西。';
      if (r.behind) btnForce.hidden = false;
      return;
    }

    panel.classList.add('warn');
    ico.textContent = '❔';
    title.textContent = '状态不明';
    text.textContent = '领先 ' + r.ahead + ' / 落后 ' + r.behind + ' / 未提交 ' + r.dirty;
  }

  async function checkCloud(auto) {
    const panel = $('syncPanel');

    $('syncPanelIco').textContent = '⏳';
    $('syncPanelTitle').textContent = '正在核对云端…';
    $('syncPanelText').textContent = '正在连接 GitHub，网络慢的话要等十几秒';
    panel.classList.remove('ok', 'warn', 'err');

    try {
      const r = await api('/api/sync');
      paintSyncPanel(r);

      /* 本地干净 + 云端领先 —— 按你的要求直接拉下来，不打扰你 */
      if (auto && r.canFastForward) {
        $('syncPanelTitle').textContent = '云端有 ' + r.behind + ' 个新提交，正在自动同步…';
        const p = await api('/api/sync/pull', { method: 'POST' });
        msg($('publishMsg'), p.message, p.ok ? 'ok' : 'err');
        await checkCloud(false);
        loadStatus();
        return;
      }

      /* 核对会 fetch，fetch 会更新 origin/main。
         所以核完必须统一刷一遍，否则三步条和 gitInfo 还停在 fetch 之前的旧状态，
         就会出现「顶部条说落后 1 个、下面说已一致」这种自相矛盾。 */
      loadStatus();
    } catch (e) {
      panel.classList.remove('ok', 'warn');
      panel.classList.add('err');
      $('syncPanelIco').textContent = '❌';
      $('syncPanelTitle').textContent = '核对失败';
      $('syncPanelText').textContent = e.message;
    }
  }

  $('btnSyncCheck').addEventListener('click', () => checkCloud(false));

  $('btnSyncPull').addEventListener('click', async () => {
    $('btnSyncPull').disabled = true;
    msg($('publishMsg'), '同步中…', 'busy');
    try {
      const p = await api('/api/sync/pull', { method: 'POST' });
      msg($('publishMsg'), p.message, p.ok ? 'ok' : 'err');
    } catch (e) {
      msg($('publishMsg'), '失败：' + e.message, 'err');
    } finally {
      $('btnSyncPull').disabled = false;
      await checkCloud(false);
      loadStatus();
    }
  });

  $('btnSyncForce').addEventListener('click', async () => {
    const yes = confirm(
      '用云端覆盖本地？\n\n' +
      '会丢掉本地所有没推上去的东西（包括没提交的改动）。\n' +
      '覆盖前会自动建一个备份分支，出事能捞回来，但那不是常规操作。\n\n' +
      '确定继续吗？'
    );
    if (!yes) return;

    $('btnSyncForce').disabled = true;
    msg($('publishMsg'), '正在用云端覆盖本地…', 'busy');
    try {
      const p = await api('/api/sync/force', { method: 'POST' });
      msg($('publishMsg'), p.message, p.ok ? 'ok' : 'err');
      $('publishOut').textContent = p.output || '';
    } catch (e) {
      msg($('publishMsg'), '失败：' + e.message, 'err');
    } finally {
      $('btnSyncForce').disabled = false;
      await checkCloud(false);
      loadStatus();
    }
  });

  /* ===================================================
     发布
     =================================================== */
  function paintSteps(r) {
    const local  = $('stepLocal');
    const ahead  = $('stepAhead');
    const remote = $('stepRemote');

    [local, ahead, remote].forEach(el => el.classList.remove('todo', 'done', 'warn'));

    const n = r.changes.length;
    local.querySelector('span').textContent = n ? n + ' 处' : '无';
    local.classList.add(n ? 'todo' : 'done');

    ahead.querySelector('span').textContent = r.ahead ? r.ahead + ' 个提交' : '无';
    ahead.classList.add(r.ahead ? 'warn' : 'done');

    /* 云端那一格要反映「落后多少」，不然会误导成已经同步好了 */
    if (r.behind) {
      remote.querySelector('span').textContent = '落后 ' + r.behind + ' 个提交';
      remote.classList.add('todo');
    } else {
      remote.querySelector('span').textContent = r.remote || r.head || '—';
      remote.classList.add('done');
    }
  }

  async function loadStatus() {
    const r = await refreshSync();
    if (!r) { $('gitInfo').textContent = '读取 git 状态失败'; return; }

    paintSteps(r);

    $('gitInfo').textContent =
      '分支 ' + r.branch +
      ' · 本地 ' + (r.head || '?') +
      (r.upstream ? ' · 云端 ' + r.upstream : '') +
      ' · 未提交 ' + r.changes.length +
      ' · 未推送 ' + r.ahead +
      (r.behind ? ' · 落后云端 ' + r.behind : '');

    const box = $('changeList');
    if (!r.changes.length) {
      if (r.ahead && r.behind) {
        box.textContent = '工作区干净，但本地领先 ' + r.ahead + ' 个提交、落后云端 ' + r.behind + ' 个，两边分叉了';
      } else if (r.ahead) {
        box.textContent = '工作区干净，但有 ' + r.ahead + ' 个提交还没推上去';
      } else if (r.behind) {
        box.textContent = '工作区干净，云端有 ' + r.behind + ' 个新提交还没拉下来';
      } else {
        box.textContent = '工作区干净，本地和云端一致';
      }
      return;
    }

    box.innerHTML = r.changes.map(line => {
      const st = line.slice(0, 2);
      const file = line.slice(3);
      const cls = st.indexOf('??') === 0 ? 'add' : (st.indexOf('D') !== -1 ? 'del' : 'mod');
      return '<div><span class="st ' + cls + '">' + esc(st) + '</span>' + esc(file) + '</div>';
    }).join('');
  }

  /* 提交 / 推送 / 提交并推送，走同一套收尾逻辑 */
  async function runGit(btn, url, busyText) {
    btn.disabled = true;
    msg($('publishMsg'), busyText, 'busy');

    try {
      const r = await api(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: $('commitMsg').value }),
      });
      msg($('publishMsg'), r.message || (r.ok ? '完成' : '没做成'), r.ok ? 'ok' : 'err');
      $('publishOut').textContent = r.output || '';
    } catch (e) {
      msg($('publishMsg'), '失败：' + e.message, 'err');
    } finally {
      btn.disabled = false;
      loadStatus();
    }
  }

  $('btnStatus').addEventListener('click', loadStatus);
  $('btnCommit').addEventListener('click', () => runGit($('btnCommit'), '/api/commit', '提交到本地中…'));
  $('btnPushOnly').addEventListener('click', () => runGit($('btnPushOnly'), '/api/push', '推送到 GitHub 中…'));
  $('btnPublish').addEventListener('click', () => runGit($('btnPublish'), '/api/publish', '提交并推送中…'));

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

  $('btnDiscard').addEventListener('click', async () => {
    if (!confirm('放弃所有「还没提交」的改动？\n\n会把已跟踪文件恢复到上次提交的样子。\n' +
                 '已经提交过的东西不受影响，新上传但还没提交的文件也不会被删。')) return;

    msg($('publishMsg'), '恢复中…', 'busy');
    try {
      const r = await api('/api/discard', { method: 'POST' });
      msg($('publishMsg'), r.message, r.ok ? 'ok' : 'err');
      $('publishOut').textContent = r.output || '';
    } catch (e) {
      msg($('publishMsg'), '失败：' + e.message, 'err');
    } finally {
      loadStatus();
    }
  });

  /* ===================================================
     回收站
     =================================================== */
  function fmtTime(ms) {
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  async function loadTrash() {
    const box = $('trashList');
    try {
      const r = await api('/api/trash');
      $('badgeTrash').textContent = r.items.length;

      if (!r.items.length) {
        box.innerHTML = '<div class="empty">回收站是空的</div>';
        return;
      }

      box.innerHTML = r.items.map(it => {
        const isPost = /^posts\//.test(it.orig);
        return '<div class="trash-row' + (it.exists ? '' : ' missing') + '">' +
          '<span class="ico">' + (isPost ? '📄' : '🖼️') + '</span>' +
          '<div class="grow">' +
            '<div class="t">' + esc(it.name) + '</div>' +
            '<div class="m">原位置 ' + esc(it.orig) + ' · ' + fmtSize(it.size) +
              ' · 删除于 ' + fmtTime(it.deletedAt) +
              (it.exists ? '' : ' · 文件已缺失') + '</div>' +
          '</div>' +
          '<button class="btn sm" data-restore="' + esc(it.id) + '"' +
            (it.exists ? '' : ' disabled') + '>恢复</button>' +
          '<button class="btn sm danger" data-purge="' + esc(it.id) + '">彻底删除</button>' +
        '</div>';
      }).join('');
    } catch (e) {
      box.innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
    }
  }

  $('trashList').addEventListener('click', async e => {
    const rs = e.target.closest('[data-restore]');
    const pg = e.target.closest('[data-purge]');

    if (rs) {
      msg($('trashMsg'), '恢复中…', 'busy');
      try {
        const r = await api('/api/trash/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: rs.dataset.restore }),
        });
        msg($('trashMsg'), r.message, 'ok');
      } catch (err) {
        msg($('trashMsg'), '恢复失败：' + err.message, 'err');
      } finally {
        loadTrash();
        afterWrite();
      }
      return;
    }

    if (pg) {
      if (!confirm('彻底删除这一条？删了就真找不回来了。')) return;
      try {
        await api('/api/trash?id=' + encodeURIComponent(pg.dataset.purge), { method: 'DELETE' });
        msg($('trashMsg'), '已彻底删除', 'ok');
      } catch (err) {
        msg($('trashMsg'), '失败：' + err.message, 'err');
      } finally {
        loadTrash();
      }
    }
  });

  $('btnTrashReload').addEventListener('click', loadTrash);

  $('btnTrashClear').addEventListener('click', async () => {
    if (!confirm('清空回收站？里面的文件会被永久删除，无法恢复。')) return;
    try {
      const r = await api('/api/trash', { method: 'DELETE' });
      msg($('trashMsg'), '已清空 ' + ((r.result && r.result.cleared) || 0) + ' 项', 'ok');
    } catch (e) {
      msg($('trashMsg'), '失败：' + e.message, 'err');
    } finally {
      loadTrash();
    }
  });

  /* 关掉服务。隐藏窗口启动后没有控制台可关，只能靠这个按钮 */
  $('btnQuit').addEventListener('click', async () => {
    if (!confirm('关闭后台服务？\n\n关掉之后这个窗口就打不开页面了，\n下次用桌面上的「写作后台」图标重新启动。')) return;

    try {
      const r = await api('/api/shutdown', { method: 'POST' });
      document.body.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100vh;' +
        'font-family:-apple-system,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;text-align:center">' +
        '<div><div style="font-size:44px;margin-bottom:16px">⏻</div>' +
        '<div style="font-size:17px;font-weight:600;color:#1f2937;margin-bottom:8px">' +
        esc(r.message || '后台服务已关闭') + '</div>' +
        '<div style="font-size:13px;color:#6b7280">下次用桌面上的「写作后台」图标重新打开</div>' +
        '</div></div>';
    } catch (e) {
      /* 服务已经退了，连接被断开是正常的，不用报错 */
      location.reload();
    }
  });

  /* ===================================================
     PWA：让自己能被「安装」进系统
     装好之后会出现在开始菜单（能搜到），任务栏也是独立图标
     =================================================== */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function (e) {
      console.warn('[pwa] Service Worker 注册失败：', e);
    });
  }

  let installEvent = null;

  /* 已经是装好之后打开的，就别再显示安装按钮了 */
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                     window.navigator.standalone === true;

  if (!standalone) {
    window.addEventListener('beforeinstallprompt', function (e) {
      /* 把浏览器自己弹的那个小提示拦下来，改由我们在界面上放按钮 */
      e.preventDefault();
      installEvent = e;
      $('btnInstall').hidden = false;
    });

    window.addEventListener('appinstalled', function () {
      $('btnInstall').hidden = true;
      installEvent = null;
    });

    $('btnInstall').addEventListener('click', async function () {
      if (!installEvent) return;
      installEvent.prompt();
      try {
        const res = await installEvent.userChoice;
        if (res && res.outcome === 'accepted') $('btnInstall').hidden = true;
      } catch (e) { /* 用户直接关掉了，忽略 */ }
      installEvent = null;
    });
  }

  /* ===================================================
     备份与恢复
     =================================================== */
  const DIR_NAMES = {
    posts: '文章', data: '站点数据', images: '图片', music: '音乐',
    js: '脚本', css: '样式', pages: '页面', tools: '写作后台',
  };

  async function loadBackup() {
    const hero = $('backupHero');

    try {
      const r = await api('/api/backup');

      $('backupRoot').textContent = r.root;
      hero.classList.remove('ok', 'warn', 'err');

      if (r.safe) {
        hero.classList.add('ok');
        $('bhIcon').textContent = '✅';
        $('bhTitle').textContent = '安全：所有内容在云端都有备份';
        $('bhSub').textContent = r.contentCount + ' 个文件都在 GitHub 上，' +
                                 '这台电脑全丢了也能完整拿回来。';
      } else {
        hero.classList.add('warn');
        $('bhIcon').textContent = '⚠️';

        const bits = [];
        if (r.untracked) bits.push(r.untracked + ' 个文件还没进 git');
        if (r.ahead)     bits.push(r.ahead + ' 个提交没推送');
        if (r.dirty)     bits.push(r.dirty + ' 处改动没提交');

        $('bhTitle').textContent = '还没完全同步：' + bits.join('、');
        $('bhSub').textContent = '这些内容目前只在这台电脑上。去「发布」页推一下，' +
                                 '它们才会进 GitHub 的备份。';
      }

      $('bkGrid').innerHTML = r.sections.map(function (s) {
        return '<div class="bk-item">' +
          '<div class="n">' + esc(DIR_NAMES[s.name] || s.name) +
            ' <span style="color:var(--muted);font-weight:400">' + esc(s.name) + '/</span></div>' +
          '<div class="s">' + s.count + ' 个文件 · ' + fmtSize(s.size) + '</div>' +
          (s.untracked ? '<div class="w">⚠ ' + s.untracked + ' 个还没进 git</div>' : '') +
        '</div>';
      }).join('');
    } catch (e) {
      hero.classList.remove('ok', 'warn');
      hero.classList.add('err');
      $('bhIcon').textContent = '❌';
      $('bhTitle').textContent = '检查失败';
      $('bhSub').textContent = e.message;
    }
  }

  $('btnOpenFolder').addEventListener('click', async function () {
    try {
      await api('/api/open-folder', { method: 'POST' });
    } catch (e) {
      alert('打不开文件夹：' + e.message);
    }
  });

  $('btnCopyClone').addEventListener('click', async function () {
    const btn = $('btnCopyClone');
    const text = $('cloneCmd').textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = '复制'; }, 1200);
    } catch (e) {
      prompt('复制这一行：', text);
    }
  });

  /* ===================================================
     启动
     =================================================== */
  $('f-date').value = todayStr();
  updatePreview();
  loadCats();

  /* 支持用 #list / #album 这样的锚点直接打开某个页签 */
  const TABS = ['write', 'list', 'album', 'music', 'images', 'friends', 'trash', 'backup', 'publish'];
  const hash = (location.hash || '').replace(/^#/, '');
  if (TABS.indexOf(hash) !== -1) showTab(hash);

  /* 侧栏计数先填上，不用等切页签 */
  (async function initBadges() {
    try {
      const [p, g, m, im, fr, tr] = await Promise.all([
        api('/api/posts'), api('/api/gallery'), api('/api/music'),
        api('/api/images'), api('/api/friends'), api('/api/trash'),
      ]);
      $('badgePosts').textContent   = p.posts.length;
      $('badgeAlbum').textContent   = g.items.length;
      $('badgeMusic').textContent   = m.items.length;
      $('badgeImages').textContent  = im.images.length;
      $('badgeFriends').textContent = fr.items.length;
      $('badgeTrash').textContent   = tr.items.length;
    } catch (e) { /* 拿不到就先空着 */ }
  })();

  refreshSync();
  setInterval(refreshSync, 20000);   // 每 20 秒看一眼本地状态

  /* 打开后台就核对一次云端；本地干净的话顺手同步下来 */
  checkCloud(true);
})();
