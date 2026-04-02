// _worker.js

// Docker镜像仓库主机地址
let hub_host = 'registry-1.docker.io';
// Docker认证服务器地址
const auth_url = 'https://auth.docker.io';

let 屏蔽爬虫UA = ['netcraft'];

// 根据主机名选择对应的上游地址
function routeByHosts(host) {
    // 定义路由表
    const routes = {
        // 生产环境
        "quay": "quay.io",
        "gcr": "gcr.io",
        "k8s-gcr": "k8s.gcr.io",
        "k8s": "registry.k8s.io",
        "ghcr": "ghcr.io",
        "cloudsmith": "docker.cloudsmith.io",
        "nvcr": "nvcr.io",

        // 测试环境
        "test": "registry-1.docker.io",
    };

    if (host in routes) return [routes[host], false];
    else return [hub_host, true];
}

/** @type {RequestInit} */
const PREFLIGHT_INIT = {
    // 预检请求配置
    headers: new Headers({
        'access-control-allow-origin': '*', // 允许所有来源
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS', // 允许的HTTP方法
        'access-control-max-age': '1728000', // 预检请求的缓存时间
    }),
}

/**
 * 构造响应
 * @param {any} body 响应体
 * @param {number} status 响应状态码
 * @param {Object<string, string>} headers 响应头
 */
function makeRes(body, status = 200, headers = {}) {
    headers['access-control-allow-origin'] = '*' // 允许所有来源
    return new Response(body, { status, headers }) // 返回新构造的响应
}

/**
 * 构造新的URL对象
 * @param {string} urlStr URL字符串
 * @param {string} base URL base
 */
function newUrl(urlStr, base) {
    try {
        console.log(`Constructing new URL object with path ${urlStr} and base ${base}`);
        return new URL(urlStr, base); // 尝试构造新的URL对象
    } catch (err) {
        console.error(err);
        return null // 构造失败返回null
    }
}

async function nginx() {
    const text = `
	<!DOCTYPE html>
	<html>
	<head>
	<title>Welcome to nginx!</title>
	<style>
		body {
			width: 35em;
			margin: 0 auto;
			font-family: Tahoma, Verdana, Arial, sans-serif;
		}
	</style>
	</head>
	<body>
	<h1>Welcome to nginx!</h1>
	<p>If you see this page, the nginx web server is successfully installed and
	working. Further configuration is required.</p>
	
	<p>For online documentation and support please refer to
	<a href="http://nginx.org/">nginx.org</a>.<br/>
	Commercial support is available at
	<a href="http://nginx.com/">nginx.com</a>.</p>
	
	<p><em>Thank you for using nginx.</em></p>
	</body>
	</html>
	`
    return text;
}

async function searchInterface() {
    const html = `
	<!DOCTYPE html>
	<html lang="zh-CN">
	<head>
		<title>Cloudflare Docker Hub 镜像代理</title>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<link rel="preconnect" href="https://fonts.googleapis.com">
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
		<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
		<style>
		*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
		:root{
			--bg-primary:#0b1120;
			--bg-secondary:#111827;
			--bg-card:rgba(255,255,255,0.04);
			--bg-card-hover:rgba(255,255,255,0.07);
			--border-color:rgba(255,255,255,0.06);
			--border-hover:rgba(255,255,255,0.12);
			--text-primary:#f1f5f9;
			--text-secondary:#94a3b8;
			--text-muted:#64748b;
			--accent:#38bdf8;
			--accent-dim:rgba(56,189,248,0.12);
			--accent-glow:rgba(56,189,248,0.25);
			--green:#34d399;
			--green-dim:rgba(52,211,153,0.15);
			--yellow:#fbbf24;
			--yellow-dim:rgba(251,191,36,0.15);
			--red:#f87171;
			--red-dim:rgba(248,113,113,0.12);
			--font-heading:'Space Grotesk',sans-serif;
			--font-body:'DM Sans',sans-serif;
			--font-mono:'JetBrains Mono',monospace;
			--radius:12px;
			--radius-lg:16px;
			--transition:0.25s cubic-bezier(0.4,0,0.2,1);
		}
		/* 亮色主题 */
		:root[data-theme='light']{
			--bg-primary:#f8fafc;
			--bg-secondary:#ffffff;
			--bg-card:rgba(0,0,0,0.03);
			--bg-card-hover:rgba(0,0,0,0.06);
			--border-color:rgba(0,0,0,0.08);
			--border-hover:rgba(0,0,0,0.15);
			--text-primary:#0f172a;
			--text-secondary:#475569;
			--text-muted:#94a3b8;
			--accent:#0284c7;
			--accent-dim:rgba(2,132,199,0.1);
			--accent-glow:rgba(2,132,199,0.2);
			--green:#059669;
			--green-dim:rgba(5,150,105,0.1);
			--yellow:#d97706;
			--yellow-dim:rgba(217,119,6,0.1);
			--red:#dc2626;
			--red-dim:rgba(220,38,38,0.08);
		}
		:root[data-theme='light'] body::before{
			background:radial-gradient(ellipse at 30% 20%,rgba(2,132,199,0.05) 0%,transparent 50%),
			           radial-gradient(ellipse at 70% 80%,rgba(99,102,241,0.03) 0%,transparent 50%);
		}
		:root[data-theme='light'] .header h1{
			background:linear-gradient(135deg,#0f172a 0%,#475569 100%);
			-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
		}
		:root[data-theme='light'] .result-proxy-row{
			background:rgba(0,0,0,0.04);
		}
		:root[data-theme='light'] .cmd-detail{
			background:rgba(0,0,0,0.04);
		}
		:root[data-theme='light'] .guide-code-block{
			background:rgba(0,0,0,0.04);
		}
		:root[data-theme='light'] .guide-code-block code .json-key{color:#0369a1}
		:root[data-theme='light'] .guide-domain-display{
			background:rgba(0,0,0,0.04);
		}
		:root[data-theme='light'] .guide-step-content code{
			background:rgba(0,0,0,0.07);color:var(--text-primary);
		}
		:root[data-theme='light'] .convert-cmd-block{
			background:rgba(0,0,0,0.04);
		}
		:root[data-theme='light'] .proxy-addr-lg{
			background:rgba(0,0,0,0.04);
		}
		:root[data-theme='light'] .pagination button.active{
			color:#ffffff;
		}
		html{scroll-behavior:smooth}
		body{
			font-family:var(--font-body);
			background:var(--bg-primary);
			color:var(--text-primary);
			min-height:100vh;
			overflow-x:hidden;
			line-height:1.6;
		}
		/* 背景装饰 */
		body::before{
			content:'';position:fixed;top:-50%;left:-50%;width:200%;height:200%;
			background:radial-gradient(ellipse at 30% 20%,rgba(56,189,248,0.06) 0%,transparent 50%),
			           radial-gradient(ellipse at 70% 80%,rgba(99,102,241,0.04) 0%,transparent 50%);
			pointer-events:none;z-index:0;
		}

		/* 布局 */
		.app{position:relative;z-index:1;max-width:860px;margin:0 auto;padding:40px 24px 60px}

		/* 头部 */
		.header{text-align:center;margin-bottom:40px;animation:fadeUp .6s ease-out}
		.header-icon{
			display:inline-flex;align-items:center;justify-content:center;
			width:64px;height:64px;border-radius:18px;
			background:linear-gradient(135deg,var(--accent-dim),rgba(99,102,241,0.1));
			border:1px solid var(--border-color);margin-bottom:20px;
		}
		.header-icon svg{width:34px;height:34px;fill:var(--accent)}
		.header h1{
			font-family:var(--font-heading);font-size:2rem;font-weight:700;
			letter-spacing:-0.03em;margin-bottom:8px;
			background:linear-gradient(135deg,#f1f5f9 0%,#94a3b8 100%);
			-webkit-background-clip:text;-webkit-text-fill-color:transparent;
			background-clip:text;
		}
		.header p{color:var(--text-secondary);font-size:0.95rem;max-width:480px;margin:0 auto}

		/* Tab 导航 */
		.tab-nav{
			display:flex;gap:4px;padding:4px;
			background:var(--bg-card);border:1px solid var(--border-color);
			border-radius:var(--radius);margin-bottom:32px;
			animation:fadeUp .6s ease-out .1s both;
		}
		.tab-btn{
			flex:1;padding:12px 20px;border:none;border-radius:9px;
			font-family:var(--font-body);font-size:0.9rem;font-weight:500;
			color:var(--text-muted);background:transparent;cursor:pointer;
			transition:var(--transition);display:flex;align-items:center;
			justify-content:center;gap:8px;
		}
		.tab-btn:hover{color:var(--text-secondary)}
		.tab-btn.active{
			background:rgba(56,189,248,0.1);color:var(--accent);
			box-shadow:0 0 0 1px rgba(56,189,248,0.2);
		}
		.tab-btn svg{width:18px;height:18px;flex-shrink:0}

		/* Tab 内容 */
		.tab-panel{display:none;animation:fadeUp .35s ease-out}
		.tab-panel.active{display:block}

		/* 搜索框 */
		.search-box{
			display:flex;gap:0;border-radius:var(--radius);overflow:hidden;
			border:1px solid var(--border-color);background:var(--bg-card);
			transition:var(--transition);margin-bottom:24px;
		}
		.search-box:focus-within{
			border-color:rgba(56,189,248,0.3);
			box-shadow:0 0 0 3px var(--accent-dim);
		}
		.search-box input{
			flex:1;padding:14px 18px;border:none;outline:none;
			background:transparent;color:var(--text-primary);
			font-family:var(--font-body);font-size:0.95rem;
		}
		.search-box input::placeholder{color:var(--text-muted)}
		.search-box button{
			padding:14px 20px;border:none;cursor:pointer;
			background:transparent;color:var(--text-muted);
			transition:var(--transition);display:flex;align-items:center;
		}
		.search-box button:hover{color:var(--accent);background:var(--accent-dim)}
		.search-box button svg{width:20px;height:20px}

		/* 搜索状态 */
		#loading{display:none;text-align:center;padding:48px 20px;color:var(--text-secondary)}
		.spinner{
			display:inline-block;width:24px;height:24px;
			border:2.5px solid var(--border-color);border-top-color:var(--accent);
			border-radius:50%;animation:spin .7s linear infinite;
			margin-right:10px;vertical-align:middle;
		}
		@keyframes spin{to{transform:rotate(360deg)}}

		#no-results{
			display:none;text-align:center;padding:48px 20px;
			color:var(--text-muted);font-size:0.95rem;
		}

		#search-error{
			display:none;text-align:center;padding:24px;margin-bottom:20px;
			background:var(--red-dim);border:1px solid rgba(248,113,113,0.2);
			border-radius:var(--radius);color:var(--text-primary);font-size:0.9rem;
		}
		#search-error .error-msg{color:var(--text-secondary);font-size:0.82rem;margin-top:6px}
		#search-error .error-retry{
			display:inline-block;margin-top:14px;padding:8px 20px;
			background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);
			color:var(--text-primary);border-radius:8px;font-size:0.85rem;
			cursor:pointer;transition:var(--transition);
		}
		#search-error .error-retry:hover{background:rgba(255,255,255,0.14)}

		.result-summary{color:var(--text-muted);font-size:0.85rem;margin-bottom:16px}

		/* 搜索结果卡片 */
		.result-card{
			background:var(--bg-card);border:1px solid var(--border-color);
			border-radius:var(--radius);padding:12px 16px;margin-bottom:8px;
			transition:var(--transition);animation:fadeUp .25s ease-out;
		}
		.result-card:hover{
			background:var(--bg-card-hover);border-color:var(--border-hover);
			transform:translateY(-1px);
		}
		.result-header{display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap}
		.result-name{
			font-family:var(--font-heading);font-size:0.92rem;font-weight:600;
			color:var(--text-primary);
		}
		.result-badges{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
		.badge{
			padding:1px 7px;border-radius:5px;font-size:0.68rem;
			font-weight:500;letter-spacing:0.02em;
		}
		.badge-official{background:var(--green-dim);color:var(--green);border:1px solid rgba(52,211,153,0.2)}
		.badge-stars{background:var(--yellow-dim);color:var(--yellow);border:1px solid rgba(251,191,36,0.2)}
		.result-desc{
			color:var(--text-secondary);font-size:0.82rem;line-height:1.4;
			margin-bottom:8px;
			display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;
		}
		/* 代理地址行 */
		.result-proxy-row{
			display:flex;align-items:center;gap:8px;flex-wrap:wrap;
			padding:8px 12px;background:rgba(0,0,0,0.2);border-radius:6px;
		}
		.result-proxy-row .proxy-addr{
			flex:1;font-family:var(--font-mono);font-size:0.8rem;
			color:var(--accent);word-break:break-all;min-width:0;
		}
		.result-proxy-row .copy-addr-btn{
			padding:4px 12px;border:1px solid var(--border-color);
			border-radius:6px;background:transparent;color:var(--text-secondary);
			font-size:0.75rem;cursor:pointer;transition:var(--transition);
			white-space:nowrap;font-family:var(--font-body);
		}
		.result-proxy-row .copy-addr-btn:hover{border-color:var(--accent);color:var(--accent)}
		.result-proxy-row .copy-addr-btn.copied{border-color:var(--green);color:var(--green)}

		/* 分页器 */
		.pagination{
			display:flex;align-items:center;justify-content:center;gap:6px;
			margin-top:16px;flex-wrap:wrap;
		}
		.pagination button{
			padding:6px 12px;border:1px solid var(--border-color);
			border-radius:6px;background:transparent;color:var(--text-secondary);
			font-size:0.82rem;cursor:pointer;transition:var(--transition);
			font-family:var(--font-body);min-width:36px;
		}
		.pagination button:hover:not(:disabled):not(.active){
			border-color:var(--accent);color:var(--accent);background:var(--accent-dim);
		}
		.pagination button.active{
			background:var(--accent);color:#0b1120;border-color:var(--accent);font-weight:600;
		}
		.pagination button:disabled{
			opacity:0.35;cursor:not-allowed;
		}
		.pagination .page-info{
			color:var(--text-muted);font-size:0.78rem;padding:0 4px;
		}

		/* 折叠命令区域 */
		.cmd-toggle{
			display:inline-flex;align-items:center;gap:4px;
			margin-top:6px;padding:0;border:none;background:none;
			color:var(--text-muted);font-size:0.75rem;cursor:pointer;
			font-family:var(--font-body);transition:var(--transition);
		}
		.cmd-toggle:hover{color:var(--text-secondary)}
		.cmd-toggle svg{width:14px;height:14px;transition:transform .2s ease}
		.cmd-toggle.open svg{transform:rotate(90deg)}
		.cmd-detail{
			display:none;margin-top:8px;padding:12px 14px;
			background:rgba(0,0,0,0.25);border-radius:6px;position:relative;
			animation:fadeUp .2s ease-out;
		}
		.cmd-detail.open{display:block}
		.cmd-detail code{
			font-family:var(--font-mono);font-size:0.8rem;color:var(--text-secondary);
			line-height:1.8;white-space:pre-wrap;word-break:break-all;display:block;
		}
		.cmd-detail code .cmd-comment{color:var(--text-muted)}
		.cmd-detail .copy-btn{
			position:absolute;top:10px;right:10px;
			padding:4px 10px;border:1px solid var(--border-color);
			border-radius:6px;background:transparent;color:var(--text-secondary);
			font-size:0.72rem;cursor:pointer;transition:var(--transition);
			font-family:var(--font-body);
		}
		.cmd-detail .copy-btn:hover{border-color:var(--accent);color:var(--accent)}
		.cmd-detail .copy-btn.copied{border-color:var(--green);color:var(--green)}

		/* 加载更多 */
		#load-more{
			display:none;width:100%;max-width:260px;margin:16px auto 0;
			padding:11px;background:var(--bg-card);border:1px solid var(--border-color);
			color:var(--text-secondary);border-radius:var(--radius);
			font-size:0.88rem;cursor:pointer;transition:var(--transition);
			font-family:var(--font-body);
		}
		#load-more:hover{background:var(--bg-card-hover);border-color:var(--border-hover);color:var(--text-primary)}

		/* ===== 镜像转换面板 ===== */
.convert-panel{margin:0 auto}
		.convert-desc{
			color:var(--text-secondary);font-size:0.88rem;line-height:1.6;
			margin-bottom:24px;text-align:center;
		}
		.convert-desc span{
			display:inline-block;padding:1px 7px;border-radius:4px;
			background:var(--bg-card);border:1px solid var(--border-color);
			font-family:var(--font-mono);font-size:0.82rem;color:var(--text-muted);
		}
		#convert-result{
			display:none;margin-top:24px;animation:fadeUp .3s ease-out;
		}
		.convert-result-card{
			background:var(--bg-card);border:1px solid var(--border-color);
			border-radius:var(--radius);padding:20px;
		}
		.convert-result-card .label{
			font-size:0.78rem;color:var(--text-muted);margin-bottom:8px;
			text-transform:uppercase;letter-spacing:0.05em;font-weight:500;
		}
		.convert-result-card .proxy-addr-lg{
			font-family:var(--font-mono);font-size:0.95rem;color:var(--accent);
			word-break:break-all;margin-bottom:20px;padding:12px 16px;
			background:rgba(0,0,0,0.2);border-radius:8px;
			display:flex;align-items:center;justify-content:space-between;gap:12px;
		}
		.convert-result-card .proxy-addr-lg .addr{flex:1;min-width:0}
		.convert-result-card .proxy-addr-lg .copy-addr-btn{
			padding:5px 14px;border:1px solid var(--border-color);
			border-radius:6px;background:transparent;color:var(--text-secondary);
			font-size:0.78rem;cursor:pointer;transition:var(--transition);
			white-space:nowrap;font-family:var(--font-body);
		}
		.convert-result-card .proxy-addr-lg .copy-addr-btn:hover{border-color:var(--accent);color:var(--accent)}
		.convert-result-card .proxy-addr-lg .copy-addr-btn.copied{border-color:var(--green);color:var(--green)}
		.convert-cmd-block{
			padding:16px 18px;background:rgba(0,0,0,0.25);border-radius:8px;position:relative;
		}
		.convert-cmd-block code{
			font-family:var(--font-mono);font-size:0.82rem;color:var(--text-secondary);
			line-height:1.8;white-space:pre-wrap;word-break:break-all;display:block;
		}
		.convert-cmd-block code .cmd-comment{color:var(--text-muted)}
		.convert-cmd-block .copy-btn{
			position:absolute;top:12px;right:12px;
			padding:5px 14px;border:1px solid var(--border-color);
			border-radius:6px;background:transparent;color:var(--text-secondary);
			font-size:0.75rem;cursor:pointer;transition:var(--transition);
			font-family:var(--font-body);
		}
		.convert-cmd-block .copy-btn:hover{border-color:var(--accent);color:var(--accent)}
		.convert-cmd-block .copy-btn.copied{border-color:var(--green);color:var(--green)}

		/* ===== 使用教程面板 ===== */
.guide-panel{margin:0 auto}
		.guide-section{
			background:var(--bg-card);border:1px solid var(--border-color);
			border-radius:var(--radius);padding:24px;margin-bottom:16px;
			animation:fadeUp .3s ease-out;
		}
		.guide-section:nth-child(2){animation-delay:.08s}
		.guide-section:nth-child(3){animation-delay:.16s}
		.guide-section-title{
			font-family:var(--font-heading);font-size:1rem;font-weight:600;
			color:var(--text-primary);margin-bottom:14px;
			display:flex;align-items:center;gap:10px;
		}
		.guide-section-title .guide-icon{
			display:inline-flex;align-items:center;justify-content:center;
			width:30px;height:30px;border-radius:8px;flex-shrink:0;
			background:var(--accent-dim);border:1px solid rgba(56,189,248,0.15);
		}
		.guide-section-title .guide-icon svg{width:16px;height:16px;stroke:var(--accent);fill:none}
		.guide-domain-display{
			padding:14px 18px;background:rgba(0,0,0,0.25);border-radius:8px;
			display:flex;align-items:center;justify-content:space-between;gap:12px;
			margin-bottom:10px;
		}
		.guide-domain-display .domain-text{
			font-family:var(--font-mono);font-size:1.05rem;color:var(--accent);
			word-break:break-all;flex:1;min-width:0;
		}
		.guide-domain-display .copy-addr-btn{
			padding:5px 14px;border:1px solid var(--border-color);
			border-radius:6px;background:transparent;color:var(--text-secondary);
			font-size:0.78rem;cursor:pointer;transition:var(--transition);
			white-space:nowrap;font-family:var(--font-body);
		}
		.guide-domain-display .copy-addr-btn:hover{border-color:var(--accent);color:var(--accent)}
		.guide-domain-display .copy-addr-btn.copied{border-color:var(--green);color:var(--green)}
		.guide-desc{
			color:var(--text-secondary);font-size:0.88rem;line-height:1.7;margin-bottom:14px;
		}
		.guide-desc strong{color:var(--text-primary);font-weight:500}
		.guide-code-block{
			padding:16px 18px;background:rgba(0,0,0,0.25);border-radius:8px;
			position:relative;margin-bottom:10px;
		}
		.guide-code-block code{
			font-family:var(--font-mono);font-size:0.82rem;color:var(--text-secondary);
			line-height:1.8;white-space:pre-wrap;word-break:break-all;display:block;
		}
		.guide-code-block code .cmd-comment{color:var(--text-muted)}
		.guide-code-block code .json-key{color:#7dd3fc}
		.guide-code-block code .json-str{color:var(--green)}
		.guide-code-block .copy-btn{
			position:absolute;top:10px;right:10px;
			padding:4px 12px;border:1px solid var(--border-color);
			border-radius:6px;background:transparent;color:var(--text-secondary);
			font-size:0.72rem;cursor:pointer;transition:var(--transition);
			font-family:var(--font-body);
		}
		.guide-code-block .copy-btn:hover{border-color:var(--accent);color:var(--accent)}
		.guide-code-block .copy-btn.copied{border-color:var(--green);color:var(--green)}
		.guide-step{
			display:flex;gap:12px;align-items:flex-start;margin-bottom:14px;
		}
		.guide-step:last-child{margin-bottom:0}
		.guide-step-num{
			display:inline-flex;align-items:center;justify-content:center;
			width:24px;height:24px;border-radius:50%;flex-shrink:0;
			background:var(--accent-dim);border:1px solid rgba(56,189,248,0.2);
			color:var(--accent);font-size:0.75rem;font-weight:600;
			font-family:var(--font-heading);margin-top:2px;
		}
		.guide-step-content{flex:1;color:var(--text-secondary);font-size:0.88rem;line-height:1.6}
		.guide-step-content code{
			padding:1px 6px;border-radius:4px;background:rgba(0,0,0,0.3);
			font-family:var(--font-mono);font-size:0.82rem;color:var(--text-muted);
		}
		.guide-note{
			padding:12px 16px;background:var(--yellow-dim);border:1px solid rgba(251,191,36,0.15);
			border-radius:8px;color:var(--text-secondary);font-size:0.82rem;line-height:1.6;
			margin-top:14px;
		}
		.guide-note::before{content:'💡 ';font-size:0.9rem}
		/* ===== 镜像转换-脚本提示 ===== */
		.convert-script-tip{
			margin-top:18px;padding:16px 18px;background:var(--bg-card);border:1px solid var(--border-color);
			border-radius:10px;font-size:0.84rem;line-height:1.7;color:var(--text-secondary);
		}
		.convert-script-tip .tip-title{
			font-weight:600;color:var(--text-primary);margin-bottom:6px;font-size:0.88rem;
			display:flex;align-items:center;gap:6px;
		}
		.convert-script-tip .tip-title svg{width:16px;height:16px;stroke:var(--accent);fill:none}
		.convert-script-tip .tip-desc{color:var(--text-muted);margin-bottom:10px;font-size:0.82rem}
		.convert-script-tip .convert-cmd-block{margin-top:0}

		/* 底部 */
		.footer{
			text-align:center;margin-top:48px;padding-top:24px;
			border-top:1px solid var(--border-color);
			color:var(--text-muted);font-size:0.8rem;
		}
		.footer a{color:var(--text-secondary);text-decoration:none;transition:var(--transition)}
		.footer a:hover{color:var(--accent)}

		/* 语言切换 */
		.lang-switch{
			position:fixed;top:16px;right:16px;z-index:100;
			display:flex;align-items:center;gap:0;
			background:var(--bg-card);border:1px solid var(--border-color);
			border-radius:8px;overflow:hidden;backdrop-filter:blur(12px);
		}
		.lang-btn{
			padding:6px 14px;border:none;background:transparent;
			color:var(--text-muted);font-size:0.78rem;font-weight:500;
			cursor:pointer;transition:var(--transition);
			font-family:var(--font-body);white-space:nowrap;
		}
		.lang-btn:hover{color:var(--text-secondary)}
		.lang-btn.active{background:var(--accent-dim);color:var(--accent)}
		.lang-sep{width:1px;height:16px;background:var(--border-color)}

		/* 主题切换 */
		.theme-toggle{
			position:fixed;top:16px;right:120px;z-index:100;
			display:flex;align-items:center;justify-content:center;
			width:36px;height:36px;border-radius:8px;
			background:var(--bg-card);border:1px solid var(--border-color);
			backdrop-filter:blur(12px);cursor:pointer;
			transition:var(--transition);color:var(--text-muted);
		}
		.theme-toggle:hover{color:var(--accent);border-color:var(--accent)}
		.theme-toggle svg{width:18px;height:18px}

		/* 动画 */
		@keyframes fadeUp{
			from{opacity:0;transform:translateY(12px)}
			to{opacity:1;transform:translateY(0)}
		}

		/* 响应式 */
		@media(max-width:640px){
			.app{padding:24px 16px 40px}
			.header h1{font-size:1.6rem}
			.tab-btn{padding:10px 12px;font-size:0.84rem}
			.tab-btn span.tab-label-full{display:none}
			.tab-btn span.tab-label-short{display:inline}
			.result-card{padding:10px 12px}
			.result-proxy-row{flex-direction:column;align-items:flex-start;gap:6px}
			.result-proxy-row .copy-addr-btn{align-self:flex-end}
		}
		@media(min-width:641px){
			.tab-btn span.tab-label-short{display:none}
			.tab-btn span.tab-label-full{display:inline}
		}
		</style>
	</head>
	<body>
		<div class="app">
			<!-- 头部 -->
			<header class="header">
				<div class="header-icon">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18">
						<path d="M23.763 6.886c-.065-.053-.673-.512-1.954-.512-.32 0-.659.03-1.01.087-.248-1.703-1.651-2.533-1.716-2.57l-.345-.2-.227.328a4.596 4.596 0 0 0-.611 1.433c-.23.972-.09 1.884.403 2.666-.596.331-1.546.418-1.744.42H.752a.753.753 0 0 0-.75.749c-.007 1.456.233 2.864.692 4.07.545 1.43 1.355 2.483 2.409 3.13 1.181.725 3.104 1.14 5.276 1.14 1.016 0 2.03-.092 2.93-.266 1.417-.273 2.705-.742 3.826-1.391a10.497 10.497 0 0 0 2.61-2.14c1.252-1.42 1.998-3.005 2.553-4.408.075.003.148.005.221.005 1.371 0 2.215-.55 2.68-1.01.505-.5.685-.998.704-1.053L24 7.076l-.237-.19Z"/>
					</svg>
				</div>
			<h1 data-i18n="header.title">Docker Hub 镜像代理</h1>
				<p data-i18n="header.desc">基于边缘网络加速的 Docker 镜像代理服务<br/>快速拉取所需容器镜像</p>
			</header>

			<!-- 主题切换 -->
			<button class="theme-toggle" id="theme-toggle" onclick="toggleTheme()" title="">
				<svg id="theme-icon-sun" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:none"><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke-linecap="round" stroke-linejoin="round"/></svg>
				<svg id="theme-icon-moon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</button>

			<!-- 语言切换 -->
			<div class="lang-switcher">
				<button class="lang-btn" data-lang="zh" onclick="setLang('zh')">中</button>
				<button class="lang-btn" data-lang="en" onclick="setLang('en')">EN</button>
			</div>

			<!-- Tab 导航 -->
			<nav class="tab-nav">
				<button class="tab-btn active" data-tab="search" onclick="switchTab('search')">
					<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" stroke-linecap="round"/></svg>
					<span class="tab-label-full" data-i18n="tab.search.full">镜像搜索</span><span class="tab-label-short" data-i18n="tab.search.short">搜索</span>
				</button>
				<button class="tab-btn" data-tab="convert" onclick="switchTab('convert')">
					<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>
					<span class="tab-label-full" data-i18n="tab.convert.full">镜像转换</span><span class="tab-label-short" data-i18n="tab.convert.short">转换</span>
				</button>
				<button class="tab-btn" data-tab="guide" onclick="switchTab('guide')">
					<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" stroke-linecap="round" stroke-linejoin="round"/></svg>
					<span class="tab-label-full" data-i18n="tab.guide.full">使用教程</span><span class="tab-label-short" data-i18n="tab.guide.short">教程</span>
				</button>
			</nav>

			<!-- 搜索面板 -->
			<div id="panel-search" class="tab-panel active">
				<div class="search-box">
				<input type="text" id="search-input" data-i18n="search.placeholder" data-i18n-attr="placeholder" placeholder="搜索 Docker 镜像，如 nginx、redis、postgres...">
				<button id="search-button" data-i18n="search.btn.title" data-i18n-attr="title" title="搜索">
						<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" stroke-linecap="round"/></svg>
					</button>
				</div>
				<div id="search-results">
					<div id="loading"><span class="spinner"></span><span data-i18n="search.loading">正在搜索中...</span></div>
					<div id="no-results" data-i18n="search.no-results">未找到相关镜像，请尝试其他关键词</div>
					<div id="search-error"></div>
					<div id="result-summary" class="result-summary"></div>
					<div id="result-list"></div>
					<div id="pagination" class="pagination" style="display:none"></div>
				</div>
			</div>

			<!-- 转换面板 -->
			<div id="panel-convert" class="tab-panel">
				<div class="convert-panel">
					<p class="convert-desc">
						<span data-i18n="convert.desc">输入任意 Docker 镜像名称，自动生成代理地址与转换命令</span><br>
						<span data-i18n="convert.format">支持格式：</span><span>nginx</span> <span>bitnami/nginx</span> <span>nginx:1.25</span> <span>bitnami/nginx:latest</span>
					</p>
					<div class="search-box">
						<input type="text" id="convert-input" data-i18n="convert.placeholder" data-i18n-attr="placeholder" placeholder="输入镜像名称，如 nginx、bitnami/nginx:latest">
						<button id="convert-btn" data-i18n="convert.btn.title" data-i18n-attr="title" title="生成">
							<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14m-7-7 7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
						</button>
					</div>
					<div id="convert-result">
						<div class="convert-result-card">
							<div class="label" data-i18n="convert.label.proxy">代理镜像地址</div>
							<div class="proxy-addr-lg">
								<span class="addr" id="convert-proxy-image"></span>
								<button class="copy-addr-btn" data-i18n="btn.copy" onclick="copyText(this,document.getElementById('convert-proxy-image').textContent)">复制</button>
							</div>
							<div class="label" data-i18n="convert.label.cmd">转换命令</div>
							<div class="convert-cmd-block">
								<button class="copy-btn" data-i18n="btn.copy" onclick="copyCommands(this)">复制</button>
								<code id="convert-commands"></code>
							</div>
						</div>
					</div>
					<!-- 一键脚本提示 -->
					<div class="convert-script-tip">
						<div class="tip-title">
							<svg stroke-width="2" viewBox="0 0 24 24"><path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" stroke-linecap="round" stroke-linejoin="round"/></svg>
							<span data-i18n="convert.script.title">一键拉取脚本</span>
						</div>
						<div class="tip-desc" data-i18n="convert.script.desc">保存以下脚本为 <code>dpull.sh</code>，即可通过 <code>bash dpull.sh nginx:latest</code> 一键拉取并自动转换标签</div>
						<div class="convert-cmd-block">
							<button class="copy-btn" data-i18n="btn.copy" onclick="copyCommands(this)">复制</button>
							<code id="convert-script-code"></code>
						</div>
					</div>
				</div>
			</div>

			<!-- 使用教程面板 -->
			<div id="panel-guide" class="tab-panel">
				<div class="guide-panel">
					<!-- 当前服务地址 -->
					<div class="guide-section">
						<div class="guide-section-title">
<span class="guide-icon"><svg stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
							<span data-i18n="guide.addr.title">当前服务地址</span>
						</div>
						<div class="guide-domain-display">
							<span class="domain-text" id="guide-domain"></span>
<button class="copy-addr-btn" data-i18n="btn.copy" onclick="copyText(this,document.getElementById('guide-domain').textContent)">复制</button>
						</div>
						<div class="guide-desc" data-i18n="guide.addr.desc">此地址为当前Docker镜像代理服务的访问域名，可用于配置Docker镜像加速</div>
					</div>

					<!-- 配置 Docker 镜像加速 -->
					<div class="guide-section">
						<div class="guide-section-title">
							<span class="guide-icon"><svg stroke-width="2" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3"/></svg></span>
<span data-i18n="guide.config.title">配置 Docker 镜像加速</span>
						</div>
						<div class="guide-desc" data-i18n="guide.config.desc">编辑 Docker 配置文件 <strong>/etc/docker/daemon.json</strong>，添加以下内容：</div>
						<div class="guide-code-block">
<button class="copy-btn" data-i18n="btn.copy" onclick="copyGuideJson(this)">复制</button>
							<code id="guide-daemon-json"></code>
						</div>
<div class="guide-desc" style="margin-top:14px;margin-bottom:0" data-i18n="guide.config.apply">保存后执行以下命令使配置生效：</div>
						<div class="guide-code-block" style="margin-top:10px">
							<button class="copy-btn" data-i18n="btn.copy" onclick="copyCommands(this)">复制</button>
							<code><span class="cmd-comment" data-i18n="cmd.reload"># 重新加载 Docker 配置</span>\nsudo systemctl daemon-reload\n<span class="cmd-comment" data-i18n="cmd.restart"># 重启 Docker 服务</span>\nsudo systemctl restart docker</code>
						</div>
<div class="guide-note" data-i18n="guide.config.note">配置后所有<code>docker pull</code>命令将自动通过镜像加速服务拉取，无需手动指定</div>
					</div>

					<!-- 手动使用方式 -->
					<div class="guide-section">
						<div class="guide-section-title">
							<span class="guide-icon"><svg stroke-width="2" viewBox="0 0 24 24"><path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
<span data-i18n="guide.manual.title">手动拉取方式</span>
						</div>
						<div class="guide-step">
							<span class="guide-step-num">1</span>
							<div class="guide-step-content"><span data-i18n="guide.manual.step1">拉取镜像（如 nginx）：</span><br><code id="guide-pull-official"></code></div>
						</div>
						<div class="guide-step">
							<span class="guide-step-num">2</span>
							<div class="guide-step-content" data-i18n="guide.manual.step2">拉取后可使用 <code>docker tag</code> 重新标记为原始镜像名，详见「镜像转换」</div>
						</div>
					</div>
				</div>
			</div>

			<!-- 底部 -->
<footer class="footer">
				<span data-i18n="footer.powered">Powered by Cloudflare Workers</span> &middot; <a href="https://github.com/PIKACHUIM/DockerProxys" target="_blank">GitHub</a>
			</footer>
		</div>

		<script>
		var CURRENT_HOST = window.location.hostname;
		var currentPage = 1;
		var currentQuery = '';
		var totalResults = 0;

		/* ===== i18n 国际化 ===== */
		var I18N = {
			zh: {
				'page.title': 'Docker Hub 镜像代理',
				'header.title': 'Docker Hub 镜像代理',
				'header.desc': '基于边缘网络加速的 Docker 镜像代理服务<br/>快速拉取所需容器镜像',
				'tab.search.full': '镜像搜索',
				'tab.search.short': '搜索',
				'tab.convert.full': '镜像转换',
				'tab.convert.short': '转换',
				'tab.guide.full': '使用教程',
				'tab.guide.short': '教程',
				'search.placeholder': '搜索 Docker 镜像，如 nginx、redis、postgres...',
				'search.btn.title': '搜索',
				'search.loading': '正在搜索中...',
				'search.no-results': '未找到相关镜像，请尝试其他关键词',
				'search.summary': '共 {total} 个结果，第 {page} / {pages} 页',
				'search.error.title': '⚠️ 搜索请求失败',
				'search.error.retry': '重试',
				'convert.desc': '输入任意 Docker 镜像名称，自动生成代理地址与转换命令',
				'convert.format': '支持格式：',
				'convert.placeholder': '输入镜像名称，如 nginx、bitnami/nginx:latest',
				'convert.btn.title': '生成',
				'convert.label.proxy': '代理镜像地址',
				'convert.label.cmd': '转换命令',
				'convert.script.title': '一键拉取脚本',
				'convert.script.desc': '保存以下脚本为 <code>dpull.sh</code>，即可通过 <code>bash dpull.sh nginx:latest</code> 一键拉取并自动转换标签',
				'btn.copy': '复制',
				'btn.copied': '已复制',
				'cmd.show': '查看转换命令',
				'cmd.hide': '收起转换命令',
				'cmd.pull': '# 拉取代理镜像',
				'cmd.tag': '# 重新标记为原始镜像名',
				'cmd.rmi': '# 清理代理标签',
				'cmd.reload': '# 重新加载 Docker 配置',
				'cmd.restart': '# 重启 Docker 服务',
				'guide.addr.title': '当前服务地址',
				'guide.addr.desc': '此地址为当前Docker镜像代理服务的访问域名，可用于配置Docker镜像加速',
				'guide.config.title': '配置 Docker 镜像加速',
				'guide.config.desc': '编辑 Docker 配置文件 <strong>/etc/docker/daemon.json</strong>，添加以下内容：',
				'guide.config.apply': '保存后执行以下命令使配置生效：',
				'guide.config.note': '配置后所有<code>docker pull</code>命令将自动通过镜像加速服务拉取，无需手动指定',
				'guide.manual.title': '手动拉取方式',
				'guide.manual.step1': '拉取镜像（如 nginx）：',
				'guide.manual.step2': '拉取后可使用 <code>docker tag</code> 重新标记为原始镜像名，详见「镜像转换」',
				'footer.powered': 'Powered by Cloudflare Workers',
				'theme.toggle.dark': '切换暗色模式',
				'theme.toggle.light': '切换亮色模式'
			},
			en: {
				'page.title': 'Docker Hub Mirror Proxy',
				'header.title': 'Docker Hub Mirror Proxy',
				'header.desc': 'Docker image proxy service powered by edge network<br/>Pull container images faster',
				'tab.search.full': 'Image Search',
				'tab.search.short': 'Search',
				'tab.convert.full': 'Image Convert',
				'tab.convert.short': 'Convert',
				'tab.guide.full': 'User Guide',
				'tab.guide.short': 'Guide',
				'search.placeholder': 'Search Docker images, e.g. nginx, redis, postgres...',
				'search.btn.title': 'Search',
				'search.loading': 'Searching...',
				'search.no-results': 'No images found, please try other keywords',
				'search.summary': '{total} results, page {page} / {pages}',
				'search.error.title': '⚠️ Search request failed',
				'search.error.retry': 'Retry',
				'convert.desc': 'Enter any Docker image name to generate proxy address and conversion commands',
				'convert.format': 'Supported formats: ',
				'convert.placeholder': 'Enter image name, e.g. nginx, bitnami/nginx:latest',
				'convert.btn.title': 'Generate',
				'convert.label.proxy': 'Proxy Image Address',
				'convert.label.cmd': 'Conversion Commands',
				'convert.script.title': 'One-Click Pull Script',
				'convert.script.desc': 'Save the script below as <code>dpull.sh</code>, then run <code>bash dpull.sh nginx:latest</code> to pull and auto re-tag',
				'btn.copy': 'Copy',
				'btn.copied': 'Copied',
				'cmd.show': 'Show commands',
				'cmd.hide': 'Hide commands',
				'cmd.pull': '# Pull proxy image',
				'cmd.tag': '# Re-tag as original image name',
				'cmd.rmi': '# Clean up proxy tag',
				'cmd.reload': '# Reload Docker configuration',
				'cmd.restart': '# Restart Docker service',
				'guide.addr.title': 'Service Address',
				'guide.addr.desc': 'This is the access domain of the current Docker mirror proxy service, which can be used to configure Docker image acceleration',
				'guide.config.title': 'Configure Docker Mirror',
				'guide.config.desc': 'Edit Docker config file <strong>/etc/docker/daemon.json</strong>, add the following:',
				'guide.config.apply': 'Save and run the following commands to apply:',
				'guide.config.note': 'After configuration, all <code>docker pull</code> commands will automatically pull through the mirror proxy',
				'guide.manual.title': 'Manual Pull',
				'guide.manual.step1': 'Pull image (e.g. nginx):',
				'guide.manual.step2': 'After pulling, use <code>docker tag</code> to re-tag as original image name, see "Image Convert"',
				'footer.powered': 'Powered by Cloudflare Workers',
				'theme.toggle.dark': 'Switch to dark mode',
				'theme.toggle.light': 'Switch to light mode'
			}
		};

		var currentLang = (function(){
			var saved = localStorage.getItem('lang');
			if (saved && I18N[saved]) return saved;
			var nav = (navigator.language || navigator.userLanguage || 'zh').toLowerCase();
			return nav.startsWith('zh') ? 'zh' : 'en';
		})();

		function t(key, params) {
			var text = (I18N[currentLang] && I18N[currentLang][key]) || (I18N['zh'][key]) || key;
			if (params) {
				Object.keys(params).forEach(function(k){
					text = text.replace('{' + k + '}', params[k]);
				});
			}
			return text;
		}

		function setLang(lang) {
			if (!I18N[lang]) return;
			currentLang = lang;
			localStorage.setItem('lang', lang);
			applyI18n();
			/* 更新语言按钮状态 */
			document.querySelectorAll('.lang-btn').forEach(function(b){
				b.classList.toggle('active', b.getAttribute('data-lang') === lang);
			});
			/* 如果教程面板可见则刷新 */
			var guidePanel = document.getElementById('panel-guide');
			if (guidePanel && guidePanel.classList.contains('active')) initGuidePanel();
			initConvertScript();
		}

		/* ===== 主题切换 ===== */
		var currentTheme = (function(){
			var saved = localStorage.getItem('theme');
			if (saved === 'light' || saved === 'dark') return saved;
			return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
		})();
		/* 立即应用主题，避免闪烁 */
		document.documentElement.setAttribute('data-theme', currentTheme);

		function toggleTheme() {
			currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
			document.documentElement.setAttribute('data-theme', currentTheme);
			localStorage.setItem('theme', currentTheme);
			updateThemeIcon();
		}

		function updateThemeIcon() {
			var sunIcon = document.getElementById('theme-icon-sun');
			var moonIcon = document.getElementById('theme-icon-moon');
			var btn = document.getElementById('theme-toggle');
			if (currentTheme === 'dark') {
				sunIcon.style.display = 'none';
				moonIcon.style.display = 'block';
				btn.title = t('theme.toggle.light');
			} else {
				sunIcon.style.display = 'block';
				moonIcon.style.display = 'none';
				btn.title = t('theme.toggle.dark');
			}
		}

		function applyI18n() {
			document.title = t('page.title');
			document.querySelectorAll('[data-i18n]').forEach(function(el){
				var key = el.getAttribute('data-i18n');
				var attr = el.getAttribute('data-i18n-attr');
				if (attr) {
					el.setAttribute(attr, t(key));
				} else {
					el.innerHTML = t(key);
				}
			});
		}

		/* ===== Tab 切换 ===== */
		function switchTab(name) {
			document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active')});
			document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active')});
			document.querySelector('.tab-btn[data-tab="'+name+'"]').classList.add('active');
			document.getElementById('panel-'+name).classList.add('active');
			if(name==='search') document.getElementById('search-input').focus();
			if(name==='convert') document.getElementById('convert-input').focus();
			if(name==='guide') initGuidePanel();
		}

		/* ===== 搜索 ===== */
		async function performSearch(page) {
			var query = document.getElementById('search-input').value.trim();
			if (!query) return;
			currentQuery = query;
			document.getElementById('result-list').innerHTML = '';
			document.getElementById('result-summary').textContent = '';
			document.getElementById('no-results').style.display = 'none';
			document.getElementById('search-error').style.display = 'none';
			document.getElementById('pagination').style.display = 'none';
			if (page === 1) {
				history.pushState(null, '', '/?q=' + encodeURIComponent(query));
			}
			document.getElementById('loading').style.display = 'block';
			try {
				var pageSize = 5;
				var res = await fetch('/v2/search?q=' + encodeURIComponent(query) + '&page=' + page + '&page_size=' + pageSize);
				if (!res.ok) {
					var errBody = '';
					try { var ej = await res.json(); errBody = ej.detail || ej.error || ''; } catch(_){}
					throw new Error(errBody || ('HTTP ' + res.status));
				}
				var data = await res.json();
				document.getElementById('loading').style.display = 'none';
				totalResults = data.num_results || 0;
				var results = data.results || [];
				if (results.length === 0 && page === 1) {
					document.getElementById('no-results').style.display = 'block';
					return;
				}
				var listEl = document.getElementById('result-list');
				results.forEach(function(item){ listEl.appendChild(createResultCard(item)); });
				currentPage = page;
				var totalPages = Math.ceil(totalResults / pageSize);
				document.getElementById('result-summary').textContent = t('search.summary', {total: totalResults, page: page, pages: totalPages});
				renderPagination(page, totalPages);
			} catch (e) {
				document.getElementById('loading').style.display = 'none';
				showSearchError(e.message);
			}
		}

		function renderPagination(current, total) {
			var el = document.getElementById('pagination');
			if (total <= 1) { el.style.display = 'none'; return; }
			var html = '';
			/* 上一页 */
			html += '<button ' + (current <= 1 ? 'disabled' : 'onclick="performSearch(' + (current-1) + ')"') + '>&laquo;</button>';
			/* 页码按钮 */
			var start = Math.max(1, current - 2);
			var end = Math.min(total, current + 2);
			if (start > 1) {
				html += '<button onclick="performSearch(1)">1</button>';
				if (start > 2) html += '<span class="page-info">…</span>';
			}
			for (var i = start; i <= end; i++) {
				html += '<button class="' + (i === current ? 'active' : '') + '" onclick="performSearch(' + i + ')">' + i + '</button>';
			}
			if (end < total) {
				if (end < total - 1) html += '<span class="page-info">…</span>';
				html += '<button onclick="performSearch(' + total + ')">' + total + '</button>';
			}
			/* 下一页 */
			html += '<button ' + (current >= total ? 'disabled' : 'onclick="performSearch(' + (current+1) + ')"') + '>&raquo;</button>';
			el.innerHTML = html;
			el.style.display = 'flex';
		}

		function createResultCard(item) {
			var name = item.repo_name || item.name || '';
			var desc = item.short_description || item.description || '';
			var isOfficial = item.is_official || false;
			var stars = item.star_count || 0;
			// 去掉 library/ 前缀，后端会自动补上
			var displayName = name.replace(/^library\\//, '');
			var originalImage = displayName;
			var proxyImage = CURRENT_HOST + '/' + displayName;
			var cardId = 'card-' + Math.random().toString(36).substr(2,8);

			var card = document.createElement('div');
			card.className = 'result-card';
			var html = '<div class="result-header">' +
				'<span class="result-name">' + escapeHtml(name) + '</span>' +
				'<div class="result-badges">' +
					(isOfficial ? '<span class="badge badge-official">Official</span>' : '') +
				(stars > 0 ? '<span class="badge badge-stars">★ ' + formatNum(stars) + '</span>' : '') +
				'</div></div>';
			if (desc) html += '<div class="result-desc">' + escapeHtml(desc) + '</div>';
			html += '<div class="result-proxy-row">' +
				'<span class="proxy-addr">' + escapeHtml(proxyImage) + '</span>' +
'<button class="copy-addr-btn" onclick="copyText(this,&#39;' + escapeAttr(proxyImage) + '&#39;)">' + t('btn.copy') + '</button>' +
				'</div>';
			html += '<button class="cmd-toggle" onclick="toggleCmd(this,&#39;' + cardId + '&#39;)">'+
				'<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
				t('cmd.show') + '</button>';
			html += '<div class="cmd-detail" id="' + cardId + '">' +
				'<button class="copy-btn" onclick="copyCommands(this)">' + t('btn.copy') + '</button>' +
				'<code>' + generateCommands(originalImage, proxyImage) + '</code></div>';
			card.innerHTML = html;
			return card;
		}

		function toggleCmd(btn, id) {
			var el = document.getElementById(id);
			var isOpen = el.classList.contains('open');
			el.classList.toggle('open');
			btn.classList.toggle('open');
			btn.innerHTML = isOpen
				? '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>' + t('cmd.show')
				: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>' + t('cmd.hide');
		}

		function generateCommands(originalImage, proxyImage) {
			var NL = String.fromCharCode(10);
			return '<span class="cmd-comment">' + t('cmd.pull') + '</span>' + NL +
				'docker pull ' + escapeHtml(proxyImage) + NL + NL +
				'<span class="cmd-comment">' + t('cmd.tag') + '</span>' + NL +
				'docker tag ' + escapeHtml(proxyImage) + ' ' + escapeHtml(originalImage) + NL + NL +
				'<span class="cmd-comment">' + t('cmd.rmi') + '</span>' + NL +
				'docker rmi ' + escapeHtml(proxyImage);
		}

		function showSearchError(msg) {
			var el = document.getElementById('search-error');
			el.innerHTML = '<div>' + t('search.error.title') + '</div>' +
				'<div class="error-msg">' + escapeHtml(msg) + '</div>' +
				'<button class="error-retry" onclick="performSearch(1)">' + t('search.error.retry') + '</button>';
			el.style.display = 'block';
		}

		/* ===== 镜像转换 ===== */
		function performConvert() {
			var input = document.getElementById('convert-input').value.trim();
			if (!input) return;
			var originalImage = input;
			var imagePath = input;
			var tag = '';
			var colonIdx = imagePath.lastIndexOf(':');
			if (colonIdx > 0) {
				tag = imagePath.substring(colonIdx);
				imagePath = imagePath.substring(0, colonIdx);
			}
			var proxyPath = imagePath.indexOf('/') !== -1 ? imagePath : imagePath;
			var proxyImage = CURRENT_HOST + '/' + proxyPath + tag;
			document.getElementById('convert-proxy-image').textContent = proxyImage;
			document.getElementById('convert-commands').innerHTML = generateCommands(originalImage, proxyImage);
			document.getElementById('convert-result').style.display = 'block';
		}

		/* ===== 工具函数 ===== */
		function copyText(btn, text) {
			navigator.clipboard.writeText(text).then(function(){
				markCopied(btn);
			}).catch(function(){
				fallbackCopy(text); markCopied(btn);
			});
		}
		function copyCommands(btn) {
			var codeEl = btn.parentElement.querySelector('code');
			var text = codeEl.innerText || codeEl.textContent;
			navigator.clipboard.writeText(text).then(function(){
				markCopied(btn);
			}).catch(function(){
				fallbackCopy(text); markCopied(btn);
			});
		}
		function markCopied(btn) {
			var orig = btn.textContent;
			btn.textContent = t('btn.copied');
			btn.classList.add('copied');
			setTimeout(function(){ btn.textContent = orig; btn.classList.remove('copied'); }, 1800);
		}
		function fallbackCopy(text) {
			var ta = document.createElement('textarea');
			ta.value = text; document.body.appendChild(ta);
			ta.select(); document.execCommand('copy');
			document.body.removeChild(ta);
		}
		function escapeHtml(str) {
			var d = document.createElement('div');
			d.appendChild(document.createTextNode(str));
			return d.innerHTML;
		}
		function escapeAttr(str) {
			return str.replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
		}
		function formatNum(n) {
			if (n >= 10000) return (n/1000).toFixed(0) + 'k';
			if (n >= 1000) return (n/1000).toFixed(1) + 'k';
			return '' + n;
		}

		/* ===== 使用教程面板初始化 ===== */
		function initGuidePanel() {
			var host = CURRENT_HOST;
			var url = 'https://' + host;
			document.getElementById('guide-domain').textContent = url;
			var NL = String.fromCharCode(10);
			document.getElementById('guide-daemon-json').innerHTML =
				'{' + NL + '  <span class="json-key">"registry-mirrors"</span>: [<span class="json-str">"' + escapeHtml(url) + '"</span>]' + NL + '}';
			document.getElementById('guide-pull-official').textContent =
				'docker pull ' + host + '/nginx:latest';
		}
		function initConvertScript() {
			var host = CURRENT_HOST;
			var NL = String.fromCharCode(10);
			document.getElementById('convert-script-code').innerHTML =
				'<span class="cmd-comment">#!/bin/bash</span>' + NL +
				'<span class="cmd-comment"># ' + t('convert.script.title') + '</span>' + NL +
				'M="' + escapeHtml(host) + '" I="$1"' + NL +
				'\\n#拉取镜像并重命名' +
				 '\\ndocker pull "$M/$I" \\ndocker tag "$M/$I" "$I" \\ndocker rmi "$M/$I"';
		}
		function copyGuideJson(btn) {
			var host = CURRENT_HOST;
			var url = 'https://' + host;
			var text = '{' + String.fromCharCode(10) + '  "registry-mirrors": ["' + url + '"]' + String.fromCharCode(10) + '}';
			navigator.clipboard.writeText(text).then(function(){
				markCopied(btn);
			}).catch(function(){
				fallbackCopy(text); markCopied(btn);
			});
		}

		/* ===== 事件绑定 ===== */
		document.getElementById('search-button').addEventListener('click', function(){ performSearch(1); });
		document.getElementById('search-input').addEventListener('keypress', function(e){ if(e.key==='Enter') performSearch(1); });
		document.getElementById('convert-btn').addEventListener('click', performConvert);
		document.getElementById('convert-input').addEventListener('keypress', function(e){ if(e.key==='Enter') performConvert(); });

		/* 页面加载初始化 */
		window.addEventListener('load', function(){
			/* 应用国际化 */
			applyI18n();
			document.querySelectorAll('.lang-btn').forEach(function(b){
				b.classList.toggle('active', b.getAttribute('data-lang') === currentLang);
			});
			/* 初始化主题图标 */
			updateThemeIcon();
			/* 初始化一键拉取脚本 */
			initConvertScript();

			var params = new URLSearchParams(window.location.search);
			var q = params.get('q');
			if (q) {
				document.getElementById('search-input').value = q;
				performSearch(1);
			} else {
				document.getElementById('search-input').focus();
			}
		});
		</script>
	</body>
	</html>
	`;
    return html;
}

/**
 * 生成海外访问禁止的友好提示页面
 * @param {string} countryCode 用户所在国家代码
 */
function generateBlockPage(countryCode) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>访问受限 | Access Restricted</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #0a0e1a;
    color: #e0e6f0;
    overflow: hidden;
    position: relative;
  }

  /* 静态网格背景 */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(56, 189, 248, 0.03) 1px, transparent 1px),
      linear-gradient(rgba(56, 189, 248, 0.03) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  /* 渐变光晕 */
  .glow {
    position: fixed;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.15;
    pointer-events: none;
  }
  .glow-1 {
    width: 500px; height: 500px;
    background: radial-gradient(circle, #f43f5e, transparent 70%);
    top: -10%; left: -5%;
  }
  .glow-2 {
    width: 400px; height: 400px;
    background: radial-gradient(circle, #6366f1, transparent 70%);
    bottom: -10%; right: -5%;
  }

  .container {
    position: relative;
    z-index: 1;
    max-width: 520px;
    width: 90%;
    text-align: center;
    animation: fadeInUp 0.8s ease-out;
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(40px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* 盾牌图标 */
  .shield {
    width: 80px; height: 80px;
    margin: 0 auto 32px;
    position: relative;
  }
  .shield svg {
    width: 100%; height: 100%;
    filter: drop-shadow(0 0 20px rgba(244, 63, 94, 0.3));
  }

  h1 {
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 12px;
    background: linear-gradient(135deg, #f8fafc, #94a3b8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    font-size: 1rem;
    color: #64748b;
    margin-bottom: 36px;
    line-height: 1.6;
  }

  /* 信息卡片 */
  .info-card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    padding: 28px 24px;
    margin-bottom: 28px;
    text-align: left;
  }

  .info-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
  }
  .info-row + .info-row {
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .info-icon {
    width: 36px; height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 1rem;
  }
  .info-icon.region { background: rgba(244, 63, 94, 0.12); }
  .info-icon.hint   { background: rgba(99, 102, 241, 0.12); }

  .info-label {
    font-size: 0.8rem;
    color: #475569;
    margin-bottom: 2px;
  }
  .info-value {
    font-size: 0.95rem;
    font-weight: 600;
    color: #cbd5e1;
  }

  /* 提示文字 */
  .tip {
    font-size: 0.85rem;
    color: #475569;
    line-height: 1.7;
    margin-bottom: 32px;
  }
  .tip strong {
    color: #6366f1;
    font-weight: 600;
  }

  /* 返回按钮 */
  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 28px;
    border-radius: 12px;
    border: 1px solid rgba(99, 102, 241, 0.3);
    background: rgba(99, 102, 241, 0.08);
    color: #a5b4fc;
    font-family: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    text-decoration: none;
  }
  .back-btn:hover {
    background: rgba(99, 102, 241, 0.18);
    border-color: rgba(99, 102, 241, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.15);
  }

  .footer {
    margin-top: 48px;
    font-size: 0.75rem;
    color: #334155;
    letter-spacing: 0.05em;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
</head>
<body>
  <div class="glow glow-1"></div>
  <div class="glow glow-2"></div>

  <div class="container">
    <div class="shield">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
              fill="rgba(244,63,94,0.1)" stroke="#f43f5e" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M9.5 12.5L11 14l3.5-4" stroke="#f43f5e" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
        <line x1="8" y1="8" x2="16" y2="16" stroke="#f43f5e" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="16" y1="8" x2="8" y2="16" stroke="#f43f5e" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </div>

    <h1>访问受限</h1>
    <p class="subtitle">本服务仅限中国大陆地区访问</p>

    <div class="info-card">
      <div class="info-row">
        <div class="info-icon region">🌍</div>
        <div>
          <div class="info-label">检测到您的地区</div>
          <div class="info-value">${countryCode || 'Unknown'}</div>
        </div>
      </div>
      <div class="info-row">
        <div class="info-icon hint">💡</div>
        <div>
          <div class="info-label">服务说明</div>
          <div class="info-value">此代理服务为大陆用户加速设计</div>
        </div>
      </div>
    </div>

    <p class="tip">
      海外用户可直接访问 <strong>Docker Hub 官方源</strong>，无需通过本代理。
    </p>

    <a class="back-btn" href="https://hub.docker.com" target="_blank">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
      前往 Docker Hub 官方
    </a>

    <div class="footer">POWERED BY CLOUDFLARE WORKERS</div>
  </div>
</body>
</html>`;
}

export default {
    async fetch(request, env, ctx) {
        // ===== 禁止海外访问 =====
        const country = request.cf?.country;
        const allowedCountries = ['CN']; // 只允许中国大陆，如需港澳台可加 'HK', 'MO', 'TW'
        if (country && !allowedCountries.includes(country)) {
            return new Response(generateBlockPage(country), {
                status: 403,
                headers: { 'Content-Type': 'text/html; charset=UTF-8' }
            });
        }
        // ===== 禁止海外访问 END =====

        const getReqHeader = (key) => request.headers.get(key); // 获取请求头

        let url = new URL(request.url); // 解析请求URL
        const userAgentHeader = request.headers.get('User-Agent');
        const userAgent = userAgentHeader ? userAgentHeader.toLowerCase() : "null";
        if (env.UA) 屏蔽爬虫UA = 屏蔽爬虫UA.concat(await ADD(env.UA));
        const workers_url = `https://${url.hostname}`;

        // 获取请求参数中的 ns
        const ns = url.searchParams.get('ns');
        const hostname = url.searchParams.get('hubhost') || url.hostname;
        const hostTop = hostname.split('.')[0]; // 获取主机名的第一部分

        let checkHost; // 在这里定义 checkHost 变量
        // 如果存在 ns 参数，优先使用它来确定 hub_host
        if (ns) {
            if (ns === 'docker.io') {
                hub_host = 'registry-1.docker.io'; // 设置上游地址为 registry-1.docker.io
            } else {
                hub_host = ns; // 直接使用 ns 作为 hub_host
            }
        } else {
            checkHost = routeByHosts(hostTop);
            hub_host = checkHost[0]; // 获取上游地址
        }

        const fakePage = checkHost ? checkHost[1] : false; // 确保 fakePage 不为 undefined
        console.log(`域名头部: ${hostTop} 反代地址: ${hub_host} searchInterface: ${fakePage}`);

        // ===== 本地搜索API：代理 Docker Hub 搜索请求（必须在 url.hostname 修改之前处理）=====
        if (url.pathname === '/v2/search' && url.searchParams.get('q')) {
            const q = url.searchParams.get('q');
            const page = parseInt(url.searchParams.get('page') || '1', 10);
            const pageSize = parseInt(url.searchParams.get('page_size') || '25', 10);

            const commonHeaders = {
                'User-Agent': 'docker/27.0.3 go/go1.21.11 kernel/5.15.0-1064 os/linux arch/amd64 UpstreamClient(Docker-Client/27.0.3 \\(linux\\))',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
            };

            // 搜索策略：优先使用 Docker Registry V1 搜索API，失败后回退到 Hub V2 API
            const searchEndpoints = [
                {
                    name: 'Docker Registry V1',
                    url: `https://index.docker.io/v1/search?q=${encodeURIComponent(q)}&n=${pageSize}&page=${page}`,
                    transform: (data) => ({
                        num_results: data.num_results || 0,
                        results: (data.results || []).map(item => ({
                            repo_name: item.name || '',
                            short_description: item.description || '',
                            is_official: item.is_official || false,
                            star_count: item.star_count || 0,
                        }))
                    })
                },
                {
                    name: 'Docker Hub V2',
                    url: `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(q)}&page=${page}&page_size=${pageSize}`,
                    transform: (data) => ({
                        num_results: data.num_results || data.count || 0,
                        results: (data.results || []).map(item => ({
                            repo_name: item.repo_name || item.name || '',
                            short_description: item.short_description || item.description || '',
                            is_official: item.is_official || false,
                            star_count: item.star_count || 0,
                        }))
                    })
                }
            ];

            let lastError = null;
            for (const endpoint of searchEndpoints) {
                try {
                    const searchRes = await fetch(endpoint.url, { headers: commonHeaders });
                    if (!searchRes.ok) {
                        lastError = new Error(`${endpoint.name} 返回 ${searchRes.status}`);
                        console.warn(`搜索端点 ${endpoint.name} 失败: ${searchRes.status}`);
                        continue; // 尝试下一个端点
                    }
                    const rawData = await searchRes.json();
                    const searchData = endpoint.transform(rawData);
                    return new Response(JSON.stringify(searchData), {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json',
                            'access-control-allow-origin': '*',
                            'Cache-Control': 'max-age=300',
                        }
                    });
                } catch (e) {
                    lastError = e;
                    console.warn(`搜索端点 ${endpoint.name} 异常: ${e.message}`);
                    continue;
                }
            }

            // 所有端点都失败
            return new Response(JSON.stringify({ error: '搜索请求失败', detail: lastError ? lastError.message : '所有搜索端点均不可用' }), {
                status: 502,
                headers: {
                    'Content-Type': 'application/json',
                    'access-control-allow-origin': '*',
                }
            });
        }
        // ===== 本地搜索API END =====

        // 更改请求的主机名
        url.hostname = hub_host;
        const hubParams = ['/v1/search', '/v1/repositories'];
        if (屏蔽爬虫UA.some(fxxk => userAgent.includes(fxxk)) && 屏蔽爬虫UA.length > 0) {
            // 首页改成一个nginx伪装页
            return new Response(await nginx(), {
                headers: {
                    'Content-Type': 'text/html; charset=UTF-8',
                },
            });
        } else if ((userAgent && userAgent.includes('mozilla')) || hubParams.some(param => url.pathname.includes(param))) {
            if (url.pathname == '/' || (url.pathname == '/' && url.search)) {
                if (env.URL302) {
                    return Response.redirect(env.URL302, 302);
                } else if (env.URL) {
                    if (env.URL.toLowerCase() == 'nginx') {
                        //首页改成一个nginx伪装页
                        return new Response(await nginx(), {
                            headers: {
                                'Content-Type': 'text/html; charset=UTF-8',
                            },
                        });
                    } else return fetch(new Request(env.URL, request));
                } else	{
                    if (fakePage) return new Response(await searchInterface(), {
                        headers: {
                            'Content-Type': 'text/html; charset=UTF-8',
                        },
                    });
                }
            } else {
                // 新增逻辑：/v1/ 路径特殊处理
                if (url.pathname.startsWith('/v1/')) {
                    url.hostname = 'index.docker.io';
                } else if (fakePage) {
                    url.hostname = 'hub.docker.com';
                }
                if (url.searchParams.get('q')?.includes('library/') && url.searchParams.get('q') != 'library/') {
                    const search = url.searchParams.get('q');
                    url.searchParams.set('q', search.replace('library/', ''));
                }
                const newRequest = new Request(url, request);
                return fetch(newRequest);
            }
        }

        // 修改包含 %2F 和 %3A 的请求
        if (!/%2F/.test(url.search) && /%3A/.test(url.toString())) {
            let modifiedUrl = url.toString().replace(/%3A(?=.*?&)/, '%3Alibrary%2F');
            url = new URL(modifiedUrl);
            console.log(`handle_url: ${url}`);
        }

        // 处理token请求
        if (url.pathname.includes('/token')) {
            let token_parameter = {
                headers: {
                    'Host': 'auth.docker.io',
                    'User-Agent': getReqHeader("User-Agent"),
                    'Accept': getReqHeader("Accept"),
                    'Accept-Language': getReqHeader("Accept-Language"),
                    'Accept-Encoding': getReqHeader("Accept-Encoding"),
                    'Connection': 'keep-alive',
                    'Cache-Control': 'max-age=0'
                }
            };
            let token_url = auth_url + url.pathname + url.search;
            return fetch(new Request(token_url, request), token_parameter);
        }

        // 修改 /v2/ 请求路径
        if (hub_host == 'registry-1.docker.io' && /^\/v2\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname) && !/^\/v2\/library/.test(url.pathname)) {
            //url.pathname = url.pathname.replace(/\/v2\//, '/v2/library/');
            url.pathname = '/v2/library/' + url.pathname.split('/v2/')[1];
            console.log(`modified_url: ${url.pathname}`);
        }

        // 新增：/v2/、/manifests/、/blobs/、/tags/ 先获取token再请求
        if (
            url.pathname.startsWith('/v2/') &&
            (
                url.pathname.includes('/manifests/') ||
                url.pathname.includes('/blobs/') ||
                url.pathname.includes('/tags/')
                || url.pathname.endsWith('/tags/list')
            )
        ) {
            // 提取镜像名
            let repo = '';
            const v2Match = url.pathname.match(/^\/v2\/(.+?)(?:\/(manifests|blobs|tags)\/)/);
            if (v2Match) {
                repo = v2Match[1];
            }
            if (repo) {
                const tokenUrl = `${auth_url}/token?service=registry.docker.io&scope=repository:${repo}:pull`;
                const tokenRes = await fetch(tokenUrl, {
                    headers: {
                        'User-Agent': getReqHeader("User-Agent"),
                        'Accept': getReqHeader("Accept"),
                        'Accept-Language': getReqHeader("Accept-Language"),
                        'Accept-Encoding': getReqHeader("Accept-Encoding"),
                        'Connection': 'keep-alive',
                        'Cache-Control': 'max-age=0'
                    }
                });
                const tokenData = await tokenRes.json();
                const token = tokenData.token;
                let parameter = {
                    headers: {
                        'Host': hub_host,
                        'User-Agent': getReqHeader("User-Agent"),
                        'Accept': getReqHeader("Accept"),
                        'Accept-Language': getReqHeader("Accept-Language"),
                        'Accept-Encoding': getReqHeader("Accept-Encoding"),
                        'Connection': 'keep-alive',
                        'Cache-Control': 'max-age=0',
                        'Authorization': `Bearer ${token}`
                    },
                    cacheTtl: 3600
                };
                if (request.headers.has("X-Amz-Content-Sha256")) {
                    parameter.headers['X-Amz-Content-Sha256'] = getReqHeader("X-Amz-Content-Sha256");
                }
                let original_response = await fetch(new Request(url, request), parameter);
                let original_response_clone = original_response.clone();
                let original_text = original_response_clone.body;
                let response_headers = original_response.headers;
                let new_response_headers = new Headers(response_headers);
                let status = original_response.status;
                if (new_response_headers.get("Www-Authenticate")) {
                    let auth = new_response_headers.get("Www-Authenticate");
                    let re = new RegExp(auth_url, 'g');
                    new_response_headers.set("Www-Authenticate", response_headers.get("Www-Authenticate").replace(re, workers_url));
                }
                if (new_response_headers.get("Location")) {
                    const location = new_response_headers.get("Location");
                    console.info(`Found redirection location, redirecting to ${location}`);
                    return httpHandler(request, location, hub_host);
                }
                let response = new Response(original_text, {
                    status,
                    headers: new_response_headers
                });
                return response;
            }
        }

        // 构造请求参数
        let parameter = {
            headers: {
                'Host': hub_host,
                'User-Agent': getReqHeader("User-Agent"),
                'Accept': getReqHeader("Accept"),
                'Accept-Language': getReqHeader("Accept-Language"),
                'Accept-Encoding': getReqHeader("Accept-Encoding"),
                'Connection': 'keep-alive',
                'Cache-Control': 'max-age=0'
            },
            cacheTtl: 3600 // 缓存时间
        };

        // 添加Authorization头
        if (request.headers.has("Authorization")) {
            parameter.headers.Authorization = getReqHeader("Authorization");
        }

        // 添加可能存在字段X-Amz-Content-Sha256
        if (request.headers.has("X-Amz-Content-Sha256")) {
            parameter.headers['X-Amz-Content-Sha256'] = getReqHeader("X-Amz-Content-Sha256");
        }

        // 发起请求并处理响应
        let original_response = await fetch(new Request(url, request), parameter);
        let original_response_clone = original_response.clone();
        let original_text = original_response_clone.body;
        let response_headers = original_response.headers;
        let new_response_headers = new Headers(response_headers);
        let status = original_response.status;

        // 修改 Www-Authenticate 头
        if (new_response_headers.get("Www-Authenticate")) {
            let auth = new_response_headers.get("Www-Authenticate");
            let re = new RegExp(auth_url, 'g');
            new_response_headers.set("Www-Authenticate", response_headers.get("Www-Authenticate").replace(re, workers_url));
        }

        // 处理重定向
        if (new_response_headers.get("Location")) {
            const location = new_response_headers.get("Location");
            console.info(`Found redirection location, redirecting to ${location}`);
            return httpHandler(request, location, hub_host);
        }

        // 返回修改后的响应
        let response = new Response(original_text, {
            status,
            headers: new_response_headers
        });
        return response;
    }
};

/**
 * 处理HTTP请求
 * @param {Request} req 请求对象
 * @param {string} pathname 请求路径
 * @param {string} baseHost 基地址
 */
function httpHandler(req, pathname, baseHost) {
    const reqHdrRaw = req.headers;

    // 处理预检请求
    if (req.method === 'OPTIONS' &&
        reqHdrRaw.has('access-control-request-headers')
    ) {
        return new Response(null, PREFLIGHT_INIT);
    }

    let rawLen = '';

    const reqHdrNew = new Headers(reqHdrRaw);

    reqHdrNew.delete("Authorization"); // 修复s3错误

    const refer = reqHdrNew.get('referer');

    let urlStr = pathname;

    const urlObj = newUrl(urlStr, 'https://' + baseHost);

    /** @type {RequestInit} */
    const reqInit = {
        method: req.method,
        headers: reqHdrNew,
        redirect: 'follow',
        body: req.body
    };
    return proxy(urlObj, reqInit, rawLen);
}

/**
 * 代理请求
 * @param {URL} urlObj URL对象
 * @param {RequestInit} reqInit 请求初始化对象
 * @param {string} rawLen 原始长度
 */
async function proxy(urlObj, reqInit, rawLen) {
    const res = await fetch(urlObj.href, reqInit);
    const resHdrOld = res.headers;
    const resHdrNew = new Headers(resHdrOld);

    // 验证长度
    if (rawLen) {
        const newLen = resHdrOld.get('content-length') || '';
        const badLen = (rawLen !== newLen);

        if (badLen) {
            return makeRes(res.body, 400, {
                '--error': `bad len: ${newLen}, except: ${rawLen}`,
                'access-control-expose-headers': '--error',
            });
        }
    }
    const status = res.status;
    resHdrNew.set('access-control-expose-headers', '*');
    resHdrNew.set('access-control-allow-origin', '*');
    resHdrNew.set('Cache-Control', 'max-age=1500');

    // 删除不必要的头
    resHdrNew.delete('content-security-policy');
    resHdrNew.delete('content-security-policy-report-only');
    resHdrNew.delete('clear-site-data');

    return new Response(res.body, {
        status,
        headers: resHdrNew
    });
}

async function ADD(envadd) {
    var addtext = envadd.replace(/[	 |"'\r\n]+/g, ',').replace(/,+/g, ',');	// 将空格、双引号、单引号和换行符替换为逗号
    if (addtext.charAt(0) == ',') addtext = addtext.slice(1);
    if (addtext.charAt(addtext.length - 1) == ',') addtext = addtext.slice(0, addtext.length - 1);
    const add = addtext.split(',');
    return add;
}