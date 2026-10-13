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

  fs.unlinkSync(target);
  const build = await run('node', ['build-data.js']);

  sendJson(res, 200, { ok: true, build: build.out + build.err });
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

/* 删除 images/ 或 music/ 里的文件，传 src=images/xxx.jpg 这样的相对路径 */
async function deleteFile(res, url) {
  const src = url.searchParams.get('src') || '';
  const target = dirForFile(src);
  if (!target) throw new Error('路径不合法');

  const full = underBase(target.dir, path.basename(src));
  if (!full || !fs.existsSync(full)) throw new Error('找不到这个文件');

  fs.unlinkSync(full);
  sendJson(res, 200, { ok: true });
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

/* ---------- 发布 ---------- */

async function gitStatus(res) {
  const st = await run('git', ['status', '--porcelain']);
  const br = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const ab = await run('git', ['status', '-sb']);

  const lines = st.out.split('\n').map(l => l.trim()).filter(Boolean);
  const ahead = /ahead (\d+)/.exec(ab.out);

  sendJson(res, 200, {
    ok: st.ok,
    branch: br.out.trim(),
    changes: lines,
    ahead: ahead ? Number(ahead[1]) : 0,
  });
}

async function publish(req, res) {
  const d = await readJson(req);
  const message = String(d.message || '').trim() || 'chore: 更新站点';

  const build = await run('node', ['build-data.js']);
  const add = await run('git', ['add', '-A']);

  const diff = await run('git', ['diff', '--cached', '--quiet']);
  if (diff.ok) {
    return sendJson(res, 200, {
      ok: false,
      step: 'commit',
      message: '没有需要提交的改动',
      output: build.out + build.err,
    });
  }

  const commit = await run('git', ['commit', '-m', message]);
  if (!commit.ok) {
    return sendJson(res, 500, {
      ok: false, step: 'commit',
      message: '提交失败', output: (commit.out + commit.err).trim(),
    });
  }

  const push = await run('git', ['push']);
  if (!push.ok) {
    return sendJson(res, 500, {
      ok: false, step: 'push',
      message: '推送失败（可能是凭据或远程有新提交）',
      output: (push.out + push.err).trim(),
    });
  }

  sendJson(res, 200, {
    ok: true,
    message: '已提交并推送',
    output: (build.out + commit.out + push.out + push.err).trim(),
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
      return sendJson(res, 200, { ok: r.ok, output: r.out + r.err });
    }
    if (p === '/api/status'  && method === 'GET')    return await gitStatus(res);
    if (p === '/api/publish' && method === 'POST')   return await publish(req, res);

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
