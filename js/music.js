/* ===================================================
   音乐页：播放列表 + 播放器
   列表来自 data/music.json
   从首页音乐卡点进来时会带上 ?i=当前曲目&t=进度，能接着放
   =================================================== */
(function () {
  'use strict';

  const audio = document.getElementById('npAudio');
  if (!audio) return;

  const coverWrap = document.getElementById('npCover');
  const coverImg  = document.getElementById('npImg');
  const titleEl   = document.getElementById('npTitle');
  const artistEl  = document.getElementById('npArtist');
  const lyricEl   = document.getElementById('npLyric');
  const playedEl  = document.getElementById('npPlayed');
  const trackEl   = document.getElementById('npTrack');
  const timeNowEl = document.getElementById('npTimeNow');
  const timeTotalEl = document.getElementById('npTimeTotal');
  const playBtn   = document.getElementById('npPlay');
  const prevBtn   = document.getElementById('npPrev');
  const nextBtn   = document.getElementById('npNext');
  const listEl    = document.getElementById('plList');
  const countEl   = document.getElementById('plCount');
  const subEl     = document.getElementById('musicSub');

  let playlist = [];
  let currentIndex = -1;
  let isSeeking = false;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* 数据里存的是相对站点根的路径，补上前缀；外链原样放行 */
  function assetUrl(u) {
    if (!u) return '';
    return /^(https?:)?\/\//i.test(u) || u.indexOf('data:') === 0 ? u : SITE_ROOT + u;
  }

  function fmt(sec) {
    if (!isFinite(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function parseLRC(text) {
    const lines = [];
    const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\](.*)/;
    text.split(/\r?\n/).forEach(function (line) {
      const m = line.match(re);
      if (!m) return;
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
      const txt = m[4].trim();
      if (txt) lines.push({ time: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + ms / 1000, text: txt });
    });
    return lines.sort(function (a, b) { return a.time - b.time; });
  }

  /* ---------- 数据 ---------- */
  async function loadPlaylist() {
    try {
      const res = await fetch(SITE_ROOT + 'data/music.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const list = await res.json();

      playlist = (Array.isArray(list) ? list : [])
        .filter(function (s) { return s && s.src; })
        .map(function (s) {
          return Object.assign({}, s, {
            src:   assetUrl(s.src),
            lrc:   s.lrc ? assetUrl(s.lrc) : '',
            cover: s.cover ? assetUrl(s.cover) : '',
            lyrics: [],
          });
        });
    } catch (e) {
      console.error('[music] 播放列表加载失败', e);
      playlist = [];
    }
  }

  /* ---------- 列表 ---------- */
  function renderList() {
    if (!playlist.length) {
      listEl.innerHTML = '<div class="page-state">' +
        '<span class="material-symbols-rounded">music_off</span>还没有音乐</div>';
      countEl.textContent = '';
      return;
    }

    listEl.innerHTML = playlist.map(function (s, i) {
      const active = i === currentIndex;
      return '<button class="pl-item' + (active ? ' active' : '') + '" type="button" data-i="' + i + '">' +
        '<span class="pl-idx">' +
          (active
            ? '<span class="material-symbols-rounded">graphic_eq</span>'
            : (i + 1)) +
        '</span>' +
        '<span class="pl-text">' +
          '<span class="pl-title">' + esc(s.title) + '</span>' +
          '<span class="pl-artist">' + esc(s.artist || '') + '</span>' +
        '</span>' +
        (active ? '<span class="pl-now">播放中</span>' : '') +
      '</button>';
    }).join('');

    countEl.textContent = playlist.length + ' 首';
  }

  /* ---------- 载入某首 ---------- */
  async function loadSong(index, autoplay) {
    const song = playlist[index];
    if (!song) return;

    currentIndex = index;

    audio.src = song.src;
    titleEl.textContent  = song.title || '未知曲目';
    artistEl.textContent = song.artist || '';
    coverImg.src = song.cover || '';
    coverImg.alt = song.title || '';

    playedEl.style.width = '0%';
    timeNowEl.textContent = '00:00';
    timeTotalEl.textContent = '00:00';
    lyricEl.textContent = '';

    document.title = (song.title || '音乐') + ' · 米饭多加水の小窝';

    renderList();

    if (song.lrc && (!song.lyrics || !song.lyrics.length)) {
      try {
        const res = await fetch(song.lrc);
        if (!res.ok) throw new Error('LRC 404');
        song.lyrics = parseLRC(await res.text());
      } catch (e) {
        song.lyrics = [];
      }
    }

    if (song.lyrics && song.lyrics.length) {
      lyricEl.textContent = song.lyrics[0].text;
    }

    if (autoplay) {
      const pr = audio.play();
      if (pr && pr.catch) pr.catch(function () { /* 被浏览器拦截就等用户点 */ });
    }
  }

  function toggle() {
    if (!playlist.length) return;
    if (audio.paused) {
      const pr = audio.play();
      if (pr && pr.catch) pr.catch(function () {});
    } else {
      audio.pause();
    }
  }

  function step(delta) {
    if (playlist.length < 2) { audio.currentTime = 0; return; }
    loadSong((currentIndex + delta + playlist.length) % playlist.length, true);
  }

  /* ---------- 进度 ---------- */
  function updateProgress() {
    if (!audio.duration) return;

    if (!isSeeking) {
      playedEl.style.width = (audio.currentTime / audio.duration) * 100 + '%';
    }
    timeNowEl.textContent = fmt(audio.currentTime);

    const lyrics = playlist[currentIndex] && playlist[currentIndex].lyrics;
    if (lyrics && lyrics.length) {
      let cur = lyrics[0].text;
      for (let i = 0; i < lyrics.length; i++) {
        if (audio.currentTime >= lyrics[i].time) cur = lyrics[i].text;
        else break;
      }
      if (lyricEl.textContent !== cur) lyricEl.textContent = cur;
    }
  }

  function seek(e) {
    const rect = trackEl.getBoundingClientRect();
    const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    if (audio.duration) audio.currentTime = pct * audio.duration;
  }

  /* ---------- 事件 ---------- */
  playBtn.addEventListener('click', toggle);
  prevBtn.addEventListener('click', function () { step(-1); });
  nextBtn.addEventListener('click', function () { step(1); });

  listEl.addEventListener('click', function (e) {
    const btn = e.target.closest('.pl-item');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    if (i === currentIndex) { toggle(); return; }
    loadSong(i, true);
  });

  audio.addEventListener('play', function () {
    playBtn.querySelector('.material-symbols-rounded').textContent = 'pause';
    coverWrap.classList.add('spinning');
  });
  audio.addEventListener('pause', function () {
    playBtn.querySelector('.material-symbols-rounded').textContent = 'play_arrow';
    coverWrap.classList.remove('spinning');
  });
  audio.addEventListener('loadedmetadata', function () {
    timeTotalEl.textContent = fmt(audio.duration);
  });
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('ended', function () { step(1); });

  trackEl.addEventListener('click', seek);
  trackEl.addEventListener('mousedown', function (e) {
    isSeeking = true;
    seek(e);
    const onMove = function (ev) { seek(ev); };
    const onUp = function () {
      isSeeking = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  /* 键盘：空格播放/暂停，左右切歌 */
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowLeft')  { step(-1); }
    else if (e.key === 'ArrowRight') { step(1); }
  });

  /* ---------- 启动 ---------- */
  (async function init() {
    await loadPlaylist();

    if (!playlist.length) {
      subEl.textContent = '还没有音乐';
      titleEl.textContent = '还没有音乐';
      artistEl.textContent = '去写作后台的「音乐」页签传一首吧';
      playBtn.disabled = prevBtn.disabled = nextBtn.disabled = true;
      renderList();
      return;
    }

    subEl.textContent = '共 ' + playlist.length + ' 首';

    const params = new URLSearchParams(location.search);
    let i = parseInt(params.get('i'), 10);
    if (!(i >= 0 && i < playlist.length)) i = 0;

    const t = parseFloat(params.get('t')) || 0;

    await loadSong(i, false);

    /* 从首页点进来时接着刚才的进度放；自动播放被拦就算了 */
    if (t > 0 && isFinite(t)) {
      const resume = function () {
        try { audio.currentTime = t; } catch (e) { /* 忽略 */ }
        const pr = audio.play();
        if (pr && pr.catch) pr.catch(function () {});
      };
      if (audio.readyState >= 1) resume();
      else audio.addEventListener('loadedmetadata', resume, { once: true });
    }
  })();
})();
