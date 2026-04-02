const your_domain = this['HOME_DOMAIN'] || ''

//返回html时的替换字典
const replace_dicts = {
    'integrity="sha': 'integrity_no="sha' // 去掉完整性校验
}
// 域名指向的路径
const req_dicts = {}
let domain_pair_list = []
function init(domain) {
    domain_pair_list = [
        [`${domain}`, 'github.com'],
        [`api.${domain}`, 'api.github.com'],
        [`gist.${domain}`, 'gist.github.com'],
        [`gist-notebooks.${domain}`, 'notebooks.githubusercontent.com'],
        [`gist-ucontent.${domain}`, 'gist.githubusercontent.com'],
        [`raw.${domain}`, 'raw.githubusercontent.com'],
        [`assets.${domain}`, 'github.githubassets.com'],
        [`avatars.${domain}`, 'avatars.githubusercontent.com'],
        [`camo.${domain}`, 'camo.githubusercontent.com'],
        [`codeload.${domain}`, 'codeload.github.com'],
        [`releases.${domain}`, 'github-releases.githubusercontent.com'],
        [`object.${domain}`, 'objects.githubusercontent.com'],
    ]
    domain_pair_list.forEach(pair => {
        replace_dicts['//' + pair[1]] = '//' + pair[0]
        req_dicts[pair[0]] = pair[1]
    })
}

// 透明代理cookies：将set-cookie中的域名替换为代理域名，以支持登录
function modifyCookies(headers) {
    headers.forEach((value, key) => {
        if (key == 'set-cookie') {
            let new_value = value.replaceAll('domain=.github.com', `domain=.${your_domain}`)
            new_value = new_value.replaceAll('domain=github.com', `domain=${domain_pair_list[0][0]}`)
            headers.set(key, new_value)
        }
    });
}

async function fetchAndStream(request, url) {
    // 判断是否为大陆地区访问，非大陆地区重定向到对应的GitHub原始域名 ===================================================
    const country = request.cf.country; // 获取用户所在国家代码
    if (country !== "CN") {
        const target_host = req_dicts[url.hostname] || 'github.com'
        const original_url = new URL(url)
        original_url.host = target_host
        original_url.protocol = 'https:'
        return Response.redirect(original_url.href, 302)
    }

    // 如果path是 /robots.txt ========================================================================================
    if (url.pathname === '/robots.txt') {
        const content = `User-agent: * \nDisallow: /`
        return new Response(content, { headers: { "Content-Type": 'text/plain' }, status: 200 })
    }
    // 如果hostname不在表里，重定向到 git.`${your_domain}` ===========================================================
    if (!req_dicts[url.hostname]) {
        return new Response(url.hostname, { headers: {
                "Location": `https://${domain_pair_list[0][0]}${url.pathname}${url.search}`
            }, status: 302 })
    }
    // 如果path是 /login =============================================================================================
    // if (url.pathname === '/login') {
    //   // return new Response(login_html, { headers: { "Content-Type": 'text/html; charset=utf-8' }, status: 200 });
    //   return Response.redirect("https://github.com/login", 301);
    // }
    const hostname = url.hostname;
    const modifiedRequest = modifyRequest(request)
    let response = await fetch(modifiedRequest)
    var new_response
    // 分情况返回
    const content_type = response.headers.get('content-type')?.toLowerCase();
    if (content_type != null && content_type.includes('text/html') && content_type.includes('utf-8')) {
        //console.log('返回内容进行相应替换')
        // 如果是text/html，那么将域名文本进行替换
        let origin_text = await response.text()
        const new_text = replaceText(origin_text)
        new_response = new Response(new_text, response)
    } else {
        // 如果不是，直接返回
        //console.log('返回内容未作修改')
        new_response = new Response(response.body, response)
    }
    // 对headers进行修饰
    new_response.headers.set('access-control-allow-origin', '*');
    new_response.headers.set('access-control-allow-credentials', 'true');
    new_response.headers.delete('content-security-policy');
    new_response.headers.delete('content-security-policy-report-only');
    new_response.headers.delete('clear-site-data');
    // 对301/302 重定向进行修饰, 并防止死循环
    if (new_response.headers.has('location')) {
        let location = new_response.headers.get('location')
        const url_location = new URL(location);
        //console.log(hostname, url_location.hostname)
        if (hostname != url_location.hostname) {
            location = replaceText(location)
            new_response.headers.set('location', location)
        }
    }
    // 对p-jax进行替换
    if (new_response.headers.has("x-pjax-url")) {
        let location = new_response.headers.get("x-pjax-url")
        location = replaceText(location)
        new_response.headers.set("x-pjax-url", location)
    }

    // 透明代理cookie，支持登录
    modifyCookies(new_response.headers)
    return new_response
}

function replaceText(origin_text) {
    for (const old in replace_dicts) {
        let re = new RegExp(old, 'g')
        origin_text = origin_text.replace(re, replace_dicts[old]);
        //console.log(`将${old}替换为${replace_dicts[old]}` )
    }
    return origin_text
}
function modifyRequest(request) {
    // 获取当前信息
    const url = new URL(request.url);
    const hostname = url.hostname;
    // 修改url
    const new_url = new URL(request.url);
    new_url.hostname = req_dicts[hostname]
    // 修改headers Host\Referer\Origin
    const new_request_headers = new Headers(request.headers)
    new_request_headers.set('Host', new_url.hostname);
    if (request.headers.has('referer')) {
        const referer = request.headers.get('referer');
        const refererNew = referer.replaceAll(hostname, new_url.hostname);
        new_request_headers.set('Referer', refererNew);
    }
    if (request.headers.has('Alt-Used')) {
        const referer = request.headers.get('Alt-Used');
        const refererNew = referer.replaceAll(hostname, new_url.hostname);
        new_request_headers.set('Alt-Used', refererNew);
    }
    if (request.headers.has('origin')) {
        const origin = request.headers.get('origin');
        const originNew = origin.replaceAll(hostname, new_url.hostname);
        new_request_headers.set('Origin', originNew);
    }
    new_request_headers.delete('x-forwarded-proto')
    //new_request_headers.forEach( (value, key) => {
    //console.log(`${key} => ${value}`)
    //})
    const modifiedRequest = new Request(new_url.href, {
        body: request.body,
        headers: new_request_headers,
        method: request.method,
        redirect: request.redirect
    })
    return modifiedRequest
}

init(your_domain)
addEventListener("fetch", event => {
    const url = new URL(event.request.url)
    event.respondWith(fetchAndStream(event.request, url))
})