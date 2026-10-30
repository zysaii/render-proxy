const express = require('express');
const axios = require('axios');

const app = express();

// 通用代理转发函数
async function forwardRequest(req, res, targetUrl, refererHost) {
  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': refererHost,
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

// ---------------- 路线 1：原有的 qd.je 地址 ----------------
// 访问 /v1 或 根路径 / 时调用
app.get(['/', '/v1', '/v1/*'], async (req, res) => {
  const TARGET_BASE = 'https://cdn.qd.je';
  // 截掉 /v1 前缀
  const subPath = req.path.replace(/^\/v1/, '');
  const finalPath = (subPath === '/' || subPath === '') ? '/163189/fct2' : subPath;
  
  await forwardRequest(req, res, `${TARGET_BASE}${finalPath}`, 'https://cdn.qd.je/');
});

// ---------------- 路线 2：第二个 m3u8 直播流地址 ----------------
// 访问 /v2 时调用
app.get(['/v2', '/v2/*'], async (req, res) => {
  const TARGET_BASE = 'http://183.239.108.37:1698';
  // 截掉 /v2 前缀
  const subPath = req.path.replace(/^\/v2/, '');
  const finalPath = (subPath === '/' || subPath === '') ? '/hls/92/index.m3u8' : subPath;
  
  await forwardRequest(req, res, `${TARGET_BASE}${finalPath}`, 'http://183.239.108.37:1698/');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
