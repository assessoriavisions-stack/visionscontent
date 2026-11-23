// Service worker da Plataforma de Roteiros Visions: app instalável (PWA) e lembretes por push.
// Um único service worker na raiz (o navegador só aceita um por escopo).
const VERSAO = 'roteiros-v1';
const ESSENCIAIS = ['/', '/index.html', '/manifest.json', '/assets/logo-visions.png', '/assets/icone-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Páginas: rede primeiro (sempre a versão mais nova), cache só se estiver sem internet.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { caches.open(VERSAO).then((c) => c.put('/index.html', r.clone())); return r; }).catch(() => caches.match('/index.html')));
    return;
  }
  if (url.origin === location.origin && url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then((c) => c || fetch(req).then((r) => { const copia = r.clone(); caches.open(VERSAO).then((cc) => cc.put(req, copia)); return r; })));
  }
});

// Push: a function manda só dados; aqui montamos a notificação.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* sem dados */ }
  const dados = d.data || d;
  const titulo = dados.titulo || 'Roteiros Visions';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: dados.texto || '',
    icon: '/assets/icone-192.png',
    badge: '/assets/icone-192.png',
    tag: dados.postId ? `post-${dados.postId}` : undefined,
    data: { postId: dados.postId || '' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const postId = e.notification.data?.postId;
  const destino = new URL(postId ? `/?post=${encodeURIComponent(postId)}` : '/', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
    for (const a of abas) {
      if (new URL(a.url).origin === location.origin) { a.navigate(destino); return a.focus(); }
    }
    return self.clients.openWindow(destino);
  }));
});
