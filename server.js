const express = require('express');
const axios = require('axios');

const app = express();

// 通用流式转发函数
async function forwardRequest(req, res, targetUrl, refererHost) {
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

// ---------------- 路线 0：通用动态 IPTV 代理路由 ----------------
// 客户端请求格式：
// 1. https://your-render.onrender.com/proxy?url=http://...
// 2. https://your-render.onrender.com/proxy/http://... 或 /proxy/https://...
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

    await forwardRequest(req, res, targetUrl, refererHost);
});

// ---------------- 路线 1：qd.je 地址 ----------------
// 访问 / 或 /v1
app.get(['/', '/v1', '/v1/*'], async (req, res) => {
    // 根目录无路径时提示状态
    if (req.path === '/' && !req.query.url) {
        return res.send('Render IPTV Proxy is Running. Usage: /proxy?url=&lt;m3u8_url&gt;');
    }
    const TARGET_BASE = 'https://cdn.qd.je';
    const subPath = req.path.replace(/^\/v1/, '');
    const finalPath = (subPath === '/' || subPath === '') ? '/163189/fct2' : subPath;

    await forwardRequest(req, res, `${TARGET_BASE}${finalPath}`, 'https://cdn.qd.je/');
});

// ---------------- 路线 2：hidns.vip 地址 ----------------
// 1. 访问 /v2 入口
app.get(['/v2', '/v2/*'], async (req, res) => {
    const TARGET_BASE = 'https://10.fast.hidns.vip';
    const subPath = req.path.replace(/^\/v2/, '');
    const finalPath = (subPath === '/' || subPath === '') ? '/163189/fct/' : subPath;

    await forwardRequest(req, res, `${TARGET_BASE}${finalPath}`, 'https://10.fast.hidns.vip/');
});

// 2. 核心修复：捕获播放器脱离 /v2 直接向根目录请求的 /163189/* 相关切片与脚本！
app.get(['/163189', '/163189/*'], async (req, res) => {
    const TARGET_BASE = 'https://10.fast.hidns.vip';
    const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const targetUrl = `${TARGET_BASE}${req.path}${search}`;

    await forwardRequest(req, res, targetUrl, 'https://10.fast.hidns.vip/');
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

    await forwardRequest(req, res, targetUrl, 'http://php.jdshipin.com/');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
