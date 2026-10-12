/* =================================================== */
/* ========== 音乐播放器（支持 .lrc 自动解析） ========== */
/* =================================================== */

// 播放列表：加歌只填 src / lrc / title / artist / cover
const playlist = [
  {
    src:    SITE_ROOT + 'music/凡常恩典.mp3',
    lrc:    SITE_ROOT + 'music/凡常恩典-塞壬唱片-MSR&动点.lrc',
    title:  '凡常恩典',
    artist: '塞壬唱片-MSR&动点',
    cover:  SITE_ROOT + 'images/cover1.jpg',
    lyrics: [],   // 运行时从 LRC 自动填
  },
];

/* ===== 元素引用 ===== */
const audio       = document.getElementById('audio');
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

let currentIndex = 0;
let isSeeking = false;

/* ===== 时间格式化 ===== */
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

    if (txt) {
      lines.push({ time: min * 60 + sec + ms / 1000, text: txt });
    }
  });

  return lines.sort((a, b) => a.time - b.time);
}

/* ===== 加载歌曲 ===== */
async function loadSong(index) {
  const song = playlist[index];
  if (!song) return;

  audio.src = song.src;
  titleEl.textContent  = song.title;
  artistEl.textContent = song.artist;
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
      const text = await res.text();
      song.lyrics = parseLRC(text);
    } catch (e) {
      console.warn('[lrc] 歌词加载失败:', song.lrc, e);
      song.lyrics = [];
    }
  }

  // 显示第一句
  if (song.lyrics && song.lyrics.length) {
    lyricTextEl.textContent = song.lyrics[0].text;
  }
}

/* ===== 播放 / 暂停 ===== */
function togglePlay() {
  if (audio.paused) audio.play();
  else audio.pause();
}

/* ===== 上/下一首 ===== */
function prevSong() {
  currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
  loadSong(currentIndex).then(() => audio.play());
}
function nextSong() {
  currentIndex = (currentIndex + 1) % playlist.length;
  loadSong(currentIndex).then(() => audio.play());
}

/* ===== 进度 + 歌词更新 ===== */
function updateProgressBar() {
  if (!audio.duration) return;

  if (!isSeeking) {
    const pct = (audio.currentTime / audio.duration) * 100;
    progressBar.style.width = pct + '%';
  }

  timeNowEl.textContent = fmt(audio.currentTime);

  // 歌词
  const lyrics = playlist[currentIndex]?.lyrics;
  if (lyrics && lyrics.length) {
    let cur = lyrics[0].text;
    for (const line of lyrics) {
      if (audio.currentTime >= line.time) cur = line.text;
      else break;
    }
    if (lyricTextEl.textContent !== cur) {
      lyricTextEl.textContent = cur;
    }
  }
}

/* ===== 进度条点击 / 拖动 ===== */
function seek(e) {
  const rect = progressTrk.getBoundingClientRect();
  const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  if (audio.duration) {
    audio.currentTime = pct * audio.duration;
  }
}

/* ===== 事件绑定 ===== */
if (audio && playBtn) {

  playBtn.addEventListener('click', togglePlay);
  prevBtn?.addEventListener('click', prevSong);
  nextBtn?.addEventListener('click', nextSong);

  audio.addEventListener('play', () => {
    playBtn.querySelector('.material-symbols-rounded').textContent = 'pause';
    coverWrap?.classList.add('spinning');
  });
  audio.addEventListener('pause', () => {
    playBtn.querySelector('.material-symbols-rounded').textContent = 'play_arrow';
    coverWrap?.classList.remove('spinning');
  });

  audio.addEventListener('loadedmetadata', () => {
    timeTotalEl.textContent = fmt(audio.duration);
  });

  audio.addEventListener('timeupdate', updateProgressBar);
  audio.addEventListener('ended', nextSong);

  progressTrk.addEventListener('click', seek);
  progressTrk.addEventListener('mousedown', (e) => {
    isSeeking = true;
    seek(e);

    const onMove = (ev) => seek(ev);
    const onUp = () => {
      isSeeking = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // 初始化
  loadSong(0);
}