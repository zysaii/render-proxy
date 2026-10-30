const express = require('express');
const axios = require('axios');

const app = express();

// ---------------- 路线 1：原有的 qd.je 地址 ----------------
app.get(['/v1', '/v1/*'], async (req, res) => {
  const TARGET_BASE = 'https://cdn.qd.je';
  const subPath = req.path.replace(/^\/v1/, '');
  const finalPath = (subPath === '/' || subPath === '') ? '/163189/fct2' : subPath;
  await forwardStream(req, res, `${TARGET_BASE}${finalPath}`, 'https://cdn.qd.je/');
});

// ---------------- 路线 2：m3u8 直播流地址 ----------------
// 处理 /v2 入口（如 /v2, /v2/index.m3u8, /v2/chunk_xxx.ts）
app.get(['/v2', '/v2/*'], async (req, res) => {
  const TARGET_BASE = 'http://183.239.108.37:1698';
  let subPath = req.path.replace(/^\/v2/, '');
  
  // 如果直接访问 /v2，则默认拉取 /hls/92/index.m3u8
  if (subPath === '/' || subPath === '') {
    subPath = '/hls/92/index.m3u8';
  }

  // 拼接源站真实地址
  const targetUrl = `${TARGET_BASE}${subPath}`;

  // 如果请求的是 m3u8 播放列表文件，进行内容重写（给切片补齐 /v2 路径）
  if (subPath.endsWith('.m3u8')) {
    try {
      const response = await axios.get(targetUrl, {
        headers: {
          'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
          'Referer': 'http://183.239.108.37:1698/'
        },
        timeout: 10000,
        responseType: 'text' // 拿到文本内容
      });

      let m3u8Content = response.data;

      // 提取当前 m3u8 所在的父目录路径，例如 "/hls/92/"
      const lastSlashIndex = subPath.lastIndexOf('/');
      const basePath = lastSlashIndex !== -1 ? subPath.substring(0, lastSlashIndex + 1) : '/';

      // 将每一行非注释的切片地址重写为带 /v2 的完整相对路径
      const lines = m3u8Content.split('\n');
      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        // 如果是有效文件名且不是注释
        if (trimmed && !trimmed.startsWith('#')) {
          if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            return trimmed;
          }
          // 如果是以 / 开头的绝对路径，拼上 /v2
          if (trimmed.startsWith('/')) {
            return `/v2${trimmed}`;
          }
          // 如果是相对当前目录的切片名，拼上 /v2 + 当前目录
          return `/v2${basePath}${trimmed}`;
        }
        return line;
      });

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(rewrittenLines.join('\n'));
    } catch (e) {
      return res.status(502).json({ error: 'Failed to fetch M3U8', details: e.message });
    }
  }

  // 其他静态切片（.ts 等）走流式转发
  await forwardStream(req, res, targetUrl, 'http://183.239.108.37:1698/');
});

// ---------------- 兜底防错路由 ----------------
// 专门捕获由于部分特殊播放器没有带上 /v2 而直接打向根目录的切片文件（如 /chunk_45636.ts）
app.get(['*.ts', '*/chunk_*', '/hls/*'], async (req, res) => {
  const TARGET_BASE = 'http://183.239.108.37:1698';
  // 如果请求没有带 /hls/92，尝试直接代理到源站对应的完整路径
  const fetchUrl = req.path.startsWith('/hls/') 
    ? `${TARGET_BASE}${req.path}` 
    : `${TARGET_BASE}/hls/92${req.path}`;
  await forwardStream(req, res, fetchUrl, 'http://183.239.108.37:1698/');
});

// 根目录默认依然给路线 1（原 qd.je 内容）
app.get('/', async (req, res) => {
  await forwardStream(req, res, 'https://cdn.qd.je/163189/fct2', 'https://cdn.qd.je/');
});

// 通用流式传输转发函数
async function forwardStream(req, res, targetUrl, referer) {
  try {
    const response = await axios({
      method: 'GET',
      url: targetUrl,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Referer': referer,
        'Accept': '*/*'
      },
      timeout: 15000,
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
    res.status(502).json({ error: 'Proxy Fetch Failed', target: targetUrl, details: error.message });
  }
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
