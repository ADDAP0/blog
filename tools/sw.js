/* ===================================================
   写作后台的 Service Worker

   它只干一件事：让浏览器把这个地址当成「可安装的应用」。

   刻意不缓存任何东西。原因有两个：
     1. 后台的页面和脚本改得很勤，一旦缓存就容易看到旧版本，
        改完发现没生效、查半天，这种坑不值得踩
     2. 离线缓存对这个工具没意义 —— 本地服务不跑的话，
        页面再完整也读不到数据，照样什么都干不了

   所以这里只保留一个「什么都不拦」的 fetch 监听，
   满足可安装性的要求即可。
   =================================================== */

self.addEventListener('install', function () {
  /* 有新版本就立刻接管，别卡在 waiting */
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

/* 可安装性要求存在 fetch 监听。这里一律放行，交给网络。 */
self.addEventListener('fetch', function () {
  /* 故意留空：不拦截、不缓存、不改写任何请求 */
});
