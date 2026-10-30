const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// 1. 更新目标站点为新的 HTTPS 地址
const TARGET_ORIGIN = 'https://cdn.qd.je';
const DEFAULT_PATH = '/163189/fct2';

// 2. 当用户直接访问 Render 域名根目录时，自动重定向/重写到新路径
app.use((req, res, next) => {
  if (req.url === '/' || req.url === '') {
    req.url = DEFAULT_PATH;
  }
  next();
});

// 3. 配置反向代理
app.use('/', createProxyMiddleware({
  target: TARGET_ORIGIN,
  changeOrigin: true,
  secure: false, // 避免目标证书链不严谨引发报错
  onProxyReq: (proxyReq) => {
    // 伪装请求头
    proxyReq.setHeader('Host', 'cdn.qd.je');
    proxyReq.setHeader('Referer', 'https://cdn.qd.je/');
  }
}));

// Render 默认端口兼容
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Proxy listening on port ${PORT}`);
});
