// PLAZA Service Worker — בסיסי: cache-first לסטטיים, network-first ל-API
const CACHE = 'plaza-v1';
const STATIC = ['/', '/login.html', '/admin', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(()=>{})));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // לעולם לא לקאש API או socket.io — תמיד טרי
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/') || url.pathname.startsWith('/uploads/')) {
    return;  // הדפדפן מטפל ישירות
  }

  // קבצים סטטיים — cache-first עם רענון ברקע
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(resp => {
        if (resp && resp.status === 200 && e.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Push notifications (לעתיד)
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'PLAZA', body: 'התראה חדשה' };
  e.waitUntil(self.registration.showNotification(data.title || 'PLAZA', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'he'
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow('/'));
});
