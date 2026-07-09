
// ghfile-proxy - GitHub File Proxy for Cloudflare Workers
// Supports: raw, releases, tree, codeload, git HTTPS proxy

const ALLOWED_DOMAINS = [
  'github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'codeload.github.com',
  'releases.githubusercontent.com',
  'user-images.githubusercontent.com',
  'avatars.githubusercontent.com',
  'api.github.com',
];

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const origin = url.origin;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Home page
  if (pathname === '/' || pathname === '') {
    return new Response(getHomePage(origin), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // API routes for frontend
  if (pathname.startsWith('/api/')) {
    return handleAPI(request, url, env);
  }

  // Git smart HTTP detection: /{owner}/{repo}.git/...
  if (isGitRequest(pathname, url)) {
    return proxyGitHub(request, `https://github.com${pathname}${url.search}`);
  }

  // Full URL proxy: /https://github.com/... or /https://raw.githubusercontent.com/...
  const fullMatch = pathname.match(/^\/(https?:\/\/.+)/);
  if (fullMatch) {
    const targetUrl = fullMatch[1] + (url.search || '');
    return proxyGitHub(request, targetUrl);
  }

  // Short path proxy (github.com only): /{owner}/{repo}/...
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 2) {
    const targetUrl = `https://github.com${pathname}${url.search || ''}`;
    return proxyGitHub(request, targetUrl);
  }

  return new Response('Not Found', { status: 404 });
}

function isGitRequest(pathname, url) {
  const service = url.searchParams.get('service');
  return (
    pathname.includes('.git/info/refs') ||
    pathname.includes('.git/git-upload-pack') ||
    pathname.includes('.git/git-receive-pack') ||
    service === 'git-upload-pack' ||
    service === 'git-receive-pack'
  );
}

async function proxyGitHub(request, targetUrl) {
  let parsed;
  try { parsed = new URL(targetUrl); } catch (e) {
    return new Response('Invalid URL', { status: 400 });
  }

  const hostname = parsed.hostname;
  const allowed = ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  if (!allowed) {
    return new Response(`Forbidden: ${hostname}`, { status: 403 });
  }

  try {
    const reqHeaders = new Headers();
    ['Accept', 'Accept-Language', 'Range', 'If-None-Match', 'If-Modified-Since',
     'Authorization', 'Content-Type'].forEach(h => {
      if (request.headers.has(h)) reqHeaders.set(h, request.headers.get(h));
    });
    reqHeaders.set('User-Agent', request.headers.get('User-Agent') || 'Mozilla/5.0 GHFileProxy/1.0');

    const resp = await fetch(targetUrl, {
      method: request.method,
      headers: reqHeaders,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'follow',
    });

    const respHeaders = new Headers(resp.headers);
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.delete('content-security-policy');
    respHeaders.delete('content-security-policy-report-only');

    return new Response(resp.body, { status: resp.status, headers: respHeaders });
  } catch (e) {
    return new Response(`Proxy Error: ${e.message}`, { status: 502 });
  }
}

async function handleAPI(request, url, env) {
  const pathname = url.pathname;
  const token = env.GITHUB_TOKEN || '';
  const apiHeaders = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'GHFileProxy/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };

  // Search: GET /api/search?q=...&type=repositories
  if (pathname === '/api/search') {
    const q = url.searchParams.get('q') || '';
    const type = url.searchParams.get('type') || 'repositories';
    const page = url.searchParams.get('page') || '1';
    const per_page = url.searchParams.get('per_page') || '10';
    if (!q) return jsonResp({ error: 'q is required' }, 400);
    const apiUrl = `https://api.github.com/search/${encodeURIComponent(type)}?q=${encodeURIComponent(q)}&page=${page}&per_page=${per_page}`;
    const resp = await fetch(apiUrl, { headers: apiHeaders });
    return jsonResp(await resp.json(), resp.status);
  }

  // Releases list: GET /api/repos/{owner}/{repo}/releases
  const relMatch = pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/releases$/);
  if (relMatch) {
    const [, owner, repo] = relMatch;
    const page = url.searchParams.get('page') || '1';
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?page=${page}&per_page=20`, { headers: apiHeaders });
    return jsonResp(await resp.json(), resp.status);
  }

  // Latest release: GET /api/repos/{owner}/{repo}/releases/latest
  const latestMatch = pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/releases\/latest$/);
  if (latestMatch) {
    const [, owner, repo] = latestMatch;
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers: apiHeaders });
    return jsonResp(await resp.json(), resp.status);
  }

  // Release by tag: GET /api/repos/{owner}/{repo}/releases/tags/{tag}
  const tagRelMatch = pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/releases\/tags\/(.+)$/);
  if (tagRelMatch) {
    const [, owner, repo, tag] = tagRelMatch;
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, { headers: apiHeaders });
    return jsonResp(await resp.json(), resp.status);
  }

  // Tags list: GET /api/repos/{owner}/{repo}/tags
  const tagsMatch = pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/tags$/);
  if (tagsMatch) {
    const [, owner, repo] = tagsMatch;
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/tags?per_page=30`, { headers: apiHeaders });
    return jsonResp(await resp.json(), resp.status);
  }

  // Packages (org): GET /api/orgs/{org}/packages?package_type=container
  const pkgOrgMatch = pathname.match(/^\/api\/orgs\/([^/]+)\/packages$/);
  if (pkgOrgMatch) {
    const [, org] = pkgOrgMatch;
    const pkgType = url.searchParams.get('package_type') || 'container';
    const resp = await fetch(`https://api.github.com/orgs/${org}/packages?package_type=${pkgType}&per_page=30`, { headers: apiHeaders });
    return jsonResp(await resp.json(), resp.status);
  }

  // Packages (user): GET /api/users/{user}/packages?package_type=container
  const pkgUserMatch = pathname.match(/^\/api\/users\/([^/]+)\/packages$/);
  if (pkgUserMatch) {
    const [, user] = pkgUserMatch;
    const pkgType = url.searchParams.get('package_type') || 'container';
    const resp = await fetch(`https://api.github.com/users/${user}/packages?package_type=${pkgType}&per_page=30`, { headers: apiHeaders });
    return jsonResp(await resp.json(), resp.status);
  }

  // Repo info: GET /api/repos/{owner}/{repo}
  const repoMatch = pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)$/);
  if (repoMatch) {
    const [, owner, repo] = repoMatch;
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: apiHeaders });
    return jsonResp(await resp.json(), resp.status);
  }

  return jsonResp({ error: 'API route not found' }, 404);
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function getHomePage(origin) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GitHub 文件代理</title>
<style>
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --red: #f85149; --yellow: #d29922;
    --radius: 8px; --font: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); min-height: 100vh; }
  header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 14px 24px; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 18px; font-weight: 600; }
  header .badge { background: #1f6feb; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 20px; }
  .container { max-width: 900px; margin: 32px auto; padding: 0 16px; }
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
  .tab { padding: 10px 18px; cursor: pointer; border-radius: var(--radius) var(--radius) 0 0; color: var(--muted); font-size: 14px; border: 1px solid transparent; border-bottom: none; margin-bottom: -1px; }
  .tab.active { background: var(--surface); border-color: var(--border); color: var(--text); }
  .tab:hover:not(.active) { color: var(--text); }
  .panel { display: none; } .panel.active { display: block; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 16px; }
  .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 14px; color: var(--accent); }
  label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
  input, select { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 9px 12px; font-size: 14px; outline: none; }
  input:focus, select:focus { border-color: var(--accent); }
  .row { display: flex; gap: 10px; }
  .row input { flex: 1; }
  button { background: var(--accent); color: #0d1117; border: none; border-radius: 6px; padding: 9px 18px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  button:hover { opacity: 0.85; }
  button.secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); font-weight: 400; }
  button.secondary:hover { border-color: var(--accent); color: var(--accent); }
  .result-box { margin-top: 14px; }
  .url-item { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
  .url-item .label { font-size: 11px; color: var(--muted); white-space: nowrap; }
  .url-item .url { flex: 1; font-size: 13px; color: var(--accent); font-family: monospace; word-break: break-all; }
  .copy-btn { background: var(--surface); border: 1px solid var(--border); color: var(--muted); border-radius: 4px; padding: 4px 10px; font-size: 12px; cursor: pointer; white-space: nowrap; }
  .copy-btn:hover { border-color: var(--accent); color: var(--accent); }
  .copy-btn.copied { border-color: var(--green); color: var(--green); }
  .hint { font-size: 12px; color: var(--muted); margin-top: 8px; }
  .search-results { margin-top: 14px; }
  .repo-card { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 14px; margin-bottom: 10px; cursor: pointer; transition: border-color .2s; }
  .repo-card:hover { border-color: var(--accent); }
  .repo-card .name { font-size: 15px; font-weight: 600; color: var(--accent); }
  .repo-card .desc { font-size: 13px; color: var(--muted); margin-top: 4px; }
  .repo-card .meta { font-size: 12px; color: var(--muted); margin-top: 8px; display: flex; gap: 16px; }
  .release-item { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 14px; margin-bottom: 10px; }
  .release-item .tag { display: inline-block; background: #1f6feb22; color: var(--accent); border: 1px solid var(--accent); border-radius: 20px; font-size: 12px; padding: 2px 10px; margin-bottom: 8px; }
  .release-item .asset { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  .release-item .asset:last-child { border-bottom: none; }
  .asset-name { flex: 1; color: var(--text); }
  .asset-size { color: var(--muted); font-size: 12px; white-space: nowrap; }
  .pkg-card { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; }
  .pkg-card .pkg-name { flex: 1; font-size: 14px; color: var(--text); }
  .pkg-card .pkg-type { font-size: 11px; color: var(--muted); background: var(--surface); padding: 2px 8px; border-radius: 10px; border: 1px solid var(--border); }
  .loading { color: var(--muted); font-size: 14px; padding: 20px 0; text-align: center; }
  .error { color: var(--red); font-size: 13px; padding: 10px 0; }
  .git-box { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; font-size: 13px; font-family: monospace; color: var(--accent); display: flex; align-items: center; gap: 10px; margin-top: 8px; }
  .git-box span { flex: 1; word-break: break-all; }
  .section-title { font-size: 13px; color: var(--muted); margin: 14px 0 8px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
  #pagination { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
  #pagination button { padding: 6px 14px; font-size: 13px; font-weight: 400; }
  #page-info { font-size: 13px; color: var(--muted); }
</style>
</head>
<body>
<header>
  <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--accent)"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.03-2.682-.103-.253-.447-1.27.098-2.646 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.547 1.376.202 2.394.1 2.646.64.698 1.028 1.59 1.028 2.682 0 3.841-2.337 4.687-4.565 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
  <h1>GitHub 文件代理</h1>
  <span class="badge">Worker</span>
</header>
<div class="container">
  <div class="tabs">
    <div class="tab active" onclick="switchTab('convert')">🔗 URL 转换</div>
    <div class="tab" onclick="switchTab('search')">🔍 搜索仓库</div>
    <div class="tab" onclick="switchTab('browse')">📦 浏览仓库</div>
  </div>

  <!-- Tab: URL转换 -->
  <div id="tab-convert" class="panel active">
    <div class="card">
      <h2>生成代理链接</h2>
      <label>输入 GitHub 文件 URL（支持 raw、release、tree、zip 下载等）</label>
      <div class="row">
        <input id="url-input" type="text" placeholder="https://github.com/owner/repo/releases/download/v1.0/file.zip" oninput="generateProxyUrl()">
        <button onclick="generateProxyUrl()">生成</button>
      </div>
      <div id="url-results" class="result-box"></div>
      <p class="hint">支持 github.com / raw.githubusercontent.com / codeload.github.com / objects.githubusercontent.com 等域名</p>
    </div>
    <div class="card">
      <h2>Git 克隆代理</h2>
      <label>输入仓库（格式：owner/repo 或完整 GitHub URL）</label>
      <div class="row">
        <input id="git-input" type="text" placeholder="owner/repo 或 https://github.com/owner/repo.git">
        <button onclick="generateGitUrl()">生成</button>
      </div>
      <div id="git-results" class="result-box"></div>
    </div>
  </div>

  <!-- Tab: 搜索仓库 -->
  <div id="tab-search" class="panel">
    <div class="card">
      <h2>搜索 GitHub 仓库</h2>
      <div class="row">
        <input id="search-input" type="text" placeholder="输入关键词搜索，如 proxy worker cloudflare" onkeydown="if(event.key==='Enter')doSearch()">
        <button onclick="doSearch()">搜索</button>
      </div>
      <div id="search-results" class="search-results"></div>
      <div id="pagination"></div>
    </div>
  </div>

  <!-- Tab: 浏览仓库 -->
  <div id="tab-browse" class="panel">
    <div class="card">
      <h2>浏览仓库 Releases / Tags / Packages</h2>
      <div class="row">
        <input id="browse-input" type="text" placeholder="owner/repo，如 OpenIDCSTeam/HostAgent">
        <button onclick="browseRepo()">浏览</button>
      </div>
      <div id="browse-results"></div>
    </div>
  </div>
</div>

<script>
const ORIGIN = '${origin}';
let searchPage = 1;
let lastQuery = '';

// ===================== Tab =====================
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

// ===================== URL 转换 =====================
function generateProxyUrl() {
  const raw = document.getElementById('url-input').value.trim();
  const box = document.getElementById('url-results');
  if (!raw) { box.innerHTML = ''; return; }

  let targetUrl = raw;
  if (!targetUrl.startsWith('http')) {
    box.innerHTML = '<p class="error">请输入完整的 https:// 开头的 URL</p>';
    return;
  }

  let parsed;
  try { parsed = new URL(targetUrl); } catch(e) {
    box.innerHTML = '<p class="error">URL 格式无效</p>'; return;
  }

  const isGitHub = parsed.hostname === 'github.com';
  const items = [];

  // 格式1：完整 URL 拼接
  const fmt1 = ORIGIN + '/' + targetUrl;
  items.push({ label: '完整代理 URL（通用）', url: fmt1 });

  // 格式2：仅 github.com 支持短路径
  if (isGitHub) {
    const fmt2 = ORIGIN + parsed.pathname + (parsed.search || '');
    items.push({ label: '短路径 URL（仅 github.com）', url: fmt2 });
  }

  box.innerHTML = items.map(item => \`
    <div class="url-item">
      <span class="label">\${item.label}</span>
      <span class="url">\${item.url}</span>
      <button class="copy-btn" onclick="copyText(this, '\${escUrl(item.url)}')">复制</button>
    </div>
  \`).join('');
}

function generateGitUrl() {
  const raw = document.getElementById('git-input').value.trim();
  const box = document.getElementById('git-results');
  if (!raw) { box.innerHTML = ''; return; }
  let owner, repo;
  if (raw.startsWith('http')) {
    try {
      const u = new URL(raw);
      const parts = u.pathname.replace(/\\.git$/, '').split('/').filter(Boolean);
      if (parts.length >= 2) { owner = parts[0]; repo = parts[1]; }
    } catch(e) {}
  } else {
    const parts = raw.replace(/\\.git$/, '').split('/');
    if (parts.length === 2) { owner = parts[0]; repo = parts[1]; }
  }
  if (!owner || !repo) {
    box.innerHTML = '<p class="error">格式应为 owner/repo</p>'; return;
  }
  const gitUrl = ORIGIN + '/' + owner + '/' + repo + '.git';
  const zipUrl = ORIGIN + '/https://codeload.github.com/' + owner + '/' + repo + '/zip/refs/heads/main';
  box.innerHTML = \`
    <div class="section-title">Git 克隆命令</div>
    <div class="git-box"><span>git clone \${gitUrl}</span><button class="copy-btn" onclick="copyText(this,'git clone \${escUrl(gitUrl)}')">复制</button></div>
    <div class="section-title" style="margin-top:12px">下载源码 ZIP（main 分支）</div>
    <div class="url-item"><span class="url">\${zipUrl}</span><button class="copy-btn" onclick="copyText(this,'\${escUrl(zipUrl)}')">复制</button></div>
  \`;
}

// ===================== 搜索 =====================
async function doSearch(page) {
  searchPage = page || 1;
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  lastQuery = q;
  const box = document.getElementById('search-results');
  box.innerHTML = '<div class="loading">搜索中...</div>';
  try {
    const resp = await fetch(ORIGIN + '/api/search?q=' + encodeURIComponent(q) + '&page=' + searchPage + '&per_page=10');
    const data = await resp.json();
    if (data.error || !data.items) { box.innerHTML = '<p class="error">' + (data.message || '搜索失败，可能触发速率限制') + '</p>'; renderPagination(false,false); return; }
    if (!data.items.length) { box.innerHTML = '<p class="loading">未找到相关仓库</p>'; renderPagination(false,false); return; }
    box.innerHTML = data.items.map(r => \`
      <div class="repo-card" onclick="goBrowse('\${r.full_name}')">
        <div class="name">\${r.full_name}</div>
        \${r.description ? '<div class="desc">' + esc(r.description) + '</div>' : ''}
        <div class="meta">
          <span>⭐ \${fmtNum(r.stargazers_count)}</span>
          <span>🍴 \${fmtNum(r.forks_count)}</span>
          \${r.language ? '<span>📝 ' + r.language + '</span>' : ''}
          <span>📅 \${r.updated_at.slice(0,10)}</span>
        </div>
      </div>
    \`).join('');
    renderPagination(searchPage > 1, data.total_count > searchPage * 10);
  } catch(e) { box.innerHTML = '<p class="error">请求失败: ' + e.message + '</p>'; }
}

function renderPagination(hasPrev, hasNext) {
  const box = document.getElementById('pagination');
  if (!hasPrev && !hasNext) { box.innerHTML = ''; return; }
  box.innerHTML = \`
    \${hasPrev ? '<button class="secondary" onclick="doSearch(' + (searchPage-1) + ')">← 上一页</button>' : ''}
    <span id="page-info">第 \${searchPage} 页</span>
    \${hasNext ? '<button class="secondary" onclick="doSearch(' + (searchPage+1) + ')">下一页 →</button>' : ''}
  \`;
}

function goBrowse(fullName) {
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', i===2));
  document.querySelectorAll('.panel').forEach((p,i) => p.classList.toggle('active', i===2));
  document.getElementById('browse-input').value = fullName;
  browseRepo();
}

// ===================== 浏览仓库 =====================
async function browseRepo() {
  const raw = document.getElementById('browse-input').value.trim().replace(/^https?:\\/\\/github\\.com\\//, '').replace(/\\.git$/, '');
  const box = document.getElementById('browse-results');
  if (!raw || !raw.includes('/')) { box.innerHTML = '<p class="error">格式应为 owner/repo</p>'; return; }
  const [owner, repo] = raw.split('/');
  box.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const [relResp, tagsResp, infoResp] = await Promise.all([
      fetch(ORIGIN + '/api/repos/' + owner + '/' + repo + '/releases'),
      fetch(ORIGIN + '/api/repos/' + owner + '/' + repo + '/tags'),
      fetch(ORIGIN + '/api/repos/' + owner + '/' + repo),
    ]);
    const [rels, tags, info] = await Promise.all([relResp.json(), tagsResp.json(), infoResp.json()]);

    let html = '';

    // Repo info
    if (!info.message) {
      html += \`<div class="card" style="margin-top:0">
        <h2>📁 \${info.full_name}</h2>
        \${info.description ? '<p style="font-size:13px;color:var(--muted);margin-bottom:10px">' + esc(info.description) + '</p>' : ''}
        <div style="display:flex;gap:16px;font-size:13px;color:var(--muted);margin-bottom:10px">
          <span>⭐ \${fmtNum(info.stargazers_count)}</span>
          <span>🍴 \${fmtNum(info.forks_count)}</span>
          \${info.language ? '<span>📝 ' + info.language + '</span>' : ''}
        </div>
        <div class="section-title">Git 克隆</div>
        <div class="git-box"><span>git clone \${ORIGIN}/\${owner}/\${repo}.git</span>
          <button class="copy-btn" onclick="copyText(this,'git clone \${ORIGIN}/\${owner}/\${repo}.git')">复制</button></div>
      </div>\`;
    }

    // Releases
    html += '<div class="card">';
    html += '<h2>🚀 Releases</h2>';
    if (!Array.isArray(rels) || !rels.length) {
      html += '<p class="hint">暂无 Release</p>';
    } else {
      rels.slice(0,10).forEach(r => {
        html += \`<div class="release-item">
          <span class="tag">\${esc(r.tag_name)}</span>
          \${r.name ? '<div style="font-size:14px;font-weight:600;margin-bottom:8px">' + esc(r.name) + '</div>' : ''}
          \${r.assets && r.assets.length ? r.assets.map(a => \`
            <div class="asset">
              <span class="asset-name">📄 \${esc(a.name)}</span>
              <span class="asset-size">\${fmtSize(a.size)}</span>
              <button class="copy-btn" onclick="copyText(this,'\${ORIGIN}/https://github.com/\${owner}/\${repo}/releases/download/\${encodeURIComponent(r.tag_name)}/\${encodeURIComponent(a.name)}')">复制链接</button>
              <a href="\${ORIGIN}/https://github.com/\${owner}/\${repo}/releases/download/\${encodeURIComponent(r.tag_name)}/\${encodeURIComponent(a.name)}" style="font-size:12px;color:var(--accent)">下载</a>
            </div>
          \`).join('') : '<p class="hint" style="font-size:12px">此 Release 无附件</p>'}
        </div>\`;
      });
    }
    html += '</div>';

    // Tags
    html += '<div class="card"><h2>🏷️ Tags</h2>';
    if (!Array.isArray(tags) || !tags.length) {
      html += '<p class="hint">暂无 Tag</p>';
    } else {
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
      tags.slice(0,30).forEach(t => {
        const zipUrl = ORIGIN + '/https://codeload.github.com/' + owner + '/' + repo + '/zip/refs/tags/' + encodeURIComponent(t.name);
        html += \`<span style="background:var(--bg);border:1px solid var(--border);border-radius:20px;font-size:12px;padding:3px 12px;cursor:pointer;color:var(--accent)" onclick="copyText(this,'\${zipUrl}')" title="点击复制下载链接">\${esc(t.name)}</span>\`;
      });
      html += '</div><p class="hint" style="margin-top:8px">点击 Tag 可复制源码下载链接</p>';
    }
    html += '</div>';

    // Packages
    html += '<div class="card"><h2>📦 Packages</h2>';
    try {
      const pkgResp = await fetch(ORIGIN + '/api/orgs/' + owner + '/packages?package_type=container');
      const pkgs = await pkgResp.json();
      if (Array.isArray(pkgs) && pkgs.length) {
        pkgs.slice(0,20).forEach(p => {
          html += \`<div class="pkg-card">
            <span class="pkg-name">📦 \${esc(p.name)}</span>
            <span class="pkg-type">\${p.package_type}</span>
            <span style="font-size:12px;color:var(--muted)">\${p.visibility || ''}</span>
          </div>\`;
        });
      } else {
        // Try user packages
        const pkgResp2 = await fetch(ORIGIN + '/api/users/' + owner + '/packages?package_type=container');
        const pkgs2 = await pkgResp2.json();
        if (Array.isArray(pkgs2) && pkgs2.length) {
          pkgs2.slice(0,20).forEach(p => {
            html += \`<div class="pkg-card">
              <span class="pkg-name">📦 \${esc(p.name)}</span>
              <span class="pkg-type">\${p.package_type}</span>
            </div>\`;
          });
        } else {
          html += '<p class="hint">暂无公开 Package（或需要 Token 授权）</p>';
        }
      }
    } catch(e) { html += '<p class="hint">Package 加载失败</p>'; }
    html += '</div>';

    box.innerHTML = html;
  } catch(e) {
    box.innerHTML = '<p class="error">加载失败: ' + e.message + '</p>';
  }
}

// ===================== Utils =====================
function copyText(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '已复制✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    btn.textContent = '已复制✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 2000);
  });
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escUrl(s) { return s.replace(/'/g, "%27"); }
function fmtNum(n) { return n >= 1000 ? (n/1000).toFixed(1)+'k' : n; }
function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
</script>
</body>
</html>`;
}
