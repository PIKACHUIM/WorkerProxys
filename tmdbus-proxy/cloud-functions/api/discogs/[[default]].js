const DISCOGS_BASE_URL = 'https://api.discogs.com';

// 创建缓存对象
const cache = new Map();
// 缓存过期时间（10分钟）
const CACHE_DURATION = 10 * 60 * 1000;
// 最大缓存条目数
const MAX_CACHE_SIZE = 1000;

// 缓存清理函数
function cleanExpiredCache() {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
        if (now > value.expiry) {
            cache.delete(key);
        }
    }
}

// 检查缓存大小并清理最旧的条目
function checkCacheSize() {
    if (cache.size > MAX_CACHE_SIZE) {
        const entries = Array.from(cache.entries());
        entries.sort((a, b) => a[1].expiry - b[1].expiry);

        const deleteCount = cache.size - MAX_CACHE_SIZE;
        entries.slice(0, deleteCount).forEach(([key]) => cache.delete(key));

        console.log(`[Discogs Proxy] 清理了 ${deleteCount} 条过期缓存`);
    }
}

// CORS 响应头
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, User-Agent',
};

/**
 * 处理所有 HTTP 请求（GET, POST, OPTIONS 等）
 * 路由: /api/discogs/*  ->  代理到 https://api.discogs.com/*
 */
export default async function onRequest(context) {
    const { request } = context;

    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: corsHeaders,
        });
    }

    try {
        // 从请求 URL 中提取 Discogs API 路径
        const url = new URL(request.url);
        // 去掉 /api/discogs 前缀，保留后面的 Discogs API 路径和查询参数
        const pathname = url.pathname.replace(/^\/api\/discogs/, '') || '/';
        const discogsPath = pathname + url.search;

        // 缓存键使用请求路径（含查询参数）
        const cacheKey = discogsPath;

        // 定期清理过期缓存
        cleanExpiredCache();

        // 检查缓存（仅 GET 请求使用缓存）
        if (request.method === 'GET' && cache.has(cacheKey)) {
            const cachedData = cache.get(cacheKey);
            if (Date.now() < cachedData.expiry) {
                console.log('[Discogs Proxy] 缓存命中:', discogsPath);
                return new Response(JSON.stringify(cachedData.data), {
                    status: 200,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json; charset=UTF-8',
                        'X-Cache': 'HIT',
                    },
                });
            } else {
                cache.delete(cacheKey);
            }
        }

        // 构建 Discogs 请求 URL
        const discogsUrl = `${DISCOGS_BASE_URL}${discogsPath}`;

        // 构建请求配置
        const fetchOptions = {
            method: request.method,
            headers: {},
        };

        // 转发 Authorization header
        const authHeader = request.headers.get('Authorization');
        if (authHeader) {
            fetchOptions.headers['Authorization'] = authHeader;
        }

        // Discogs API 要求 User-Agent header
        const userAgent = request.headers.get('User-Agent');
        fetchOptions.headers['User-Agent'] = userAgent || 'DiscogsProxy/1.0';

        // 如果是 POST/PUT/PATCH 请求，转发请求体
        if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
            fetchOptions.body = await request.text();
            const contentType = request.headers.get('Content-Type');
            if (contentType) {
                fetchOptions.headers['Content-Type'] = contentType;
            }
        }

        // 发送请求到 Discogs
        const response = await fetch(discogsUrl, fetchOptions);
        const data = await response.json();

        // 只有 GET 请求且响应状态码为 200 时才缓存
        if (request.method === 'GET' && response.status === 200) {
            checkCacheSize();

            cache.set(cacheKey, {
                data: data,
                expiry: Date.now() + CACHE_DURATION,
            });
            console.log('[Discogs Proxy] 缓存未命中，已存储:', discogsPath);
        }

        // 返回响应
        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Cache': 'MISS',
            },
        });
    } catch (error) {
        console.error('[Discogs Proxy] API 错误:', error.message);
        return new Response(
            JSON.stringify({
                error: error.message,
                details: error.cause || null,
            }),
            {
                status: 500,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json; charset=UTF-8',
                },
            }
        );
    }
}
