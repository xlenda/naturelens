// NatureLens service worker: offline support + Web Push.
//
// OFFLINE STRATEGY - the reasoning matters more than the code here.
//
// An earlier version of this file deliberately did NO caching, because a naive
// cache-first worker serves a stale app that users cannot clear. That concern
// is real, so the strategy below is split by what the resource actually is:
//
//   * App shell + hashed bundles -> cache-first. Their filenames contain a
//     content hash (AppEntry-<hash>.js), so a new build produces a NEW url.
//     There is no such thing as a stale hit: the old file is simply never
//     requested again.
//   * index.html -> network-first. It is the ONE unhashed file, the one that
//     points at the current bundle. Serving a stale copy would pin the app to
//     a deleted bundle - a blank screen with no way out. Cache is fallback only.
//   * Locale + species JSON -> stale-while-revalidate. Content that changes
//     occasionally and is useless to block on: serve what we have instantly,
//     refresh in the background for next time.
//   * Everything else, /api/ above all -> network only. An identification is a
//     paid API call against live credits; a cached answer would be a lie.
//
// Bump CACHE_VERSION to evict everything on the next activate.
const CACHE_VERSION = 'naturelens-v3';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        // Best-effort: a failed precache must never block activation, or a
        // single 404 would leave the app with no worker at all.
        cache.addAll(['/', '/icons/icon-192.png']).catch(() => {})
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isHashedAsset(url) {
  // Expo emits content-hashed filenames; a hash in the name means immutable.
  return /\/_expo\/static\//.test(url.pathname) || /\.[a-f0-9]{8,}\.(js|css|ttf|png|jpg|svg)$/.test(url.pathname);
}

function isContentJson(url) {
  return /^\/locales\/.+\.json$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch other origins or the API. Caching a paid identification, a
  // subscription status or a webhook would be actively wrong.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // 1. Immutable, hashed assets: cache-first.
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // 2. Locale JSON: REDE PRIMEIRO, cache so como rede de seguranca offline.
  //
  // Era stale-while-revalidate, e isso entregava o locale ANTIGO na primeira
  // sessao depois de todo deploy: o bundle novo pedia uma chave que o JSON
  // velho ainda nao tinha e a tela mostrava o nome cru da chave
  // ("detail.aboutSpecies" no lugar do titulo). O dono viu isso na pratica.
  // A revalidacao so ajudava na sessao SEGUINTE - tarde demais.
  //
  // Vale para TUDO em /locales/, sem lista de sufixos. Uma lista assim ja
  // quebrou tres vezes aqui: toda vez que nasce um tipo novo de conteudo
  // (-manual, -groups, -schedule) alguem esquece de atualizar a lista. Os
  // arquivos pesados de conteudo ja tem cache proprio em memoria e
  // AsyncStorage (manualContent.js, groupContent.js, scheduleContent.js),
  // entao a camada do service worker era redundante para eles de qualquer
  // jeito - o custo de tirar a esperteza daqui e praticamente zero.
  if (isContentJson(url)) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch (e) {
          // Offline: a copia velha e melhor que tela em branco. E o unico
          // caso em que servir conteudo desatualizado e a resposta certa.
          const hit = await cache.match(request);
          return hit || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
        }
      })
    );
    return;
  }

  // 3. Navigations (index.html): network-first, cache as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((c) => c.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/').then((hit) => hit || Response.error()))
    );
  }
});

// --- Web Push ---------------------------------------------------------------
// Works on Android/Chrome in a normal tab, and on iOS 16.4+ ONLY when the PWA
// has been added to the home screen.

self.addEventListener('push', (event) => {
  // A push with no readable payload still deserves a notification: on several
  // platforms a "silent" push counts against the origin's budget and can get
  // push permission revoked entirely.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }

  const title = data.title || 'NatureLens';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    // Same tag replaces an older notification of the same kind instead of
    // stacking three streak reminders on the lock screen.
    tag: data.tag || 'naturelens',
    data: { url: data.url || '/' },
    lang: data.lang || 'pt-BR',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  // Focus an already-open tab instead of opening a second one - a reminder
  // that spawns a duplicate app window is worse than no reminder.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
