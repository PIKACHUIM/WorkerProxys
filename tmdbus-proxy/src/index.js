const TMDB_BASE_URL = 'https://api.themoviedb.org';

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
        console.log(`Cleaned ${deleteCount} old cache entries`);
    }
}

// 构建 CORS 响应头
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

async function handleRequest(request) {
    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: corsHeaders(),
        });
    }

    try {
        const url = new URL(request.url);
        const fullPath = url.pathname + url.search;
        const authHeader = request.headers.get('Authorization');

        // 定期清理过期缓存
        cleanExpiredCache();

        // 缓存键使用请求路径
        const cacheKey = fullPath;

        // 检查缓存
        if (cache.has(cacheKey)) {
            const cachedData = cache.get(cacheKey);
            if (Date.now() < cachedData.expiry) {
                console.log('Cache hit:', fullPath);
                return new Response(JSON.stringify(cachedData.data), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders(),
                    },
                });
            } else {
                cache.delete(cacheKey);
            }
        }

        // 构建 TMDB 请求 URL
        const tmdbUrl = `${TMDB_BASE_URL}${fullPath}`;

        // 构建请求头
        const headers = {};
        if (authHeader) {
            headers['Authorization'] = authHeader;
        }

        // 发送请求到 TMDB
        const response = await fetch(tmdbUrl, {
            method: request.method,
            headers: headers,
        });

        const responseData = await response.json();

        // 只有响应状态码为 200 时才缓存
        if (response.status === 200) {
            checkCacheSize();
            cache.set(cacheKey, {
                data: responseData,
                expiry: Date.now() + CACHE_DURATION,
            });
            console.log('Cache miss and stored:', fullPath);
        } else {
            console.log('Response not cached due to non-200 status:', response.status);
        }

        // 返回响应
        return new Response(JSON.stringify(responseData), {
            status: response.status,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders(),
            },
        });
    } catch (error) {
        console.error('TMDB API error:', error);
        return new Response(
            JSON.stringify({
                error: error.message,
            }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders(),
                },
            }
        );
    }
}

export default {
    async fetch(request, env, ctx) {
        return handleRequest(request);
    },
};
