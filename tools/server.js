/* ===================================================
   本地写作后台（零依赖，只用 Node 内置模块）

   启动：  node tools/server.js
   然后：  http://127.0.0.1:4321

   只监听 127.0.0.1，局域网和公网都访问不到。
   它直接读写项目文件、调用 build-data.js、执行 git，所以别对外暴露。
   =================================================== */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT      = path.resolve(__dirname, '..');
const TOOLS     = __dirname;
const POSTS_DIR = path.join(ROOT, 'posts');
const IMAGES_DIR= path.join(ROOT, 'images');
const MUSIC_DIR = path.join(ROOT, 'music');
const DATA_DIR  = path.join(ROOT, 'data');
const GALLERY   = path.join(DATA_DIR, 'gallery.json');
const MUSIC     = path.join(DATA_DIR, 'music.json');
const FRIENDS   = path.join(DATA_DIR, 'friends.json');

const PORT = Number(process.env.PORT) || 4321;
const HOST = '127.0.0.1';

const IMG_EXT = /\.(jpe?g|png|gif|webp|avif|svg)$/i;
const AUD_EXT = /\.(mp3|m4a|ogg|wav|flac|aac|opus)$/i;
const LRC_EXT = /\.lrc$/i;

/* ---------- 小工具 ---------- */

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendFile(res, file, type) {
  fs.readFile(file, (err, buf) => {
    if (err) { sendJson(res, 404, { error: '找不到 ' + path.basename(file) }); return; }
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  return JSON.parse(buf.toString('utf8'));
}

/* 防止 ../ 逃出指定目录 */
function underBase(base, rel) {
  const full = path.resolve(base, rel);
  const b = path.resolve(base);
  if (full !== b && !full.startsWith(b + path.sep)) return null;
  return full;
}

/* 跑一条外部命令 */
function run(cmd, args, opts) {
  return new Promise(resolve => {
    execFile(cmd, args, Object.assign({ cwd: ROOT, maxBuffer: 10 * 1024 * 1024 }, opts || {}),
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          code: err && typeof err.code === 'number' ? err.code : (err ? 1 : 0),
          out: String(stdout || ''),
          err: String(stderr || (err && err.message) || ''),
        });
      });
  });
}

const today = () => new Date().toISOString().slice(0, 10);

/* 标题 → 网址别名（中文保留，其余转连字符） */
function slugify(s) {
  const out = String(s || '').trim().toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return out || 'post';
}

/* ---------- 文章 ---------- */

function parsePost(file) {
  const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return null;

  const fm = m[1];
  const body = m[2].replace(/\r\n/g, '\n').replace(/\s+$/, '');

  const pick = re => {
    const x = fm.match(re);
    return x ? x[1].trim().replace(/^["']|["']$/g, '') : '';
  };

  const tagsRaw = pick(/tags:\s*\[(.*?)\]/);
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  return {
    file,
    slug: file.replace(/\.md$/, ''),
    title: pick(/title:\s*(.+)/),
    date: pick(/date:\s*(\d{4}-\d{2}-\d{2})/),
    category: pick(/category:\s*(.+)/),
    summary: pick(/summary:\s*(.+)/),
    tags,
    draft: /draft:\s*true/.test(fm),
    body,
  };
}

function listPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs.readdirSync(POSTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(parsePost)
    .filter(Boolean)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

async function savePost(req, res) {
  const d = await readJson(req);

  const title = String(d.title || '').trim();
  if (!title) throw new Error('标题不能为空');

  const date = /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : today();
  const slug = slugify(d.slug || title);
  const file = date + '-' + slug + '.md';

  const target = underBase(POSTS_DIR, file);
  if (!target) throw new Error('生成的文件名不合法');

  const tags = (Array.isArray(d.tags) ? d.tags : String(d.tags || '').split(','))
    .map(t => String(t).trim()).filter(Boolean);

  const summary = String(d.summary || '').replace(/\s+/g, ' ').trim();

  const fm = [
    '---',
    'title: ' + title,
    'date: ' + date,
    'tags: [' + tags.join(', ') + ']',
    'category: ' + (String(d.category || '').trim() || '未分类'),
    summary ? 'summary: ' + summary : null,
    d.draft ? 'draft: true' : null,
    '---',
    '',
    String(d.body || '').replace(/\r\n/g, '\n').replace(/\s+$/, ''),
    '',
  ].filter(x => x !== null).join('\n');

  if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.writeFileSync(target, fm, 'utf8');

  /* 改过别名就顺手删掉旧文件，避免留下一份 */
  const oldFile = String(d.oldFile || '').trim();
  if (oldFile && oldFile !== file) {
    const oldPath = underBase(POSTS_DIR, oldFile);
    if (oldPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const build = await run('node', ['build-data.js']);

  sendJson(res, 200, {
    ok: true,
    file,
    slug: file.replace(/\.md$/, ''),
    build: build.out + build.err,
  });
}

async function deletePost(res, url) {
  const file = url.searchParams.get('file') || '';
  const target = underBase(POSTS_DIR, file);
  if (!target || !fs.existsSync(target)) throw new Error('找不到这篇文章');

  const moved = moveToTrash('posts/' + path.basename(file));
  const build = await run('node', ['build-data.js']);

  sendJson(res, 200, {
    ok: true,
    trashId: moved.id,
    message: '已移到回收站，可在「回收站」页签恢复',
    build: (build.out + build.err).trim(),
  });
}

/* ---------- 图片 ---------- */

function listImages() {
  if (!fs.existsSync(IMAGES_DIR)) return [];
  return fs.readdirSync(IMAGES_DIR)
    .filter(f => IMG_EXT.test(f))
    .map(f => {
      const st = fs.statSync(path.join(IMAGES_DIR, f));
      return { name: f, src: 'images/' + f, size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

/* 按扩展名决定落到哪个目录：图片 → images/，音频和歌词 → music/ */
function dirForFile(name) {
  if (IMG_EXT.test(name)) return { dir: IMAGES_DIR, prefix: 'images/' };
  if (AUD_EXT.test(name) || LRC_EXT.test(name)) return { dir: MUSIC_DIR, prefix: 'music/' };
  return null;
}

async function uploadFile(req, res, url) {
  const raw = url.searchParams.get('name') || 'file';
  const name = path.basename(raw).replace(/[^\w.\u4e00-\u9fa5-]/g, '_');

  const target = dirForFile(name);
  if (!target) {
    throw new Error('不支持这种格式。图片：jpg / png / gif / webp / avif / svg；' +
                    '音频：mp3 / m4a / ogg / wav / flac / aac / opus；歌词：lrc');
  }

  const buf = await readBody(req);
  if (!buf.length) throw new Error('文件是空的');

  if (!fs.existsSync(target.dir)) fs.mkdirSync(target.dir, { recursive: true });

  /* 重名就加序号，绝不覆盖已有文件 */
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  let final = name;
  let n = 1;
  while (fs.existsSync(path.join(target.dir, final))) {
    final = stem + '-' + n + ext;
    n++;
  }

  fs.writeFileSync(path.join(target.dir, final), buf);

  sendJson(res, 200, {
    ok: true,
    name: final,
    src: target.prefix + final,
    size: buf.length,
  });
}

/* 删除 images/ 或 music/ 里的文件，传 src=images/xxx.jpg 这样的相对路径。
   同样是挪进回收站，不是真删。 */
async function deleteFile(res, url) {
  const src = url.searchParams.get('src') || '';
  const target = dirForFile(src);
  if (!target) throw new Error('路径不合法');

  const base = path.basename(src);
  const full = underBase(target.dir, base);
  if (!full || !fs.existsSync(full)) throw new Error('找不到这个文件');

  const moved = moveToTrash(target.prefix + base);

  sendJson(res, 200, {
    ok: true,
    trashId: moved.id,
    message: '已移到回收站，可在「回收站」页签恢复',
  });
}

/* ---------- 相册 ---------- */

function getGallery() {
  if (!fs.existsSync(GALLERY)) return [];
  try {
    const d = JSON.parse(fs.readFileSync(GALLERY, 'utf8'));
    return Array.isArray(d) ? d : [];
  } catch (e) {
    return [];
  }
}

async function saveGallery(req, res) {
  const d = await readJson(req);
  if (!Array.isArray(d.items)) throw new Error('数据格式不对');

  const clean = d.items
    .filter(it => it && it.src)
    .map(it => ({
      src: String(it.src),
      title: String(it.title || '').trim(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : today(),
      desc: String(it.desc || '').trim(),
    }));

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(GALLERY, JSON.stringify(clean, null, 2) + '\n', 'utf8');

  const build = await run('node', ['build-data.js']);
  sendJson(res, 200, { ok: true, count: clean.length, build: build.out + build.err });
}

/* ---------- 音乐 / 友链 ---------- */
/* 这两个都是「整个数组覆盖写」，和相册一个套路 */

/* music/ 目录里现有的音频和歌词，后台用它做下拉选择 */
function listMusicFiles() {
  if (!fs.existsSync(MUSIC_DIR)) return { audio: [], lrc: [] };
  const files = fs.readdirSync(MUSIC_DIR);
  return {
    audio: files.filter(f => AUD_EXT.test(f)).map(f => 'music/' + f),
    lrc:   files.filter(f => LRC_EXT.test(f)).map(f => 'music/' + f),
  };
}

function readList(file) {
  if (!fs.existsSync(file)) return [];
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(d) ? d : [];
  } catch (e) {
    return [];
  }
}

function writeList(file, arr) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(arr, null, 2) + '\n', 'utf8');
}

async function saveMusic(req, res) {
  const d = await readJson(req);
  if (!Array.isArray(d.items)) throw new Error('数据格式不对');

  const clean = d.items
    .filter(it => it && it.src)
    .map(it => ({
      src:    String(it.src),
      title:  String(it.title || '').trim(),
      artist: String(it.artist || '').trim(),
      lrc:    String(it.lrc || '').trim(),
      cover:  String(it.cover || '').trim(),
    }));

  writeList(MUSIC, clean);
  sendJson(res, 200, { ok: true, count: clean.length });
}

async function saveFriends(req, res) {
  const d = await readJson(req);
  if (!Array.isArray(d.items)) throw new Error('数据格式不对');

  const clean = d.items
    .filter(it => it && it.name && it.url)
    .map(it => ({
      name:   String(it.name).trim(),
      url:    String(it.url).trim(),
      avatar: String(it.avatar || '').trim(),
      desc:   String(it.desc || '').trim(),
    }));

  writeList(FRIENDS, clean);
  sendJson(res, 200, { ok: true, count: clean.length });
}

/* ---------- 云端核对 ---------- */
/* fetch 只更新远程引用，不动工作区，所以它本身是安全的。
   但 fetch 会失败（网络问题）。这时必须如实说「没核对上」，
   绝不能拿上一次的缓存冒充「云端最新」——那会给出一个假的「已一致」。 */

const UPSTREAM_FALLBACK = 'origin/main';

async function upstreamRef() {
  const u = await run('git', ['rev-parse', '--abbrev-ref', '@{u}']);
  return u.ok && u.out.trim() ? u.out.trim() : UPSTREAM_FALLBACK;
}

async function dirtyList() {
  const st = await run('git', ['status', '--porcelain']);
  return st.out.split('\n').map(l => l.replace(/\s+$/, '')).filter(Boolean);
}

async function countRevs(range) {
  const r = await run('git', ['rev-list', '--count', range]);
  return r.ok ? Number(r.out.trim() || 0) : 0;
}

async function syncCheck(res) {
  const up = await upstreamRef();

  const fetchRes = await run('git', ['fetch', '--prune', 'origin'], { timeout: 25000 });
  const fetched = fetchRes.ok;

  const dirty  = await dirtyList();
  const ahead  = await countRevs(up + '..HEAD');
  const behind = await countRevs('HEAD..' + up);

  const head   = (await run('git', ['rev-parse', '--short', 'HEAD'])).out.trim();
  const remote = (await run('git', ['rev-parse', '--short', up])).out.trim();

  /* 能安全快进的条件：真的连上了、工作区干净、本地没有领先提交、云端确实有新东西 */
  const canFastForward = fetched && dirty.length === 0 && ahead === 0 && behind > 0;

  let fetchError = '';
  if (!fetched) {
    fetchError = (fetchRes.err || fetchRes.out).trim().split('\n').filter(Boolean)[0] || '未知网络错误';
  }

  sendJson(res, 200, {
    ok: true,
    fetched: fetched,
    fetchError: fetchError,
    branch: (await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim(),
    upstream: up,
    head: head,
    remote: remote,
    dirty: dirty.length,
    changes: dirty,
    ahead: ahead,
    behind: behind,
    canFastForward: canFastForward,
    /* 「已一致」只在真的核对过、且三项都为 0 时才算数 */
    inSync: fetched && ahead === 0 && behind === 0 && dirty.length === 0,
  });
}

/* 安全快进：只在本地没有任何会丢失的东西时用 */
async function syncPull(res) {
  const up = await upstreamRef();
  const dirty = await dirtyList();

  if (dirty.length) {
    return sendJson(res, 200, {
      ok: false,
      reason: 'dirty',
      message: '本地还有 ' + dirty.length + ' 处改动没提交。直接同步会把它们覆盖掉，' +
               '先去「发布」页提交，或点「放弃未提交的改动」。',
    });
  }

  const ahead = await countRevs(up + '..HEAD');
  if (ahead > 0) {
    return sendJson(res, 200, {
      ok: false,
      reason: 'ahead',
      message: '本地有 ' + ahead + ' 个提交还没推送。直接拉云端会让两边分叉，先去「发布」页推送。',
    });
  }

  const r = await run('git', ['merge', '--ff-only', up]);
  const head = (await run('git', ['rev-parse', '--short', 'HEAD'])).out.trim();
  const build = await run('node', ['build-data.js']);

  sendJson(res, 200, {
    ok: r.ok,
    head: head,
    message: r.ok
      ? '已同步到云端最新（' + head + '）'
      : '同步失败：' + ((r.err || r.out).trim().split('\n').filter(Boolean)[0] || '未知原因'),
    output: (r.out + r.err + build.out + build.err).trim(),
  });
}

/* 用云端覆盖本地。不可逆，所以先确认连得上、再打备份分支、再把未提交改动塞进 stash。
   顺序很重要：连不上就什么都别碰，否则 stash 会把工作区清空却拿不到云端数据。 */
async function syncForce(req, res) {
  const up = await upstreamRef();

  /* 第 0 步：先确认真的连得上。连不上就立刻退出，一个字节都不动 */
  const fetchRes = await run('git', ['fetch', 'origin'], { timeout: 25000 });
  if (!fetchRes.ok) {
    return sendJson(res, 200, {
      ok: false,
      reason: 'offline',
      message: '连不上 GitHub，没法拿云端数据覆盖。你的本地文件一点都没动。',
    });
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const bak = 'backup/' + stamp;

  /* 第 1 步：备份当前 HEAD */
  let backedUp = false;
  const hasHead = (await run('git', ['rev-parse', '--verify', 'HEAD'])).ok;
  if (hasHead) backedUp = (await run('git', ['branch', bak])).ok;

  /* 第 2 步：未提交的改动也存起来，好让 reset --hard 不把它们抹掉 */
  const dirty = await dirtyList();
  let stashed = false;
  if (dirty.length) {
    const s = await run('git', ['stash', 'push', '-u', '-m', '后台覆盖前的自动备份 ' + stamp]);
    stashed = s.ok;
  }

  /* 第 3 步：覆盖 */
  const r = await run('git', ['reset', '--hard', up]);
  const head = (await run('git', ['rev-parse', '--short', 'HEAD'])).out.trim();
  const build = await run('node', ['build-data.js']);

  sendJson(res, 200, {
    ok: r.ok,
    head: head,
    backupBranch: backedUp ? bak : '',
    stashed: stashed,
    message: r.ok
      ? '已用云端覆盖本地，现在停在 ' + head +
        (backedUp ? '。覆盖前的状态备份在分支 ' + bak + '，不需要了可以删掉' : '') +
        (stashed ? '；未提交的改动也一起存进 stash 了' : '')
      : '覆盖失败：' + ((r.err || r.out).trim().split('\n').filter(Boolean)[0] || '未知原因'),
    output: (r.out + r.err + build.out + build.err).trim(),
  });
}

/* 备份分支列表（覆盖前自动建的，能拿来救急） */
async function listBackups(res) {
  const r = await run('git', ['branch', '--list', 'backup/*', '--format=%(refname:short)|%(committerdate:format:%Y-%m-%d %H:%M)']);

  const items = r.out.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split('|');
    return { name: parts[0], date: parts[1] || '' };
  });

  sendJson(res, 200, { ok: true, items: items });
}

/* ---------- 回收站 ---------- */
/* 删文章 / 删图片不再真删，先挪进 tools/.trash/，随时能捞回来。
   .trash/ 在 .gitignore 里，不会进仓库。 */

const TRASH_DIR   = path.join(TOOLS, '.trash');
const TRASH_INDEX = path.join(TRASH_DIR, 'index.json');

function readTrash() {
  if (!fs.existsSync(TRASH_INDEX)) return [];
  try {
    const d = JSON.parse(fs.readFileSync(TRASH_INDEX, 'utf8'));
    return Array.isArray(d) ? d : [];
  } catch (e) {
    return [];
  }
}

function writeTrash(list) {
  if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });
  fs.writeFileSync(TRASH_INDEX, JSON.stringify(list, null, 2) + '\n', 'utf8');
}

/* 把文件挪进回收站。rel 形如 posts/xxx.md 或 images/xxx.jpg */
function moveToTrash(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) throw new Error('文件不存在：' + rel);

  if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });

  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const kept = id + path.extname(full);

  fs.renameSync(full, path.join(TRASH_DIR, kept));

  const list = readTrash();
  list.unshift({
    id:        id,
    file:      kept,
    orig:      rel,
    name:      path.basename(rel),
    size:      fs.statSync(path.join(TRASH_DIR, kept)).size,
    deletedAt: Date.now(),
  });
  writeTrash(list);

  return { id: id, orig: rel };
}

function listTrash() {
  return readTrash().map(function (it) {
    return Object.assign({}, it, {
      exists: fs.existsSync(path.join(TRASH_DIR, it.file)),
    });
  });
}

function restoreTrash(id) {
  const list = readTrash();
  const i = list.findIndex(x => x.id === id);
  if (i === -1) throw new Error('回收站里没有这一条');

  const it = list[i];
  const from = path.join(TRASH_DIR, it.file);
  const to   = path.join(ROOT, it.orig);

  if (!fs.existsSync(from)) throw new Error('回收站里的文件已经不见了');
  if (fs.existsSync(to))    throw new Error('原位置已经有同名文件，先处理掉它再恢复');

  const dir = path.dirname(to);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.renameSync(from, to);
  list.splice(i, 1);
  writeTrash(list);

  return it;
}

function purgeTrash(id) {
  const list = readTrash();

  /* 不带 id 就是清空 */
  if (!id) {
    const n = list.length;
    list.forEach(function (it) {
      const f = path.join(TRASH_DIR, it.file);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
    writeTrash([]);
    return { cleared: n };
  }

  const i = list.findIndex(x => x.id === id);
  if (i === -1) throw new Error('回收站里没有这一条');

  const f = path.join(TRASH_DIR, list[i].file);
  if (fs.existsSync(f)) fs.unlinkSync(f);
  list.splice(i, 1);
  writeTrash(list);

  return { removed: 1 };
}

/* ---------- 发布 ---------- */
/* 刻意把「提交」和「推送」拆开：
   提交只写本地 git 历史，不依赖网络；推送才需要联网。
   这样断网时改动也不会无处安放。 */

async function gitStatus(res) {
  const st = await run('git', ['status', '--porcelain']);
  const br = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const ab = await run('git', ['status', '-sb']);
  const head = await run('git', ['rev-parse', '--short', 'HEAD']);
  const up = await run('git', ['rev-parse', '--short', '@{u}']);

  /* 注意：不能 trim()。git status --porcelain 的格式是 "XY 路径"，
     前导空格是有意义的，trim 掉会让前端按位置切片时错位、吃掉路径首字符 */
  const lines = st.out.split('\n').map(l => l.replace(/\s+$/, '')).filter(Boolean);
  const ahead = /ahead (\d+)/.exec(ab.out);
  const behind = /behind (\d+)/.exec(ab.out);

  sendJson(res, 200, {
    ok: st.ok,
    branch: br.out.trim(),
    head: head.out.trim(),
    upstream: up.ok ? up.out.trim() : '',
    changes: lines,
    ahead: ahead ? Number(ahead[1]) : 0,
    behind: behind ? Number(behind[1]) : 0,
    trash: readTrash().length,
  });
}

/* 只提交，不推送 */
async function commitOnly(req, res) {
  const d = await readJson(req);
  const message = String(d.message || '').trim() || 'chore: 更新站点';

  const build = await run('node', ['build-data.js']);
  await run('git', ['add', '-A']);

  const diff = await run('git', ['diff', '--cached', '--quiet']);
  if (diff.ok) {
    return sendJson(res, 200, {
      ok: false, step: 'commit',
      message: '没有需要提交的改动',
      output: (build.out + build.err).trim(),
    });
  }

  const commit = await run('git', ['commit', '-m', message]);
  if (!commit.ok) {
    return sendJson(res, 500, {
      ok: false, step: 'commit',
      message: '提交失败（改动还在工作区，没有丢）',
      output: (build.out + commit.out + commit.err).trim(),
    });
  }

  const hash = await run('git', ['rev-parse', '--short', 'HEAD']);

  sendJson(res, 200, {
    ok: true,
    hash: hash.out.trim(),
    message: '已提交到本地（' + hash.out.trim() + '），还没推送',
    output: (build.out + commit.out + commit.err).trim(),
  });
}

/* 只推送，不提交 */
async function pushOnly(res) {
  const push = await run('git', ['push']);
  const tail = (push.out + push.err).trim();

  if (!push.ok) {
    const net = /Could not connect|unable to access|Failed to connect|timed out|Empty reply|Connection refused/i.test(tail);

    return sendJson(res, 500, {
      ok: false, step: 'push',
      message: net
        ? '推送失败：连不上 GitHub。你的改动已经提交到本地了，没丢；网络恢复后点「重试推送」就行。'
        : '推送失败：你的改动已经提交到本地了，没丢。下面是 git 的原始输出。',
      output: tail,
    });
  }

  sendJson(res, 200, {
    ok: true,
    message: '已推送到 GitHub',
    output: tail,
  });
}

/* 提交 + 推送，一键入口 */
async function publish(req, res) {
  const d = await readJson(req);
  const message = String(d.message || '').trim() || 'chore: 更新站点';

  const build = await run('node', ['build-data.js']);
  await run('git', ['add', '-A']);

  const diff = await run('git', ['diff', '--cached', '--quiet']);
  let commitOut = '';
  let hash = '';

  if (diff.ok) {
    /* 没有新改动可提交，那就只把已有的本地提交推上去 */
    const ahead = await run('git', ['rev-list', '--count', '@{u}..HEAD']);
    if (!ahead.ok || Number(ahead.out.trim()) === 0) {
      return sendJson(res, 200, {
        ok: false, step: 'commit',
        message: '没有需要提交的改动，本地也和云端一致',
        output: (build.out + build.err).trim(),
      });
    }
  } else {
    const commit = await run('git', ['commit', '-m', message]);
    if (!commit.ok) {
      return sendJson(res, 500, {
        ok: false, step: 'commit',
        message: '提交失败（改动还在工作区，没有丢）',
        output: (build.out + commit.out + commit.err).trim(),
      });
    }
    commitOut = commit.out;
    const h = await run('git', ['rev-parse', '--short', 'HEAD']);
    hash = h.out.trim();
  }

  const push = await run('git', ['push']);
  const tail = (push.out + push.err).trim();

  if (!push.ok) {
    const net = /Could not connect|unable to access|Failed to connect|timed out|Empty reply|Connection refused/i.test(tail);

    return sendJson(res, 500, {
      ok: false, step: 'push',
      hash: hash,
      message: '已提交到本地（' + hash + '），但' +
               (net ? '连不上 GitHub 推不出去。' : '推送被拒绝。') +
               '改动没丢，网络恢复后到「发布」页点「重试推送」即可。',
      output: (build.out + commitOut + tail).trim(),
    });
  }

  sendJson(res, 200, {
    ok: true,
    hash: hash,
    message: '已提交并推送到 GitHub',
    output: (build.out + commitOut + tail).trim(),
  });
}

/* 放弃本地未提交的改动（危险，前端会二次确认） */
async function discardChanges(res) {
  const st = await run('git', ['checkout', '--', '.']);

  sendJson(res, 200, {
    ok: st.ok,
    message: st.ok
      ? '已把「已跟踪文件」恢复到上次提交的样子（新上传但还没提交的文件不会被动）'
      : '恢复失败',
    output: (st.out + st.err).trim(),
  });
}

/* ---------- 路由 ---------- */

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.flac': 'audio/flac', '.aac': 'audio/aac',
  '.opus': 'audio/opus', '.lrc': 'text/plain',
};

async function handle(req, res) {
  const url = new URL(req.url, 'http://' + HOST);
  const p = url.pathname;
  const method = req.method;

  try {
    /* --- 后台自己的静态文件 --- */
    if (p === '/' || p === '/admin.html') return sendFile(res, path.join(TOOLS, 'admin.html'), 'text/html');
    if (p === '/admin.css') return sendFile(res, path.join(TOOLS, 'admin.css'), 'text/css');
    if (p === '/admin.js')  return sendFile(res, path.join(TOOLS, 'admin.js'), 'text/javascript');
    /* 复用站点自己的 Markdown 渲染器，保证预览和线上一致 */
    if (p === '/markdown.js') return sendFile(res, path.join(ROOT, 'js', 'markdown.js'), 'text/javascript');

    /* --- 站内文件（后台预览 / 试听用） ---
       pathname 是编码过的，中文文件名必须先 decode 回来，否则永远找不到 */
    if (p.startsWith('/images/') || p.startsWith('/music/')) {
      const isImg = p.startsWith('/images/');
      const base  = isImg ? IMAGES_DIR : MUSIC_DIR;
      const rel   = decodeURIComponent(p.slice(isImg ? '/images/'.length : '/music/'.length));

      const f = underBase(base, rel);
      if (!f) { sendJson(res, 400, { error: '路径不合法' }); return; }
      return sendFile(res, f, MIME[path.extname(f).toLowerCase()] || 'application/octet-stream');
    }

    /* --- API ---
       下面这些 handler 都是 async，必须 await。
       写成 `return savePost(...)` 的话，函数内部抛的错不在 try 块里，
       会变成未处理的 Promise rejection，Node 会直接把整个服务终止掉。 */
    if (p === '/api/posts'   && method === 'GET')    return sendJson(res, 200, { ok: true, posts: listPosts() });
    if (p === '/api/post'    && method === 'POST')   return await savePost(req, res);
    if (p === '/api/post'    && method === 'DELETE') return await deletePost(res, url);

    if (p === '/api/images'  && method === 'GET')    return sendJson(res, 200, { ok: true, images: listImages() });
    if (p === '/api/upload'  && method === 'POST')   return await uploadFile(req, res, url);
    if (p === '/api/file'    && method === 'DELETE') return await deleteFile(res, url);

    if (p === '/api/gallery' && method === 'GET')    return sendJson(res, 200, { ok: true, items: getGallery() });
    if (p === '/api/gallery' && method === 'POST')   return await saveGallery(req, res);

    if (p === '/api/music'   && method === 'GET')    return sendJson(res, 200, {
      ok: true, items: readList(MUSIC), files: listMusicFiles(),
    });
    if (p === '/api/music'   && method === 'POST')   return await saveMusic(req, res);

    if (p === '/api/friends' && method === 'GET')    return sendJson(res, 200, { ok: true, items: readList(FRIENDS) });
    if (p === '/api/friends' && method === 'POST')   return await saveFriends(req, res);

    if (p === '/api/build'   && method === 'POST') {
      const r = await run('node', ['build-data.js']);
      return sendJson(res, 200, { ok: r.ok, output: (r.out + r.err).trim() });
    }
    if (p === '/api/status'  && method === 'GET')    return await gitStatus(res);

    /* --- 云端核对与同步 --- */
    if (p === '/api/sync'        && method === 'GET')  return await syncCheck(res);
    if (p === '/api/sync/pull'   && method === 'POST') return await syncPull(res);
    if (p === '/api/sync/force'  && method === 'POST') return await syncForce(req, res);
    if (p === '/api/sync/backups'&& method === 'GET')  return await listBackups(res);

    /* --- 发布：提交和推送分开，断网时改动也能先落到本地 --- */
    if (p === '/api/commit'  && method === 'POST')   return await commitOnly(req, res);
    if (p === '/api/push'    && method === 'POST')   return await pushOnly(res);
    if (p === '/api/publish' && method === 'POST')   return await publish(req, res);
    if (p === '/api/discard' && method === 'POST')   return await discardChanges(res);

    /* --- 回收站 --- */
    if (p === '/api/trash' && method === 'GET') {
      return sendJson(res, 200, { ok: true, items: listTrash() });
    }
    if (p === '/api/trash/restore' && method === 'POST') {
      const d = await readJson(req);
      const it = restoreTrash(String(d.id || ''));
      const build = await run('node', ['build-data.js']);
      return sendJson(res, 200, {
        ok: true,
        restored: it.orig,
        message: '已恢复到 ' + it.orig,
        build: (build.out + build.err).trim(),
      });
    }
    if (p === '/api/trash' && method === 'DELETE') {
      return sendJson(res, 200, {
        ok: true,
        result: purgeTrash(url.searchParams.get('id') || ''),
      });
    }

    sendJson(res, 404, { error: '没有这个接口：' + p });
  } catch (e) {
    sendJson(res, 400, { error: String((e && e.message) || e) });
  }
}

/* 兜底：万一还有没接住的异常，也只回一个 500，不让服务挂掉 */
const server = http.createServer((req, res) => {
  handle(req, res).catch(err => {
    try {
      if (!res.headersSent) sendJson(res, 500, { error: String((err && err.message) || err) });
      else res.end();
    } catch (e) { /* 响应已经发出去了，没法再改，忽略 */ }
  });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ✍️  写作后台已启动');
  console.log('');
  console.log('     打开：  http://' + HOST + ':' + PORT);
  console.log('     项目：  ' + ROOT);
  console.log('');
  console.log('     按 Ctrl+C 停止');
  console.log('');
});
