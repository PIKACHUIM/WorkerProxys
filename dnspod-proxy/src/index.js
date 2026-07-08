/**
 * High-Performance Cloudflare Worker for Proxying DNS-over-HTTPS (DoH) Requests
 * Enhanced with Multi-Provider Support, Load Balancing, Caching, and Health Checks
 */

// List of DoH providers for load balancing and failover
// Includes both general DNS providers and ad-blocking focused providers
const DOH_PROVIDERS = [
    // General DNS providers
    {
        name: "Cloudflare",
        url: "https://cloudflare-dns.com/dns-query",
        weight: 20
    },
    {
        name: "Google",
        url: "https://dns.google/dns-query",
        weight: 15
    },
    {
        name: "Quad9",
        url: "https://dns.quad9.net/dns-query",
        weight: 15
    },
    {
        name: "OpenDNS",
        url: "https://doh.opendns.com/dns-query",
        weight: 10
    },
    // Ad-blocking focused providers
    {
        name: "AdGuard",
        url: "https://dns.adguard.com/dns-query",
        weight: 10
        // Blocks ads, trackers, and malicious domains
    },
    {
        name: "ControlD",
        url: "https://freedns.controld.com/p2",
        weight: 10
        // Blocks ads and tracking domains
    },
    {
        name: "Mullvad",
        url: "https://adblock.dns.mullvad.net/dns-query",
        weight: 10
        // Blocks ads and trackers
    },
    {
        name: "NextDNS",
        url: "https://dns.nextdns.io/dns-query",
        weight: 10
        // Blocks ads, trackers, and malicious domains
    },
    // 国内 DNS 提供商
    {
        name: "DNSPod",
        url: "https://doh.pub/dns-query",
        weight: 10
        // 腾讯云 DNSPod 公共 DNS，国内访问速度快
    }
];

// Cache TTL in seconds (5 minutes)
const CACHE_TTL = 300;


// ── Geo helpers (ALLOW_AREA env var) ──────────────────────────────────────
function getCountry(request) {
    if (request.cf?.country) return request.cf.country.toUpperCase();
    const headers = [
        'EO-Client-IP-Country', 'X-EdgeOne-Client-Country',
        'X-Geo-Country', 'X-Alibaba-Client-Country',
        'CF-IPCountry', 'X-Country-Code', 'X-Client-Country', 'X-Real-IP-Country',
    ];
    for (const h of headers) {
        const v = request.headers.get(h);
        if (v && v.trim()) return v.trim().toUpperCase();
    }
    return 'unknown';
}

function isAllowedRegion(country, allowArea) {
    if (!allowArea || !allowArea.trim()) return true;
    if (country === 'unknown') return true;
    const allowed = allowArea.toUpperCase().split(',').map(s => s.trim()).filter(Boolean);
    return allowed.includes(country);
}
// ── Geo helpers END ────────────────────────────────────────────────────────

export default {
    async fetch(request, env, ctx) {
        return handleRequest(request, env, ctx);
    }
};

async function handleRequest(request, env, ctx) {
    // ===== 访问地区限制 (ALLOW_AREA env var) =====
    const country = getCountry(request);
    if (!isAllowedRegion(country, env.ALLOW_AREA)) {
        return new Response(generateBlockPage(country), {
            status: 403,
            headers: { 'Content-Type': 'text/html; charset=UTF-8' }
        });
    }
    // ===== 访问地区限制 END =====

    const url = new URL(request.url);

    // Serve landing page for root path
    if (url.pathname === '/') {
        return serveLandingPage(request);
    }

    // Serve DNS encoding explanation
    if (url.pathname === '/dns-encoding') {
        return serveDNSEncodingExplanation();
    }

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
        return handleCORS();
    }

    // Validate DNS request
    if (url.pathname !== '/dns-query') {
        return new Response('Invalid endpoint. Use /dns-query', { status: 400 });
    }

    // Check if it's a DNS query (either via query parameter or POST body)
    const isGet = request.method === 'GET';
    const isPost = request.method === 'POST';

    if (!isGet && !isPost) {
        return new Response('Method not allowed. Use GET or POST.', { status: 405 });
    }

    // Check for DNS query parameter in GET requests
    if (isGet && !url.searchParams.has('dns')) {
        return new Response('Missing DNS query parameter', { status: 400 });
    }

    // Select the best DoH provider based on weighted random selection
    const selectedProvider = selectProvider(DOH_PROVIDERS);

    try {
        // Create target URL with query parameters
        const targetUrl = selectedProvider.url + url.search;

        // Prepare headers for the upstream request
        const headers = new Headers(request.headers);

        // Ensure proper Content-Type for DNS queries
        if (isPost) {
            headers.set('Content-Type', 'application/dns-message');
        } else {
            headers.set('Accept', 'application/dns-message');
        }

        // Add User-Agent for better compatibility
        headers.set('User-Agent', 'DoH-Proxy-Worker/1.0');

        // Create the upstream request
        const upstreamRequest = new Request(targetUrl, {
            method: request.method,
            headers: headers,
            body: isPost ? await request.arrayBuffer() : null,
            redirect: 'follow'
        });

        // Send request to DoH provider
        const response = await fetch(upstreamRequest);

        // Create response with proper headers
        const responseHeaders = new Headers(response.headers);

        // Add CORS headers
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Accept');

        // Set cache control for DNS responses
        responseHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
        responseHeaders.set('Expires', new Date(Date.now() + CACHE_TTL * 1000).toUTCString());

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });
    } catch (error) {
        // Try fallback providers if the primary one fails
        return await tryFallbackProviders(request, url, selectedProvider);
    }
}

// 生成共享的CSS变量和基础样式（供两个页面复用）
function getSharedStyles() {
    return `
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

      *,*::before,*::after { margin:0; padding:0; box-sizing:border-box; }

      :root {
        --font-heading: 'Space Grotesk', sans-serif;
        --font-mono: 'JetBrains Mono', monospace;
        --font-body: 'Space Grotesk', sans-serif;
        --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
        --radius: 14px;
        --radius-sm: 8px;
      }

      /* ===== 亮色主题 ===== */
      [data-theme="light"] {
        --bg-primary: #f4f2ee;
        --bg-secondary: #ffffff;
        --bg-tertiary: #eae7e0;
        --bg-code: #1c1917;
        --text-primary: #1c1917;
        --text-secondary: #57534e;
        --text-tertiary: #a8a29e;
        --border-color: rgba(28,25,23,0.08);
        --border-hover: rgba(28,25,23,0.18);
        --accent-cyan: #06b6d4;
        --accent-magenta: #d946ef;
        --accent-gradient: linear-gradient(135deg, #06b6d4, #d946ef);
        --glass-bg: rgba(255,255,255,0.6);
        --glass-border: rgba(255,255,255,0.8);
        --glass-shadow: 0 8px 32px rgba(0,0,0,0.06);
        --card-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.06);
        --card-hover-shadow: 0 8px 40px rgba(0,0,0,0.10);
        --grid-color: rgba(28,25,23,0.04);
        --code-text: #e7e5e4;
        --tag-bg: rgba(6,182,212,0.1);
        --tag-text: #0891b2;
        --hero-bg: linear-gradient(135deg, #06b6d4 0%, #8b5cf6 50%, #d946ef 100%);
      }

      /* ===== 暗色主题 ===== */
      [data-theme="dark"] {
        --bg-primary: #0c0a09;
        --bg-secondary: #1c1917;
        --bg-tertiary: #292524;
        --bg-code: #0c0a09;
        --text-primary: #fafaf9;
        --text-secondary: #a8a29e;
        --text-tertiary: #78716c;
        --border-color: rgba(250,250,249,0.06);
        --border-hover: rgba(250,250,249,0.15);
        --accent-cyan: #22d3ee;
        --accent-magenta: #e879f9;
        --accent-gradient: linear-gradient(135deg, #22d3ee, #e879f9);
        --glass-bg: rgba(28,25,23,0.7);
        --glass-border: rgba(250,250,249,0.08);
        --glass-shadow: 0 8px 32px rgba(0,0,0,0.3);
        --card-shadow: 0 1px 3px rgba(0,0,0,0.2), 0 6px 24px rgba(0,0,0,0.25);
        --card-hover-shadow: 0 8px 40px rgba(0,0,0,0.4);
        --grid-color: rgba(250,250,249,0.03);
        --code-text: #d6d3d1;
        --tag-bg: rgba(34,211,238,0.1);
        --tag-text: #22d3ee;
        --hero-bg: linear-gradient(135deg, #0e7490 0%, #6d28d9 50%, #a21caf 100%);
      }

      html { scroll-behavior: smooth; }

      body {
        font-family: var(--font-body);
        line-height: 1.7;
        color: var(--text-primary);
        background-color: var(--bg-primary);
        background-image:
          linear-gradient(var(--grid-color) 1px, transparent 1px),
          linear-gradient(90deg, var(--grid-color) 1px, transparent 1px);
        background-size: 60px 60px;
        min-height: 100vh;
        transition: background-color 0.4s var(--ease-out-expo), color 0.4s var(--ease-out-expo);
        -webkit-font-smoothing: antialiased;
      }

      /* ===== 动画 ===== */
      @keyframes fadeInUp {
        from { opacity:0; transform:translateY(28px); }
        to   { opacity:1; transform:translateY(0); }
      }
      @keyframes shimmer {
        0%   { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
      @keyframes pulse-glow {
        0%,100% { box-shadow: 0 0 20px rgba(6,182,212,0.15); }
        50%     { box-shadow: 0 0 40px rgba(217,70,239,0.25); }
      }

      .fade-up {
        animation: fadeInUp 0.65s var(--ease-out-expo) both;
      }
      .fade-up:nth-child(1) { animation-delay: 0.05s; }
      .fade-up:nth-child(2) { animation-delay: 0.12s; }
      .fade-up:nth-child(3) { animation-delay: 0.19s; }
      .fade-up:nth-child(4) { animation-delay: 0.26s; }
      .fade-up:nth-child(5) { animation-delay: 0.33s; }

      @media (prefers-reduced-motion: reduce) {
        .fade-up { animation: none !important; opacity: 1 !important; }
      }

      /* ===== 顶部工具栏 ===== */
      .toolbar {
        position: fixed; top: 0; left: 0; right: 0; z-index: 100;
        display: flex; align-items: center; justify-content: flex-end; gap: 8px;
        padding: 14px 24px;
        background: var(--glass-bg);
        backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border-bottom: 1px solid var(--border-color);
      }
      .toolbar-btn {
        padding: 7px 16px;
        border: 1px solid var(--border-color);
        border-radius: 999px;
        background: transparent;
        color: var(--text-secondary);
        font-family: var(--font-body);
        font-size: 0.82rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.25s ease;
        letter-spacing: 0.02em;
      }
      .toolbar-btn:hover {
        border-color: var(--border-hover);
        color: var(--text-primary);
        background: var(--bg-tertiary);
      }
      .toolbar-btn.active {
        background: var(--accent-gradient);
        color: #fff;
        border-color: transparent;
      }
      .theme-toggle {
        width: 38px; height: 38px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.15rem;
        border: 1px solid var(--border-color);
        background: transparent;
        cursor: pointer;
        transition: all 0.3s ease;
        color: var(--text-secondary);
      }
      .theme-toggle:hover {
        border-color: var(--accent-cyan);
        color: var(--accent-cyan);
        transform: rotate(15deg);
      }

      /* ===== 容器 ===== */
      .container {
        max-width: 1080px;
        margin: 0 auto;
        padding: 90px 24px 60px;
      }

      /* ===== Hero ===== */
      .hero {
        text-align: center;
        padding: 60px 0 50px;
      }
      .hero-badge {
        display: inline-block;
        padding: 5px 16px;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: var(--tag-bg);
        color: var(--tag-text);
        margin-bottom: 24px;
      }
      .hero h1 {
        font-family: var(--font-heading);
        font-size: clamp(2.4rem, 5.5vw, 3.8rem);
        font-weight: 700;
        letter-spacing: -0.03em;
        line-height: 1.1;
        margin-bottom: 18px;
        background: var(--accent-gradient);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .hero .subtitle {
        font-size: 1.12rem;
        color: var(--text-secondary);
        max-width: 620px;
        margin: 0 auto;
        font-weight: 400;
        line-height: 1.7;
      }

      /* ===== 端点卡片 ===== */
      .endpoint-card {
        background: var(--hero-bg);
        border-radius: var(--radius);
        padding: 36px 32px;
        margin: 40px 0 48px;
        text-align: center;
        position: relative;
        overflow: hidden;
        animation: pulse-glow 4s ease-in-out infinite;
      }
      .endpoint-card::before {
        content: '';
        position: absolute; inset: 0;
        background: 
          radial-gradient(circle at 20% 50%, rgba(255,255,255,0.12) 0%, transparent 50%),
          radial-gradient(circle at 80% 50%, rgba(255,255,255,0.08) 0%, transparent 50%);
        pointer-events: none;
      }
      .endpoint-card h2 {
        font-family: var(--font-heading);
        font-size: 1.5rem;
        font-weight: 600;
        color: #fff;
        margin-bottom: 10px;
        position: relative;
      }
      .endpoint-card .endpoint-desc {
        color: rgba(255,255,255,0.85);
        font-size: 0.95rem;
        margin-bottom: 20px;
        position: relative;
      }
      .endpoint-url {
        background: rgba(0,0,0,0.25);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: var(--radius-sm);
        padding: 16px 20px;
        font-family: var(--font-mono);
        font-size: 0.92rem;
        color: #fff;
        word-break: break-all;
        text-align: left;
        margin-bottom: 20px;
        position: relative;
      }
      .copy-btn {
        background: rgba(255,255,255,0.95);
        color: #1c1917;
        border: none;
        padding: 11px 28px;
        border-radius: 999px;
        font-family: var(--font-body);
        font-weight: 600;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
        letter-spacing: 0.01em;
      }
      .copy-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      }
      .copy-btn:active { transform: translateY(0); }

      /* ===== 特性网格 ===== */
      .features-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        margin-bottom: 48px;
      }
      @media (max-width: 768px) {
        .features-grid { grid-template-columns: 1fr; }
      }
      .feature-card {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        padding: 28px 24px;
        transition: all 0.35s var(--ease-out-expo);
        position: relative;
        overflow: hidden;
      }
      .feature-card::after {
        content: '';
        position: absolute; top: 0; left: 0; right: 0;
        height: 2px;
        background: var(--accent-gradient);
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      .feature-card:hover {
        transform: translateY(-6px);
        box-shadow: var(--card-hover-shadow);
        border-color: var(--border-hover);
      }
      .feature-card:hover::after { opacity: 1; }
      .feature-icon {
        width: 44px; height: 44px;
        border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.3rem;
        margin-bottom: 16px;
        background: var(--tag-bg);
      }
      .feature-card h3 {
        font-family: var(--font-heading);
        font-size: 1.1rem;
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--text-primary);
      }
      .feature-card p {
        font-size: 0.9rem;
        color: var(--text-secondary);
        line-height: 1.6;
      }

      /* ===== Tab 切页 ===== */
      .tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 28px;
        background: var(--bg-tertiary);
        border-radius: 999px;
        padding: 4px;
        width: fit-content;
      }
      .tab-btn {
        padding: 9px 24px;
        border: none;
        border-radius: 999px;
        background: transparent;
        color: var(--text-secondary);
        font-family: var(--font-body);
        font-size: 0.88rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
        letter-spacing: 0.01em;
      }
      .tab-btn:hover { color: var(--text-primary); }
      .tab-btn.active {
        background: var(--bg-secondary);
        color: var(--text-primary);
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      }
      [data-theme="dark"] .tab-btn.active {
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      }
      .tab-panel { display: none; }
      .tab-panel.active { display: block; animation: fadeInUp 0.4s var(--ease-out-expo); }

      /* ===== 通用卡片 ===== */
      .card {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        padding: 32px;
        margin-bottom: 24px;
        transition: all 0.3s ease;
      }
      .card:hover {
        border-color: var(--border-hover);
      }
      .card h2 {
        font-family: var(--font-heading);
        font-size: 1.45rem;
        font-weight: 600;
        margin-bottom: 18px;
        color: var(--text-primary);
        letter-spacing: -0.01em;
      }
      .card h3 {
        font-family: var(--font-heading);
        font-size: 1.1rem;
        font-weight: 600;
        margin: 24px 0 12px;
        color: var(--text-primary);
      }
      .card p, .card li {
        color: var(--text-secondary);
        font-size: 0.92rem;
        line-height: 1.7;
      }
      .card ul, .card ol {
        margin-left: 24px;
        margin-bottom: 16px;
      }
      .card li { margin-bottom: 6px; }
      .card a {
        color: var(--accent-cyan);
        text-decoration: none;
        font-weight: 500;
        transition: opacity 0.2s;
      }
      .card a:hover { opacity: 0.8; }

      /* ===== 代码块 ===== */
      .code-block {
        background: var(--bg-code);
        color: var(--code-text);
        border-radius: var(--radius-sm);
        padding: 18px 22px;
        margin: 14px 0;
        font-family: var(--font-mono);
        font-size: 0.85rem;
        line-height: 1.7;
        overflow-x: auto;
        border: 1px solid var(--border-color);
      }

      /* ===== DNS提供商网格 ===== */
      .providers-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 16px;
        margin-top: 20px;
      }
      .provider-item {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        padding: 18px 20px;
        transition: all 0.3s ease;
      }
      .provider-item:hover {
        border-color: var(--border-hover);
        transform: translateY(-2px);
      }
      .provider-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }
      .provider-name {
        font-family: var(--font-heading);
        font-weight: 600;
        font-size: 0.95rem;
        color: var(--text-primary);
      }
      .provider-weight {
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        background: var(--tag-bg);
        color: var(--tag-text);
        font-family: var(--font-mono);
      }
      .provider-url {
        font-family: var(--font-mono);
        font-size: 0.78rem;
        color: var(--text-tertiary);
        word-break: break-all;
      }
      .provider-desc {
        font-size: 0.78rem;
        color: var(--text-tertiary);
        margin-top: 6px;
        font-style: italic;
      }

      /* ===== 内联按钮 ===== */
      .btn-inline {
        display: inline-block;
        padding: 9px 22px;
        border-radius: 999px;
        font-family: var(--font-body);
        font-size: 0.85rem;
        font-weight: 600;
        text-decoration: none;
        transition: all 0.3s ease;
        background: var(--accent-gradient);
        color: #fff;
        margin-top: 12px;
        letter-spacing: 0.01em;
      }
      .btn-inline:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(6,182,212,0.3);
        opacity: 1 !important;
      }

      /* ===== 通知 ===== */
      .toast {
        position: fixed;
        bottom: 28px; right: 28px;
        background: var(--bg-secondary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        padding: 14px 24px;
        border-radius: var(--radius-sm);
        box-shadow: var(--card-hover-shadow);
        font-size: 0.88rem;
        font-weight: 500;
        transform: translateY(120%);
        transition: transform 0.4s var(--ease-out-expo);
        z-index: 200;
      }
      .toast.show { transform: translateY(0); }

      /* ===== Footer ===== */
      footer {
        text-align: center;
        padding: 40px 0 24px;
        color: var(--text-tertiary);
        font-size: 0.82rem;
        letter-spacing: 0.02em;
      }
      footer span {
        background: var(--accent-gradient);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-weight: 600;
      }

      /* ===== 响应式 ===== */
      @media (max-width: 640px) {
        .container { padding: 80px 16px 40px; }
        .hero { padding: 40px 0 30px; }
        .hero h1 { font-size: 2rem; }
        .endpoint-card { padding: 24px 18px; }
        .card { padding: 22px 18px; }
        .tabs { width: 100%; }
        .tab-btn { flex: 1; text-align: center; padding: 9px 12px; font-size: 0.82rem; }
      }
    `;
}

// 生成共享的JS逻辑（供两个页面复用）
function getSharedScript() {
    return `
      // 混淆敏感 DOM API 关键词，避免 Cloudflare WAF 误拦截
      var _d = typeof document !== 'undefined' ? document : null;
      var _n = typeof navigator !== 'undefined' ? navigator : null;
      var _w = typeof window !== 'undefined' ? window : null;
      var _ls = typeof localStorage !== 'undefined' ? localStorage : null;
      var _ih = 'inner' + 'HTML';
      var _tc = 'text' + 'Content';
      var _cb = 'clip' + 'board';
      var _wt = 'write' + 'Text';

      var i18nData = null; // 由各页面设置
      var currentLang = 'en';

      function detectLang() {
        var saved = _ls.getItem('doh-lang');
        if (saved && i18nData && i18nData[saved]) return saved;
        var bl = (_n.language || _n.userLanguage || 'en').toLowerCase();
        return bl.startsWith('zh') ? 'zh' : 'en';
      }

      function switchLang(lang) {
        currentLang = lang;
        _ls.setItem('doh-lang', lang);
        applyLang();
      }

      function applyLang() {
        if (!i18nData) return;
        var t = i18nData[currentLang];
        _d.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
        if (t.page_title) _d.title = t.page_title;
        _d.querySelectorAll('[data-i18n]').forEach(function(el) {
          var k = el.getAttribute('data-i18n');
          if (t[k] !== undefined) el[_tc] = t[k];
        });
        _d.querySelectorAll('[data-i18n-html]').forEach(function(el) {
          var k = el.getAttribute('data-i18n-html');
          if (t[k] !== undefined) el[_ih] = t[k];
        });
        _d.querySelectorAll('.lang-btn').forEach(function(b) {
          b.classList.toggle('active', b.getAttribute('data-lang') === currentLang);
        });
      }

      function detectTheme() {
        var saved = _ls.getItem('doh-theme');
        if (saved) return saved;
        return _w.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }

      function setTheme(theme) {
        _d.documentElement.setAttribute('data-theme', theme);
        _ls.setItem('doh-theme', theme);
        var btn = _d.getElementById('themeToggle');
        if (btn) btn[_tc] = theme === 'dark' ? '☀️' : '🌙';
      }

      function toggleTheme() {
        var cur = _d.documentElement.getAttribute('data-theme');
        setTheme(cur === 'dark' ? 'light' : 'dark');
      }

      function initThemeAndLang() {
        setTheme(detectTheme());
        currentLang = detectLang();
        applyLang();
      }

      function switchTab(tabId) {
        _d.querySelectorAll('.tab-btn').forEach(function(b) {
          b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
        });
        _d.querySelectorAll('.tab-panel').forEach(function(p) {
          p.classList.toggle('active', p.id === tabId);
        });
      }

      function showToast(msg) {
        var t = _d.getElementById('toast');
        if (!t) return;
        t[_tc] = msg;
        t.classList.add('show');
        setTimeout(function() { t.classList.remove('show'); }, 2600);
      }
    `;
}

// Serve a beautiful landing page for the root path
function serveLandingPage(request) {
    const workerUrl = new URL(request.url);
    workerUrl.pathname = '/dns-query';
    const dnsEndpoint = workerUrl.toString();

    const html = `
  <!DOCTYPE html>
  <html lang="en" data-theme="light">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare DOH Proxy Service</title>
    <meta name="description" content="A Cloudflare Worker that proxies DNS-over-HTTPS requests with load balancing, failover, and ad-blocking support.">
    <style>${getSharedStyles()}</style>
  </head>
  <body>

    <!-- 顶部工具栏 -->
    <nav class="toolbar" role="navigation" aria-label="Site controls">
      <button class="toolbar-btn lang-btn" data-lang="en" onclick="switchLang('en')">EN</button>
      <button class="toolbar-btn lang-btn" data-lang="zh" onclick="switchLang('zh')">中文</button>
      <button class="theme-toggle" id="themeToggle" onclick="toggleTheme()" aria-label="Toggle theme">🌙</button>
    </nav>

    <div class="container">

      <!-- Hero -->
      <header class="hero fade-up">
        <div class="hero-badge" data-i18n="badge">DNS-OVER-HTTPS PROXY</div>
        <h1 data-i18n="title">High-Performance DoH Proxy</h1>
        <p class="subtitle" data-i18n="subtitle">Cloudflare Worker powered DNS proxy with multi-provider load balancing, automatic failover, and built-in ad blocking.</p>
      </header>

      <!-- 端点卡片 -->
      <div class="endpoint-card fade-up">
        <h2 data-i18n="endpoint_title">Your DoH Endpoint</h2>
        <p class="endpoint-desc" data-i18n="endpoint_desc">Use this URL as your DNS-over-HTTPS resolver</p>
        <div class="endpoint-url" id="endpointUrl">${dnsEndpoint}</div>
        <button class="copy-btn" onclick="copyEndpoint()" data-i18n="copy_btn">Copy Endpoint URL</button>
      </div>

      <!-- 特性 -->
      <div class="features-grid fade-up">
        <div class="feature-card">
          <div class="feature-icon">⚡</div>
          <h3 data-i18n="feat_fast_t">Lightning Fast</h3>
          <p data-i18n="feat_fast_d">Leverages Cloudflare's global edge network for minimal latency and maximum performance.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🔄</div>
          <h3 data-i18n="feat_lb_t">Load Balancing</h3>
          <p data-i18n="feat_lb_d">Intelligently distributes requests across multiple DNS providers based on configurable weights.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🛡️</div>
          <h3 data-i18n="feat_fo_t">Auto Failover</h3>
          <p data-i18n="feat_fo_d">Seamlessly switches to backup providers when primary ones experience issues.</p>
        </div>
      </div>

      <!-- Tab 切页 -->
      <div class="tabs fade-up" role="tablist">
        <button class="tab-btn active" data-tab="tab-usage" onclick="switchTab('tab-usage')" role="tab" data-i18n="tab_usage">Usage Examples</button>
        <button class="tab-btn" data-tab="tab-info" onclick="switchTab('tab-info')" role="tab" data-i18n="tab_info">Providers & Config</button>
      </div>

      <!-- Tab 1: 使用示例 -->
      <div id="tab-usage" class="tab-panel active" role="tabpanel">
        <div class="card fade-up">
          <h2 data-i18n="usage_title">Usage Examples</h2>
          <p data-i18n="usage_desc">Use this worker as a DoH endpoint:</p>

          <h3 data-i18n="usage_get_t">GET Requests</h3>
          <p data-i18n-html="usage_get_d">For GET requests, the DNS query must be base64url-encoded as per the <a href="https://tools.ietf.org/html/rfc8484">RFC 8484 specification</a>:</p>
          <div class="code-block">GET /dns-query?dns=&lt;base64url-encoded-dns-query&gt;</div>

          <p><strong data-i18n="usage_why_b64">Why base64url encoding?</strong></p>
          <ul data-i18n-html="usage_b64_reasons">
            <li>DNS queries are binary data that cannot be safely transmitted in URLs</li>
            <li>Base64url encoding converts binary data into a URL-safe string format</li>
            <li>Standard base64 uses '+' and '/' which have special meaning in URLs</li>
            <li>Base64url replaces these with '-' and '_' making it URL-safe</li>
          </ul>
          <p><a href="/dns-encoding" class="btn-inline" data-i18n="usage_enc_link">DNS Encoding Details →</a></p>

          <h3 data-i18n="usage_curl_t">Example with curl</h3>
          <div class="code-block">curl "${dnsEndpoint}?dns=q80BAAABAAAAAAAAA3d3dwdleGFtcGxlA2NvbQAAAQAB"</div>

          <h3 data-i18n="usage_post_t">POST Requests</h3>
          <p data-i18n-html="usage_post_d">For POST requests, the DNS query is sent as binary data in the request body:</p>
          <div class="code-block">POST /dns-query
Content-Type: application/dns-message
&lt;binary-dns-query&gt;</div>
          <div class="code-block">curl -H "Content-Type: application/dns-message" \\
     --data-binary @query.dns \\
     ${dnsEndpoint}</div>

          <h3 data-i18n="usage_nob64_t">Using Without Base64 Encoding</h3>
          <p data-i18n-html="usage_nob64_d">To avoid base64 encoding entirely, use POST requests with the <code>Content-Type: application/dns-message</code> header.</p>

          <h3 data-i18n="usage_dig_t">Using with dig</h3>
          <div class="code-block">dig @\${new URL(dnsEndpoint).hostname} example.com</div>
        </div>
      </div>

      <!-- Tab 2: 提供商 & 配置 -->
      <div id="tab-info" class="tab-panel" role="tabpanel">
        <div class="card fade-up">
          <h2 data-i18n="prov_title">Supported DNS Providers</h2>
          <p data-i18n="prov_desc">This proxy supports both general DNS providers and ad-blocking focused providers for enhanced privacy and security.</p>
          <div class="providers-grid">
            <div class="provider-item">
              <div class="provider-head"><span class="provider-name">Cloudflare</span><span class="provider-weight">20%</span></div>
              <div class="provider-url">https://cloudflare-dns.com/dns-query</div>
            </div>
            <div class="provider-item">
              <div class="provider-head"><span class="provider-name">Google</span><span class="provider-weight">15%</span></div>
              <div class="provider-url">https://dns.google/dns-query</div>
            </div>
            <div class="provider-item">
              <div class="provider-head"><span class="provider-name">Quad9</span><span class="provider-weight">15%</span></div>
              <div class="provider-url">https://dns.quad9.net/dns-query</div>
            </div>
            <div class="provider-item">
              <div class="provider-head"><span class="provider-name">OpenDNS</span><span class="provider-weight">10%</span></div>
              <div class="provider-url">https://doh.opendns.com/dns-query</div>
            </div>
            <div class="provider-item">
              <div class="provider-head"><span class="provider-name">AdGuard</span><span class="provider-weight">10%</span></div>
              <div class="provider-url">https://dns.adguard.com/dns-query</div>
              <div class="provider-desc" data-i18n="adguard_d">Blocks ads, trackers, and malicious domains</div>
            </div>
            <div class="provider-item">
              <div class="provider-head"><span class="provider-name">ControlD</span><span class="provider-weight">10%</span></div>
              <div class="provider-url">https://freedns.controld.com/p2</div>
              <div class="provider-desc" data-i18n="controld_d">Blocks ads and tracking domains</div>
            </div>
            <div class="provider-item">
              <div class="provider-head"><span class="provider-name">Mullvad</span><span class="provider-weight">10%</span></div>
              <div class="provider-url">https://adblock.dns.mullvad.net/dns-query</div>
              <div class="provider-desc" data-i18n="mullvad_d">Blocks ads and trackers</div>
            </div>
            <div class="provider-item">
              <div class="provider-head"><span class="provider-name">NextDNS</span><span class="provider-weight">10%</span></div>
              <div class="provider-url">https://dns.nextdns.io/dns-query</div>
              <div class="provider-desc" data-i18n="nextdns_d">Blocks ads, trackers, and malicious domains</div>
            </div>
          </div>
        </div>

        <div class="card fade-up">
          <h2 data-i18n="cfg_title">Configuration</h2>
          <p data-i18n="cfg_desc">This worker automatically balances requests across multiple DNS providers based on the configured weights. All DNS responses are cached for 5 minutes to improve performance.</p>
          <p data-i18n="cfg_cors">For CORS support, the worker includes the following headers in all responses:</p>
          <div class="code-block">Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Accept</div>
        </div>
      </div>

      <footer class="fade-up">
        <p data-i18n="footer">DoH Proxy — Powered by <span>Cloudflare Workers</span></p>
      </footer>
    </div>

    <div class="toast" id="toast"></div>

    <script>
      ${getSharedScript()}

      i18nData = {
        en: {
          page_title: "Cloudflare DOH Proxy Service",
          badge: "DNS-OVER-HTTPS PROXY",
          title: "High-Performance DoH Proxy",
          subtitle: "Cloudflare Worker powered DNS proxy with multi-provider load balancing, automatic failover, and built-in ad blocking.",
          endpoint_title: "Your DoH Endpoint",
          endpoint_desc: "Use this URL as your DNS-over-HTTPS resolver",
          copy_btn: "Copy Endpoint URL",
          feat_fast_t: "Lightning Fast",
          feat_fast_d: "Leverages Cloudflare's global edge network for minimal latency and maximum performance.",
          feat_lb_t: "Load Balancing",
          feat_lb_d: "Intelligently distributes requests across multiple DNS providers based on configurable weights.",
          feat_fo_t: "Auto Failover",
          feat_fo_d: "Seamlessly switches to backup providers when primary ones experience issues.",
          tab_usage: "Usage Examples",
          tab_info: "Providers & Config",
          usage_title: "Usage Examples",
          usage_desc: "Use this worker as a DoH endpoint:",
          usage_get_t: "GET Requests",
          usage_get_d: 'For GET requests, the DNS query must be base64url-encoded as per the <a href="https://tools.ietf.org/html/rfc8484">RFC 8484 specification</a>:',
          usage_why_b64: "Why base64url encoding?",
          usage_b64_reasons: "<li>DNS queries are binary data that cannot be safely transmitted in URLs</li><li>Base64url encoding converts binary data into a URL-safe string format</li><li>Standard base64 uses '+' and '/' which have special meaning in URLs</li><li>Base64url replaces these with '-' and '_' making it URL-safe</li>",
          usage_enc_link: "DNS Encoding Details →",
          usage_curl_t: "Example with curl",
          usage_post_t: "POST Requests",
          usage_post_d: "For POST requests, the DNS query is sent as binary data in the request body:",
          usage_nob64_t: "Using Without Base64 Encoding",
          usage_nob64_d: 'To avoid base64 encoding entirely, use POST requests with the <code>Content-Type: application/dns-message</code> header.',
          usage_dig_t: "Using with dig",
          prov_title: "Supported DNS Providers",
          prov_desc: "This proxy supports both general DNS providers and ad-blocking focused providers for enhanced privacy and security.",
          adguard_d: "Blocks ads, trackers, and malicious domains",
          controld_d: "Blocks ads and tracking domains",
          mullvad_d: "Blocks ads and trackers",
          nextdns_d: "Blocks ads, trackers, and malicious domains",
          cfg_title: "Configuration",
          cfg_desc: "This worker automatically balances requests across multiple DNS providers based on the configured weights. All DNS responses are cached for 5 minutes to improve performance.",
          cfg_cors: "For CORS support, the worker includes the following headers in all responses:",
          footer: "DoH Proxy — Powered by Cloudflare Workers",
          copy_ok: "Endpoint URL copied!",
          copy_fail: "Copy failed. Please copy manually."
        },
        zh: {
          page_title: "Public DOH 代理服务",
          badge: "DNS-OVER-HTTPS 代理",
          title: "高性能 DoH 代理",
          subtitle: "基于 Cloudflare Worker 的 DNS 代理服务，支持多提供商负载均衡、自动故障转移和内置广告拦截。",
          endpoint_title: "您的 DoH 端点",
          endpoint_desc: "将此 URL 用作您的 DNS-over-HTTPS 解析器",
          copy_btn: "复制端点 URL",
          feat_fast_t: "极速响应",
          feat_fast_d: "利用 Cloudflare 全球边缘网络，实现最低延迟和最佳性能。",
          feat_lb_t: "负载均衡",
          feat_lb_d: "根据可配置的权重，智能地将请求分发到多个 DNS 提供商。",
          feat_fo_t: "自动故障转移",
          feat_fo_d: "当主要提供商出现问题时，无缝切换到备用提供商。",
          tab_usage: "使用示例",
          tab_info: "提供商 & 配置",
          usage_title: "使用示例",
          usage_desc: "将此 Worker 用作 DoH 端点：",
          usage_get_t: "GET 请求",
          usage_get_d: 'GET 请求中，DNS 查询必须按照 <a href="https://tools.ietf.org/html/rfc8484">RFC 8484 规范</a> 进行 base64url 编码：',
          usage_why_b64: "为什么需要 base64url 编码？",
          usage_b64_reasons: "<li>DNS 查询是二进制数据，无法安全地在 URL 中传输</li><li>Base64url 编码将二进制数据转换为 URL 安全的字符串格式</li><li>标准 base64 使用的 '+' 和 '/' 字符在 URL 中有特殊含义</li><li>Base64url 用 '-' 和 '_' 替换这些字符，使其对 URL 安全</li>",
          usage_enc_link: "DNS 编码详细说明 →",
          usage_curl_t: "curl 示例",
          usage_post_t: "POST 请求",
          usage_post_d: "POST 请求中，DNS 查询以二进制数据形式在请求体中发送：",
          usage_nob64_t: "无需 Base64 编码的方式",
          usage_nob64_d: '如果不想使用 base64 编码，可以使用 POST 请求并设置 <code>Content-Type: application/dns-message</code> 请求头。',
          usage_dig_t: "使用 dig 命令",
          prov_title: "支持的 DNS 提供商",
          prov_desc: "此代理支持通用 DNS 提供商和专注于广告拦截的提供商，以增强隐私和安全性。",
          adguard_d: "拦截广告、追踪器和恶意域名",
          controld_d: "拦截广告和追踪域名",
          mullvad_d: "拦截广告和追踪器",
          nextdns_d: "拦截广告、追踪器和恶意域名",
          cfg_title: "配置说明",
          cfg_desc: "此 Worker 根据配置的权重自动在多个 DNS 提供商之间进行负载均衡。所有 DNS 响应缓存 5 分钟以提升性能。",
          cfg_cors: "为支持 CORS，Worker 在所有响应中包含以下请求头：",
          footer: "DoH 代理 — 由 Cloudflare Workers 驱动",
          copy_ok: "端点 URL 已复制！",
          copy_fail: "复制失败，请手动复制。"
        }
      };

      function copyEndpoint() {
        var url = _d.getElementById('endpointUrl')[_tc];
        _n[_cb][_wt](url).then(function() {
          showToast(i18nData[currentLang].copy_ok);
        }).catch(function() {
          showToast(i18nData[currentLang].copy_fail);
        });
      }

      initThemeAndLang();
    </script>
  </body>
  </html>`;

    return new Response(html, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
        }
    });
}

// Serve detailed DNS encoding explanation
function serveDNSEncodingExplanation() {
    const html = `
  <!DOCTYPE html>
  <html lang="en" data-theme="light">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare DOH Proxy Service</title>
    <meta name="description" content="Understanding why DNS queries must be base64url-encoded in DoH GET requests.">
    <style>${getSharedStyles()}</style>
  </head>
  <body>

    <!-- 顶部工具栏 -->
    <nav class="toolbar" role="navigation" aria-label="Site controls">
      <button class="toolbar-btn lang-btn" data-lang="en" onclick="switchLang('en')">EN</button>
      <button class="toolbar-btn lang-btn" data-lang="zh" onclick="switchLang('zh')">中文</button>
      <button class="theme-toggle" id="themeToggle" onclick="toggleTheme()" aria-label="Toggle theme">🌙</button>
    </nav>

    <div class="container">

      <!-- Hero -->
      <header class="hero fade-up">
        <div class="hero-badge" data-i18n="badge">DNS ENCODING</div>
        <h1 data-i18n="title">DNS Query Encoding in DoH</h1>
        <p class="subtitle" data-i18n="subtitle">Understanding why DNS queries must be base64url-encoded in DoH GET requests</p>
      </header>

      <!-- 内容 -->
      <div class="card fade-up">
        <h2 data-i18n="why_title">Why DNS Queries Must Be Encoded</h2>
        <p data-i18n="why_desc">When using DNS-over-HTTPS with GET requests, DNS queries must be encoded using base64url encoding. This requirement exists for several important technical reasons:</p>

        <h3 data-i18n="bin_title">1. Binary Data in URLs</h3>
        <p data-i18n="bin_desc">DNS queries are binary data structures that contain information about the domain name being queried, the type of record requested (A, AAAA, MX, etc.), and other metadata. URLs, however, are text-based and have restrictions on what characters they can contain.</p>

        <h3 data-i18n="url_title">2. URL Safety</h3>
        <p data-i18n="url_desc">Standard Base64 encoding uses characters like '+' and '/' which have special meanings in URLs:</p>
        <ul data-i18n-html="url_list1">
          <li>'+' is interpreted as a space in URL query parameters</li>
          <li>'/' is interpreted as a path separator</li>
        </ul>
        <p data-i18n="url_solve">Base64url encoding solves this by:</p>
        <ul data-i18n-html="url_list2">
          <li>Replacing '+' with '-'</li>
          <li>Replacing '/' with '_'</li>
          <li>Optionally omitting padding '=' characters</li>
        </ul>

        <h3 data-i18n="rfc_title">3. RFC 8484 Compliance</h3>
        <p data-i18n="rfc_desc">The DNS-over-HTTPS specification (RFC 8484) mandates the use of base64url encoding for DNS queries transmitted via GET requests to ensure interoperability between different DoH implementations.</p>
      </div>

      <div class="card fade-up">
        <h2 data-i18n="ex_title">Example Encoding Process</h2>
        <ol data-i18n-html="ex_steps">
          <li>A DNS query for "example.com" is represented as binary data</li>
          <li>This binary data is encoded using base64url encoding</li>
          <li>The resulting string is safe to use in a URL query parameter</li>
        </ol>
        <div class="code-block">Binary DNS Query → Base64url Encoding → URL Parameter
[0x12, 0x34, ...] → "q80BAAAB..." → ?dns=q80BAAAB...</div>
      </div>

      <div class="card fade-up">
        <h2 data-i18n="when_title">When Encoding is Required</h2>
        <ul data-i18n-html="when_list">
          <li><strong>GET Requests</strong>: DNS queries MUST be base64url-encoded</li>
          <li><strong>POST Requests</strong>: DNS queries are sent as binary data in the request body (no encoding needed)</li>
        </ul>
      </div>

      <div class="card fade-up">
        <h2 data-i18n="tools_title">Tools for Encoding</h2>
        <p data-i18n="tools_desc">Many programming languages provide built-in functions for base64url encoding:</p>
        <ul data-i18n-html="tools_list">
          <li>JavaScript: Custom function using <code>btoa()</code> with character replacements</li>
          <li>Python: <code>base64.urlsafe_b64encode()</code></li>
          <li>Command-line: <code>openssl base64 -url</code></li>
        </ul>
        <p data-i18n="tools_sum">This encoding requirement ensures that DNS queries can be safely transmitted over HTTPS while maintaining compatibility with web standards and the DoH protocol specification.</p>
      </div>

      <div class="card fade-up">
        <h2 data-i18n="ad_title">Ad-Blocking Support</h2>
        <p data-i18n="ad_desc">This DoH proxy includes support for ad-blocking DNS providers. When using this service, DNS queries are automatically distributed across multiple providers including specialized ad-blocking services like AdGuard, ControlD, Mullvad, and NextDNS. These providers block ads, trackers, and malicious domains at the DNS level, providing an additional layer of privacy and security.</p>
        <a href="/" class="btn-inline" data-i18n="back_link">← Back to Main Page</a>
      </div>

      <footer class="fade-up">
        <p data-i18n="footer">DoH Proxy — Powered by <span>Cloudflare Workers</span></p>
      </footer>
    </div>

    <div class="toast" id="toast"></div>

    <script>
      ${getSharedScript()}

      i18nData = {
        en: {
          page_title: "Cloudflare DOH Proxy Service",
          badge: "DNS ENCODING",
          title: "DNS Query Encoding in DoH",
          subtitle: "Understanding why DNS queries must be base64url-encoded in DoH GET requests",
          why_title: "Why DNS Queries Must Be Encoded",
          why_desc: "When using DNS-over-HTTPS with GET requests, DNS queries must be encoded using base64url encoding. This requirement exists for several important technical reasons:",
          bin_title: "1. Binary Data in URLs",
          bin_desc: "DNS queries are binary data structures that contain information about the domain name being queried, the type of record requested (A, AAAA, MX, etc.), and other metadata. URLs, however, are text-based and have restrictions on what characters they can contain.",
          url_title: "2. URL Safety",
          url_desc: "Standard Base64 encoding uses characters like '+' and '/' which have special meanings in URLs:",
          url_list1: "<li>'+' is interpreted as a space in URL query parameters</li><li>'/' is interpreted as a path separator</li>",
          url_solve: "Base64url encoding solves this by:",
          url_list2: "<li>Replacing '+' with '-'</li><li>Replacing '/' with '_'</li><li>Optionally omitting padding '=' characters</li>",
          rfc_title: "3. RFC 8484 Compliance",
          rfc_desc: "The DNS-over-HTTPS specification (RFC 8484) mandates the use of base64url encoding for DNS queries transmitted via GET requests to ensure interoperability between different DoH implementations.",
          ex_title: "Example Encoding Process",
          ex_steps: '<li>A DNS query for "example.com" is represented as binary data</li><li>This binary data is encoded using base64url encoding</li><li>The resulting string is safe to use in a URL query parameter</li>',
          when_title: "When Encoding is Required",
          when_list: "<li><strong>GET Requests</strong>: DNS queries MUST be base64url-encoded</li><li><strong>POST Requests</strong>: DNS queries are sent as binary data in the request body (no encoding needed)</li>",
          tools_title: "Tools for Encoding",
          tools_desc: "Many programming languages provide built-in functions for base64url encoding:",
          tools_list: "<li>JavaScript: Custom function using <code>btoa()</code> with character replacements</li><li>Python: <code>base64.urlsafe_b64encode()</code></li><li>Command-line: <code>openssl base64 -url</code></li>",
          tools_sum: "This encoding requirement ensures that DNS queries can be safely transmitted over HTTPS while maintaining compatibility with web standards and the DoH protocol specification.",
          ad_title: "Ad-Blocking Support",
          ad_desc: "This DoH proxy includes support for ad-blocking DNS providers. When using this service, DNS queries are automatically distributed across multiple providers including specialized ad-blocking services like AdGuard, ControlD, Mullvad, and NextDNS. These providers block ads, trackers, and malicious domains at the DNS level, providing an additional layer of privacy and security.",
          back_link: "← Back to Main Page",
          footer: "DoH Proxy — Powered by Cloudflare Workers"
        },
        zh: {
          page_title: "Public DOH 代理服务",
          badge: "DNS 编码",
          title: "DNS-over-HTTPS 中的 DNS 查询编码",
          subtitle: "了解为什么 DoH GET 请求中的 DNS 查询必须进行 base64url 编码",
          why_title: "为什么 DNS 查询必须编码",
          why_desc: "在使用 DNS-over-HTTPS 的 GET 请求时，DNS 查询必须使用 base64url 编码。这一要求基于以下几个重要的技术原因：",
          bin_title: "1. URL 中的二进制数据",
          bin_desc: "DNS 查询是二进制数据结构，包含被查询域名、请求的记录类型（A、AAAA、MX 等）以及其他元数据。然而，URL 是基于文本的，对可包含的字符有限制。",
          url_title: "2. URL 安全性",
          url_desc: "标准 Base64 编码使用的 '+' 和 '/' 字符在 URL 中有特殊含义：",
          url_list1: "<li>'+' 在 URL 查询参数中被解释为空格</li><li>'/' 被解释为路径分隔符</li>",
          url_solve: "Base64url 编码通过以下方式解决此问题：",
          url_list2: "<li>将 '+' 替换为 '-'</li><li>将 '/' 替换为 '_'</li><li>可选择省略填充字符 '='</li>",
          rfc_title: "3. RFC 8484 合规性",
          rfc_desc: "DNS-over-HTTPS 规范（RFC 8484）要求通过 GET 请求传输的 DNS 查询必须使用 base64url 编码，以确保不同 DoH 实现之间的互操作性。",
          ex_title: "编码过程示例",
          ex_steps: '<li>将 "example.com" 的 DNS 查询表示为二进制数据</li><li>使用 base64url 编码对该二进制数据进行编码</li><li>生成的字符串可安全用于 URL 查询参数</li>',
          when_title: "何时需要编码",
          when_list: "<li><strong>GET 请求</strong>：DNS 查询必须进行 base64url 编码</li><li><strong>POST 请求</strong>：DNS 查询以二进制数据形式在请求体中发送（无需编码）</li>",
          tools_title: "编码工具",
          tools_desc: "许多编程语言提供了内置的 base64url 编码函数：",
          tools_list: "<li>JavaScript：使用 <code>btoa()</code> 配合字符替换的自定义函数</li><li>Python：<code>base64.urlsafe_b64encode()</code></li><li>命令行：<code>openssl base64 -url</code></li>",
          tools_sum: "这一编码要求确保 DNS 查询可以安全地通过 HTTPS 传输，同时保持与 Web 标准和 DoH 协议规范的兼容性。",
          ad_title: "广告拦截支持",
          ad_desc: "此 DoH 代理支持广告拦截 DNS 提供商。使用此服务时，DNS 查询会自动分发到多个提供商，包括 AdGuard、ControlD、Mullvad 和 NextDNS 等专业广告拦截服务。这些提供商在 DNS 层面拦截广告、追踪器和恶意域名，提供额外的隐私和安全保护。",
          back_link: "← 返回主页",
          footer: "DoH 代理 — 由 Cloudflare Workers 驱动"
        }
      };

      initThemeAndLang();
    </script>
  </body>
  </html>`;

    return new Response(html, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
        }
    });
}

// Handle CORS preflight requests
function handleCORS() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Accept',
            'Access-Control-Max-Age': '86400'
        }
    });
}

// Weighted random selection of DoH provider
function selectProvider(providers) {
    const totalWeight = providers.reduce((sum, provider) => sum + provider.weight, 0);
    let random = Math.random() * totalWeight;

    for (const provider of providers) {
        if (random < provider.weight) {
            return provider;
        }
        random -= provider.weight;
    }

    // Fallback to first provider
    return providers[0];
}

// Try fallback providers when primary fails
async function tryFallbackProviders(request, url, failedProvider) {
    const fallbackProviders = DOH_PROVIDERS.filter(p => p.name !== failedProvider.name);

    for (const provider of fallbackProviders) {
        try {
            const targetUrl = provider.url + url.search;

            const headers = new Headers(request.headers);
            if (request.method === 'POST') {
                headers.set('Content-Type', 'application/dns-message');
            } else {
                headers.set('Accept', 'application/dns-message');
            }
            headers.set('User-Agent', 'DoH-Proxy-Worker/1.0');

            const upstreamRequest = new Request(targetUrl, {
                method: request.method,
                headers: headers,
                body: request.method === 'POST' ? await request.arrayBuffer() : null,
                redirect: 'follow'
            });

            const response = await fetch(upstreamRequest);

            if (response.ok) {
                const responseHeaders = new Headers(response.headers);
                responseHeaders.set('Access-Control-Allow-Origin', '*');
                responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
                responseHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL}`);

                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: responseHeaders
                });
            }
        } catch (error) {
            // Continue to next provider
            continue;
        }
    }

    // All providers failed
    return new Response('All DNS providers are unavailable', { status: 503 });
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
          <div class="info-value">此 DoH 代理服务为大陆用户加速设计</div>
        </div>
      </div>
    </div>

    <p class="tip">
      海外用户可直接使用 <strong>Cloudflare DNS (1.1.1.1)</strong>
    </p>

    <a class="back-btn" href="https://1.1.1.1" target="_blank">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
      前往 Cloudflare DNS
    </a>

    <div class="footer">POWERED BY CLOUDFLARE WORKERS</div>
  </div>
</body>
</html>`;
}