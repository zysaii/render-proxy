const express = require('express');
const axios = require('axios');
const { URL } = require('url');

const app = express();

// 通用流式转发函数（用于 ts 切片、普通视频流或非 m3u8 请求）
async function forwardStream(req, res, targetUrl, refererHost) {
    try {
        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers: {
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': refererHost || targetUrl,
                'Accept': '*/*'
            },
            timeout: 15000,
            maxRedirects: 5,
            responseType: 'stream',
            validateStatus: () => true
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }

        res.status(response.status);
        response.data.pipe(res);
    } catch (error) {
        res.status(502).json({
            error: 'Proxy Fetch Failed',
            target: targetUrl,
            message: error.message
        });
    }
}

// 核心重写函数：将 M3U8 内的所有相对路径和绝对路径，全部改写为经过当前 Render 代理的地址
function rewriteM3U8(content, baseUrl, proxyHost) {
    const lines = content.split(/\r?\n/);
    const rewritten = lines.map(line => {
        const trimmed = line.trim();
        // 忽略空行
        if (!trimmed) return line;

        // 处理 URI 属性标签（例如 #EXT-X-KEY:METHOD=AES-128,URI="enc.key"）
        if (trimmed.startsWith('#EXT-X-KEY') || trimmed.startsWith('#EXT-X-MAP')) {
            return line.replace(/URI="([^"]+)"/, (match, uri) => {
                const absolute = new URL(uri, baseUrl).toString();
                const proxied = `${proxyHost}/proxy?url=${encodeURIComponent(absolute)}`;
                return `URI="${proxied}"`;
            });
        }

        // 普通注释和标签行，直接保留
        if (trimmed.startsWith('#')) {
            return line;
        }

        // 媒体切片或子索引播放列表 URL（如 CGNWebLiveJP_4.m3u8 或 seg-1.ts）
        try {
            const absoluteUrl = new URL(trimmed, baseUrl).toString();
            return `${proxyHost}/proxy?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return line;
        }
    });

    return rewritten.join('\n');
}

// ---------------- 路线 0：全能智能流媒体反向代理 /proxy ----------------
// 支持自动解析主播放列表、子播放列表、相对路径切片与密钥
app.get(['/proxy', '/proxy/*'], async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) {
        const rawPath = req.url.replace(/^\/proxy\/?/, '');
        if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
            targetUrl = rawPath;
        }
    }

    if (!targetUrl) {
        return res.status(400).send('Missing target url. Example: /proxy?url=http://example.com/live.m3u8');
    }

    let refererHost = req.headers['referer'] || '';
    try {
        const parsed = new URL(targetUrl);
        refererHost = `${parsed.protocol}//${parsed.host}/`;
    } catch (e) {}

    const proxyHost = `${req.protocol}://${req.get('host')}`;

    try {
        const response = await axios({
            method: 'GET',
            url: targetUrl,
            headers: {
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': refererHost,
                'Accept': '*/*'
            },
            timeout: 15000,
            maxRedirects: 5,
            responseType: 'text',
            validateStatus: () => true
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

        // 智能判断：如果是 M3U8 播放列表文本，动态改写内部所有切片地址
        const isM3U8 = (
            targetUrl.includes('.m3u8') ||
            (typeof response.data === 'string' && response.data.trimStart().startsWith('#EXTM3U')) ||
            (response.headers['content-type'] && response.headers['content-type'].includes('mpegurl'))
        );

        if (isM3U8 && typeof response.data === 'string') {
            const finalBaseUrl = response.request?.res?.responseUrl || targetUrl;
            const rewritten = rewriteM3U8(response.data, finalBaseUrl, proxyHost);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            return res.status(response.status).send(rewritten);
        }

        // 如果不是 M3U8（例如 .ts 切片、.m4s、图片或二进制视频流），走直连流式传输
        return await forwardStream(req, res, targetUrl, refererHost);

    } catch (error) {
        // 请求文本失败时，回退到流式转发尝试
        return await forwardStream(req, res, targetUrl, refererHost);
    }
});

// ---------------- 路线 1：qd.je 地址 ----------------
app.get(['/', '/v1', '/v1/*'], async (req, res) => {
    if (req.path === '/' && !req.query.url) {
        return res.send('Render IPTV Proxy is Running. Usage: /proxy?url=&lt;m3u8_url&gt;');
    }
    const TARGET_BASE = 'https://cdn.qd.je';
    const subPath = req.path.replace(/^\/v1/, '');
    const finalPath = (subPath === '/' || subPath === '') ? '/163189/fct2' : subPath;

    await forwardStream(req, res, `${TARGET_BASE}${finalPath}`, 'https://cdn.qd.je/');
});

// ---------------- 路线 2：hidns.vip 地址 ----------------
app.get(['/v2', '/v2/*'], async (req, res) => {
    const TARGET_BASE = 'https://10.fast.hidns.vip';
    const subPath = req.path.replace(/^\/v2/, '');
    const finalPath = (subPath === '/' || subPath === '') ? '/163189/fct/' : subPath;

    await forwardStream(req, res, `${TARGET_BASE}${finalPath}`, 'https://10.fast.hidns.vip/');
});

app.get(['/163189', '/163189/*'], async (req, res) => {
    const TARGET_BASE = 'https://10.fast.hidns.vip';
    const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const targetUrl = `${TARGET_BASE}${req.path}${search}`;

    await forwardStream(req, res, targetUrl, 'https://10.fast.hidns.vip/');
});

// ---------------- 路线 3：jdshipin PHP 参数地址 ----------------
app.get(['/v3', '/v3/*'], async (req, res) => {
    const subPath = req.path.replace(/^\/v3/, '');
    let targetUrl = '';

    if (subPath === '/' || subPath === '') {
        const queryString = Object.keys(req.query).length > 0
            ? new URLSearchParams(req.query).toString()
            : 'id=fct2';
        targetUrl = `http://php.jdshipin.com/TVOD/iptv.php?${queryString}`;
    } else {
        const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        targetUrl = `http://php.jdshipin.com${subPath}${search}`;
    }

    await forwardStream(req, res, targetUrl, 'http://php.jdshipin.com/');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
