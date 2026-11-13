// Service worker: torna a Flashteca instalável e faz a interface abrir sem internet.
// Os jogos e catálogos vêm do archive.org e precisam de conexão; só os arquivos do site ficam guardados.
importScripts("js/versao.js");
const CACHE = "flashteca-v" + self.VERSAO;
const BASE = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/archive.js",
  "js/catalogo.js",
  "js/toque.js",
  "js/versao.js",
  "data/discos.json",
  "manifest.webmanifest",
  "img/icone.svg",
  "img/icone-16.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  // cache: "reload" ignora o cache HTTP do navegador, para nunca guardar arquivo velho
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(BASE.map((u) => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Arquivos do próprio site: rede primeiro (revalidada, então atualizações aparecem na hora),
// e a cópia guardada quando não há internet ou a rede demora mais de 3 s.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const guardada = () => cache.match(req, { ignoreSearch: true })
      .then((r) => r || (req.mode === "navigate" ? cache.match("index.html") : null));
    const rede = fetch(req, { cache: "no-cache" }).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; });
    const limite = new Promise((ok) => setTimeout(ok, 3000, null));
    try {
      return (await Promise.race([rede, limite])) || (await guardada()) || (await rede);
    } catch {
      return (await guardada()) || new Response("", { status: 504 });
    }
  }));
});
