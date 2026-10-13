/* ===================================================
   首页音乐卡
   播放列表来自 data/music.json（写作后台里维护）
   点卡片空白处可以进播放列表页
   =================================================== */
(function () {
  'use strict';

  const audio = document.getElementById('audio');
  if (!audio) return;                    // 只有首页有这张卡

  const playBtn     = document.getElementById('playBtn');
  const prevBtn     = document.getElementById('prevBtn');
  const nextBtn     = document.getElementById('nextBtn');
  const progressBar = document.getElementById('musicProgress');
  const progressTrk = document.getElementById('progressTrack');
  const timeNowEl   = document.getElementById('timeNow');
  const timeTotalEl = document.getElementById('timeTotal');
  const titleEl     = document.getElementById('musicTitle');
  const artistEl    = document.getElementById('musicArtist');
  const coverImg    = document.getElementById('coverImg');
  const coverWrap   = document.getElementById('musicCover');
  const lyricTextEl = document.getElementById('lyricText');
  const card        = document.querySelector('.music-card');

  let playlist = [];
  let currentIndex = 0;
  let isSeeking = false;

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

  /* ===== LRC 解析 ===== */
  function parseLRC(text) {
    const lines = [];
    const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\](.*)/;

    text.split(/\r?\n/).forEach(line => {
      const match = line.match(re);
      if (!match) return;

      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms  = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
      const txt = match[4].trim();

      if (txt) lines.push({ time: min * 60 + sec + ms / 1000, text: txt });
    });

    return lines.sort((a, b) => a.time - b.time);
  }

  /* ===== 加载播放列表 ===== */
  async function loadPlaylist() {
    try {
      const res = await fetch(SITE_ROOT + 'data/music.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const list = await res.json();

      playlist = (Array.isArray(list) ? list : [])
        .filter(s => s && s.src)
        .map(s => Object.assign({}, s, {
          src:   assetUrl(s.src),
          lrc:   s.lrc ? assetUrl(s.lrc) : '',
          cover: s.cover ? assetUrl(s.cover) : '',
          lyrics: [],
        }));
    } catch (e) {
      console.warn('[music] 播放列表加载失败', e);
      playlist = [];
    }
  }

  /* ===== 加载歌曲 ===== */
  async function loadSong(index) {
    const song = playlist[index];
    if (!song) return;

    currentIndex = index;

    audio.src = song.src;
    titleEl.textContent  = song.title || '';
    artistEl.textContent = song.artist || '';
    if (song.cover) coverImg.src = song.cover;

    progressBar.style.width = '0%';
    timeNowEl.textContent   = '00:00';
    timeTotalEl.textContent = '00:00';
    lyricTextEl.textContent = '';

    // 首次加载时读 LRC
    if (song.lrc && (!song.lyrics || song.lyrics.length === 0)) {
      try {
        const res = await fetch(song.lrc);
        if (!res.ok) throw new Error('LRC 404');
        song.lyrics = parseLRC(await res.text());
      } catch (e) {
        console.warn('[lrc] 歌词加载失败:', song.lrc, e);
        song.lyrics = [];
      }
    }

    if (song.lyrics && song.lyrics.length) {
      lyricTextEl.textContent = song.lyrics[0].text;
    }
  }

  function togglePlay() {
    if (audio.paused) audio.play();
    else audio.pause();
  }

  function prevSong() {
    if (playlist.length < 2) { audio.currentTime = 0; return; }
    loadSong((currentIndex - 1 + playlist.length) % playlist.length).then(() => audio.play());
  }

  function nextSong() {
    if (playlist.length < 2) { audio.currentTime = 0; return; }
    loadSong((currentIndex + 1) % playlist.length).then(() => audio.play());
  }

  /* ===== 进度 + 歌词 ===== */
  function updateProgressBar() {
    if (!audio.duration) return;

    if (!isSeeking) {
      progressBar.style.width = (audio.currentTime / audio.duration) * 100 + '%';
    }
    timeNowEl.textContent = fmt(audio.currentTime);

    const lyrics = playlist[currentIndex] && playlist[currentIndex].lyrics;
    if (lyrics && lyrics.length) {
      let cur = lyrics[0].text;
      for (const line of lyrics) {
        if (audio.currentTime >= line.time) cur = line.text;
        else break;
      }
      if (lyricTextEl.textContent !== cur) lyricTextEl.textContent = cur;
    }
  }

  /* ===== 拖进度 ===== */
  function seek(e) {
    const rect = progressTrk.getBoundingClientRect();
    const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    if (audio.duration) audio.currentTime = pct * audio.duration;
  }

  /* ===== 事件 ===== */
  if (playBtn) {
    playBtn.addEventListener('click', togglePlay);
    prevBtn && prevBtn.addEventListener('click', prevSong);
    nextBtn && nextBtn.addEventListener('click', nextSong);

    audio.addEventListener('play', function () {
      playBtn.querySelector('.material-symbols-rounded').textContent = 'pause';
      coverWrap && coverWrap.classList.add('spinning');
    });
    audio.addEventListener('pause', function () {
      playBtn.querySelector('.material-symbols-rounded').textContent = 'play_arrow';
      coverWrap && coverWrap.classList.remove('spinning');
    });
    audio.addEventListener('loadedmetadata', function () {
      timeTotalEl.textContent = fmt(audio.duration);
    });
    audio.addEventListener('timeupdate', updateProgressBar);
    audio.addEventListener('ended', nextSong);

    progressTrk.addEventListener('click', seek);
    progressTrk.addEventListener('mousedown', function (e) {
      isSeeking = true;
      seek(e);

      const onMove = ev => seek(ev);
      const onUp = function () {
        isSeeking = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  /* ===== 点卡片进播放列表（点控件不跳） ===== */
  if (card) {
    card.style.cursor = 'pointer';

    function goPlaylist() {
      if (!playlist.length) return;
      const t = Math.floor(audio.currentTime || 0);
      location.href = SITE_ROOT + 'pages/music.html?i=' + currentIndex +
                      (t > 0 ? '&t=' + t : '');
    }

    card.addEventListener('click', function (e) {
      if (e.target.closest('button, .progress-track, .music-controls')) return;
      goPlaylist();
    });

    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        goPlaylist();
      }
    });
  }

  /* ===== 启动 ===== */
  (async function init() {
    await loadPlaylist();

    if (!playlist.length) {
      titleEl.textContent  = '还没有音乐';
      artistEl.textContent = '去写作后台里传一首吧';
      if (playBtn) playBtn.disabled = true;
      return;
    }

    await loadSong(0);
  })();
})();
