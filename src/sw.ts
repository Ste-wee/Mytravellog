/// <reference lib="webworker" />
// Service worker della PWA, compilato da vite-plugin-pwa (injectManifest).
// Sostituisce il vecchio public/sw.js scritto a mano, che cacheava solo ciò
// che veniva visitato: le pagine lazy mai aperte (es. In programma) offline
// non si caricavano. Qui la build inietta in __WB_MANIFEST l'elenco COMPLETO
// degli asset (chunk lazy e font inclusi) e il precache li scarica subito.
import { precache, addRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import type { PrecacheEntry } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { clientsClaim } from "workbox-core";

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> };

self.skipWaiting();
clientsClaim();

// precacheAndRoute è DIVISA nei suoi due pezzi, e l'ordine è deliberato:
// - precache() SUBITO: popola l'elenco degli asset — createHandlerBoundToURL
//   qui sotto lo consulta in fase di valutazione e senza lancerebbe
//   "non-precached-url", uccidendo l'intero service worker (bug reale trovato
//   in verifica: la registrazione falliva in silenzio);
// - addRoute() DOPO la NavigationRoute: le route Workbox si valutano in ordine
//   di registrazione, e la route del precache (col suo directoryIndex)
//   altrimenti intercetterebbe lei le navigazioni servendole cache-first —
//   la freschezza post-deploy (no-cache) non funzionerebbe mai.
precache(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Le cache del VECCHIO sw.js a mano ("navta-cache-*") vanno eliminate
// esplicitamente: Workbox pulisce solo le proprie.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("navta-cache-")).map((k) => caches.delete(k))),
    ),
  );
});

// Navigazione network-first (stessa scelta del vecchio SW: con la rete l'app
// è sempre fresca al primo caricamento); offline si ricade sull'ultima copia
// vista, poi sulla shell precache-ata (disponibile anche al primissimo avvio
// senza rete). La richiesta è RICOSTRUITA dall'URL con cache:"no-cache":
// GitHub Pages serve index.html con max-age=600 e la fetch di default lo
// rispettava — dopo un deploy l'app restava stantia fino a 10 minuti. La
// rivalidazione costa solo un 304. (Non si può usare fetchOptions di Workbox:
// la piattaforma vieta RequestInit sulle richieste in modalità "navigate".)
const navFallback = createHandlerBoundToURL(import.meta.env.BASE_URL + "index.html");
const NAV_TIMEOUT_MS = 3000;
registerRoute(
  new NavigationRoute(async (params) => {
    const url = params.request.url;
    try {
      const fresh = await Promise.race([
        fetch(new Request(url, { cache: "no-cache" })).then(async (r) => {
          if (!r.ok) throw new Error("HTTP " + r.status);
          const cache = await caches.open("navta-pages");
          await cache.put(url, r.clone());
          return r;
        }),
        // Su reti lente non si aspetta oltre 3s: si serve l'ultima copia
        // (la fetch prosegue comunque e aggiorna la cache per la prossima).
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), NAV_TIMEOUT_MS)),
      ]);
      return fresh;
    } catch {
      const cached = await caches.match(url, { cacheName: "navta-pages" });
      return cached ?? navFallback(params);
    }
  }),
);

// La route del precache (serve gli asset cache-first): registrata DOPO la
// NavigationRoute — vedi l'avvertenza sull'ordine in cima al file.
addRoute();

// Tessere/stili/glyph di MapTiler: cache-first con tetto — offline il globo
// mostra le zone già viste invece di restare nero. purgeOnQuotaError: se lo
// spazio finisce, si sacrifica questa cache (ricostruibile), mai il precache.
registerRoute(
  ({ url }) => url.hostname === "api.maptiler.com",
  new CacheFirst({
    cacheName: "navta-tiles",
    plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true })],
  }),
);

// Confini world-atlas (topojson da jsdelivr, usati da ContinentsMap e
// dall'editor quadro): due file statici versionati — cache-first, così mappa
// dei continenti e quadro funzionano anche offline dopo il primo uso.
registerRoute(
  ({ url }) => url.hostname === "cdn.jsdelivr.net" && url.pathname.includes("world-atlas"),
  new CacheFirst({
    cacheName: "navta-world-atlas",
    plugins: [new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 180 * 24 * 3600, purgeOnQuotaError: true })],
  }),
);

// I confini regionali che ospitiamo noi (public/confini/<ISO2>.json): NON sono
// nel precache (il glob copre js/css/html/immagini/font, non i json — e
// precaricarne 200 al primo avvio sarebbe assurdo), quindi si cachano al primo
// uso. Da lì in poi la mappa di quel paese funziona anche senza rete.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.includes("/confini/"),
  new CacheFirst({
    cacheName: "navta-confini",
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 365 * 24 * 3600, purgeOnQuotaError: true })],
  }),
);
