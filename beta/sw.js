// Monter ce numero a CHAQUE modification d'index.html/app.js/data.js : sinon
// sw.js ne change pas, le navigateur ne redetecte aucune mise a jour, et le
// telephone sert l'ancienne version indefiniment.
var CACHE = 'hs-stock-beta-v2';
var ASSETS = ['./', './index.html', './app.js', './data.js', './photos.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
// Les images produit (img/*.webp) ne sont PAS prechargees : 205 fichiers, 1,8 Mo.
// Le gestionnaire fetch ci-dessous les met en cache au fur et a mesure qu'elles
// s'affichent, donc elles restent disponibles hors-ligne une fois vues.

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    // BETA : ne supprime QUE ses propres caches, sinon elle effacerait celui
    // de l'app en service (et reciproquement) sur un telephone qui a les deux.
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k.indexOf('hs-stock-beta-') === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      });
    }).catch(function () { return caches.match('./index.html'); })
  );
});
