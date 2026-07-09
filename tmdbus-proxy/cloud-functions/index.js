/**
 * API 代理服务首页
 * 路由: /
 * 展示所有可用的 API 代理说明
 */
export default function onRequest(context) {
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Proxy Service</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
            color: #e0e0e0;
            min-height: 100vh;
            padding: 40px 20px;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        h1 {
            text-align: center;
            font-size: 2.5rem;
            margin-bottom: 10px;
            background: linear-gradient(90deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle {
            text-align: center;
            color: #888;
            margin-bottom: 40px;
            font-size: 1.1rem;
        }
        .api-card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 24px;
            backdrop-filter: blur(10px);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .api-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 32px rgba(102, 126, 234, 0.15);
        }
        .api-card h2 {
            font-size: 1.5rem;
            margin-bottom: 8px;
            color: #fff;
        }
        .api-card .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-bottom: 16px;
        }
        .badge-tmdb {
            background: rgba(1, 180, 228, 0.2);
            color: #01b4e4;
            border: 1px solid rgba(1, 180, 228, 0.3);
        }
        .badge-discogs {
            background: rgba(255, 136, 0, 0.2);
            color: #ff8800;
            border: 1px solid rgba(255, 136, 0, 0.3);
        }
        .api-card p {
            color: #aaa;
            line-height: 1.6;
            margin-bottom: 16px;
        }
        .endpoint {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
        }
        .endpoint-title {
            font-size: 0.85rem;
            color: #888;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .endpoint-url {
            font-family: 'SF Mono', 'Fira Code', monospace;
            font-size: 0.9rem;
            color: #7dd3fc;
            word-break: break-all;
        }
        .example {
            background: rgba(0, 0, 0, 0.4);
            border-radius: 8px;
            padding: 16px;
            margin-top: 16px;
            overflow-x: auto;
        }
        .example-title {
            font-size: 0.8rem;
            color: #888;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .example code {
            font-family: 'SF Mono', 'Fira Code', monospace;
            font-size: 0.85rem;
            color: #a5f3c4;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-top: 40px;
        }
        .feature-item {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
        }
        .feature-item .icon {
            font-size: 2rem;
            margin-bottom: 10px;
        }
        .feature-item h3 {
            font-size: 1rem;
            color: #fff;
            margin-bottom: 6px;
        }
        .feature-item p {
            font-size: 0.85rem;
            color: #888;
        }
        .footer {
            text-align: center;
            margin-top: 50px;
            color: #555;
            font-size: 0.85rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 API Proxy Service</h1>
        <p class="subtitle">高性能 API 代理服务，支持缓存与 CORS 跨域</p>

        <div class="api-card">
            <h2>TMDB API 代理</h2>
            <span class="badge badge-tmdb">The Movie Database</span>
            <p>代理 TMDB（The Movie Database）API，提供电影、电视剧、演员等影视信息查询服务。</p>
            <div class="endpoint">
                <div class="endpoint-title">代理路径</div>
                <div class="endpoint-url">/api/tmdb/{TMDB_API_PATH}</div>
            </div>
            <div class="endpoint">
                <div class="endpoint-title">目标地址</div>
                <div class="endpoint-url">https://api.themoviedb.org/{TMDB_API_PATH}</div>
            </div>
            <div class="example">
                <div class="example-title">请求示例</div>
                <code>curl -H "Authorization: Bearer YOUR_TMDB_TOKEN" \\
  https://your-domain/api/tmdb/3/movie/popular?language=zh-CN

curl -H "Authorization: Bearer YOUR_TMDB_TOKEN" \\
  https://your-domain/api/tmdb/3/search/movie?query=inception&language=zh-CN</code>
            </div>
        </div>

        <div class="api-card">
            <h2>Discogs API 代理</h2>
            <span class="badge badge-discogs">Discogs Music Database</span>
            <p>代理 Discogs API，提供音乐专辑、艺术家、厂牌等音乐数据库查询服务。</p>
            <div class="endpoint">
                <div class="endpoint-title">代理路径</div>
                <div class="endpoint-url">/api/discogs/{DISCOGS_API_PATH}</div>
            </div>
            <div class="endpoint">
                <div class="endpoint-title">目标地址</div>
                <div class="endpoint-url">https://api.discogs.com/{DISCOGS_API_PATH}</div>
            </div>
            <div class="example">
                <div class="example-title">请求示例</div>
                <code>curl -H "Authorization: Discogs token=YOUR_TOKEN" \\
  https://your-domain/api/discogs/database/search?q=nirvana&type=artist

curl -H "Authorization: Discogs token=YOUR_TOKEN" \\
  https://your-domain/api/discogs/releases/249504</code>
            </div>
        </div>

        <div class="features">
            <div class="feature-item">
                <div class="icon">⚡</div>
                <h3>内存缓存</h3>
                <p>10 分钟缓存，最多 1000 条，自动清理过期数据</p>
            </div>
            <div class="feature-item">
                <div class="icon">🌐</div>
                <h3>CORS 跨域</h3>
                <p>默认允许所有来源跨域访问，支持 OPTIONS 预检</p>
            </div>
            <div class="feature-item">
                <div class="icon">🔑</div>
                <h3>认证透传</h3>
                <p>自动转发 Authorization Header 到目标 API</p>
            </div>
            <div class="feature-item">
                <div class="icon">📦</div>
                <h3>全方法支持</h3>
                <p>支持 GET / POST / PUT / PATCH / DELETE 请求</p>
            </div>
        </div>

        <div class="footer">
            <p>Powered by EdgeOne Pages · Node.js Cloud Functions</p>
        </div>
    </div>
</body>
</html>`;

    return new Response(html, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=UTF-8',
        },
    });
}
