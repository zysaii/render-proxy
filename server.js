const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const TARGET = 'http://r.jdshipin.com';

// 访问根路径自动补齐 /qrfbg
app.use((req, res, next) => {
  if (req.url === '/' || req.url === '') {
    req.url = '/qrfbg';
  }
  next();
});

// 反向代理配置
app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  onProxyReq: (proxyReq) => {
    proxyReq.setHeader('Host', 'r.jdshipin.com');
    proxyReq.setHeader('Referer', 'http://r.jdshipin.com/');
  }
}));

// Render 会自动注入 PORT 环境变量，默认使用 process.env.PORT
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
