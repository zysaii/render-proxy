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
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': refererHost,
        'Accept': '*/*'
      },
      timeout: 15000,
      maxRedirects: 5,
      responseType: 'stream',
      validateStatus: () => true
    });

    // 允许跨域，方便播放器和前端直接调用
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
// 访问 / 或 /v1
app.get(['/', '/v1', '/v1/*'], async (req, res) => {
  const TARGET_BASE = 'https://cdn.qd.je';
  const subPath = req.path.replace(/^\/v1/, '');
  const finalPath = (subPath === '/' || subPath === '') ? '/163189/fct2' : subPath;
  
  await forwardRequest(req, res, `${TARGET_BASE}${finalPath}`, 'https://cdn.qd.je/');
});

// ---------------- 路线 2：新的 hidns.vip 地址 ----------------
// 目标：https://10.fast.hidns.vip/163189/fct/
app.get(['/v2', '/v2/*'], async (req, res) => {
  const TARGET_BASE = 'https://10.fast.hidns.vip';
  const subPath = req.path.replace(/^\/v2/, '');
  // 如果直接访问 /v2，自动补齐 /163189/fct/
  const finalPath = (subPath === '/' || subPath === '') ? '/163189/fct/' : subPath;
  
  await forwardRequest(req, res, `${TARGET_BASE}${finalPath}`, 'https://10.fast.hidns.vip/');
});

// ---------------- 路线 3：新增的 jdshipin PHP 参数地址 ----------------
// 目标：http://php.jdshipin.com/TVOD/iptv.php?id=fct2
app.get(['/v3', '/v3/*'], async (req, res) => {
  const subPath = req.path.replace(/^\/v3/, '');
  let targetUrl = '';

  // 如果客户端访问的是根 /v3，直接请求目标 PHP 脚本及默认参数
  if (subPath === '/' || subPath === '') {
    // 如果客户端带了自定义参数（如 ?id=xxx），优先使用客户端参数；否则使用默认 id=fct2
    const queryString = Object.keys(req.query).length > 0
      ? new URLSearchParams(req.query).toString()
      : 'id=fct2';
    targetUrl = `http://php.jdshipin.com/TVOD/iptv.php?${queryString}`;
  } else {
    // 如果后续拉取相关切片或子路径，直接代理至对应路径
    const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    targetUrl = `http://php.jdshipin.com${subPath}${search}`;
  }

  await forwardRequest(req, res, targetUrl, 'http://php.jdshipin.com/');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
