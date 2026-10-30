const express = require('express');
const axios = require('axios');

const app = express();

const TARGET_URL = 'https://cdn.qd.je/163189/fct2';

// 捕获所有请求
app.get('*', async (req, res) => {
  try {
    // 如果用户访问的是根路径，代理到目标地址；如果带了子路径则拼接
    const fetchUrl = (req.path === '/' || req.path === '')
      ? TARGET_URL
      : `https://cdn.qd.je${req.path}`;

    const response = await axios({
      method: req.method,
      url: fetchUrl,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://cdn.qd.je/',
        'Accept': '*/*'
      },
      // 允许跟随重定向，最多跳转 5 次
      maxRedirects: 5,
      // 使用流模式输出，避免大文件或视频流占用内存
      responseType: 'stream',
      validateStatus: () => true // 允许所有状态码通过
    });

    // 允许跨域，方便播放器调用
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    // 复制源站的内容类型响应头（如 text/plain、application/vnd.apple.mpegurl 等）
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }

    // 状态码透传
    res.status(response.status);

    // 将内容以流管道传输给客户端
    response.data.pipe(res);

  } catch (error) {
    res.status(502).json({
      error: 'Proxy Fetch Failed',
      message: error.message
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
