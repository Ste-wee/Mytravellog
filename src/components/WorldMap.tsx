// [FROZEN] — Non modificare senza esplicita richiesta
import { useEffect, useRef, useState, useMemo } from "react";
import { Trip } from "@/lib/storage";
import { AutoRotate } from "@/lib/settings";
import { unwrapPath } from "@/lib/lonWrap";
import { hasCoords } from "@/lib/coords";
import { TRANSPORT, TRANSPORT_MODES, TRANSPORT_FALLBACK_COLOR } from "@/lib/transport";
import { Hand } from "lucide-react";
// SOLO i tipi: `import type` sparisce alla compilazione, quindi maplibre-gl
// continua ad arrivare dall'import dinamico più sotto e non entra nel bundle
// iniziale (il globo resta un pezzo a parte, caricato quando serve).
import type { Map as MapLibreMap, Marker, MapMouseEvent, MapLayerMouseEvent, StyleSpecification, LayerSpecification, GeoJSONSource } from "maplibre-gl";
import { loadMapLibre, type MapLibreModule, type StyleExpr } from "@/lib/maplibre";

export interface CityInfo {
  name: string;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  tier: 1 | 2 | 3;
}

interface Props {
  trips: Trip[];
  selectedId?: string | null;
  onSelectTrip?: (t: Trip) => void;
  onSelectCity?: (city: CityInfo) => void;
  autoRotateSetting?: AutoRotate;
  /** La mini-card del viaggio è aperta sopra il globo: zoom e legenda CASA si
   *  nascondono per non accavallarsi (a 390px le coprivano i bottoni). */
  selectionOpen?: boolean;
}


const MAPTILER_KEY = "J3c87wVeji5QqN7DSqJX";
const GLOBE_HINT_SEEN_KEY = "navta.globe_hint_seen";
const GLOBE_HINT_FADE_MS = 400;

// Lo style.json di MapTiler non cambia mai a runtime, ma senza cache verrebbe
// ri-scaricato (una chiamata a un'API a consumo, non gratuita come Nominatim
// o geoBoundaries) ogni volta che il globo si smonta e rimonta — es.
// navigando Home → Statistiche → Home con HashRouter.
let cachedMapStyle: StyleSpecification | null = null;

/** Ritorna sempre una copia: ogni mount muta projection/glyphs sulla propria
 * istanza senza toccare la cache condivisa. */
export async function fetchMapStyle(): Promise<StyleSpecification> {
  if (!cachedMapStyle) {
    const styleResp = await fetch(`https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`);
    cachedMapStyle = await styleResp.json();
  }
  return JSON.parse(JSON.stringify(cachedMapStyle));
}

/** Test-only: reset la cache dello style tra i test. */
export function __clearMapStyleCache() {
  cachedMapStyle = null;
}

export const ALL_CITIES: CityInfo[] = [
  {name:"Roma",country:"Italia",country_code:"IT",latitude:41.9,longitude:12.5,tier:1},
  {name:"Tokyo",country:"Giappone",country_code:"JP",latitude:35.68,longitude:139.69,tier:1},
  {name:"New York",country:"USA",country_code:"US",latitude:40.71,longitude:-74.01,tier:1},
  {name:"Londra",country:"Regno Unito",country_code:"GB",latitude:51.51,longitude:-0.13,tier:1},
  {name:"Pechino",country:"Cina",country_code:"CN",latitude:39.91,longitude:116.39,tier:1},
  {name:"Mosca",country:"Russia",country_code:"RU",latitude:55.75,longitude:37.62,tier:1},
  {name:"Cairo",country:"Egitto",country_code:"EG",latitude:30.05,longitude:31.25,tier:1},
  {name:"São Paulo",country:"Brasile",country_code:"BR",latitude:-23.55,longitude:-46.63,tier:1},
  {name:"Mumbai",country:"India",country_code:"IN",latitude:19.08,longitude:72.88,tier:1},
  {name:"Sydney",country:"Australia",country_code:"AU",latitude:-33.87,longitude:151.21,tier:1},
  {name:"Los Angeles",country:"USA",country_code:"US",latitude:34.05,longitude:-118.24,tier:1},
  {name:"Dubai",country:"Emirati Arabi",country_code:"AE",latitude:25.2,longitude:55.27,tier:1},
  {name:"Parigi",country:"Francia",country_code:"FR",latitude:48.85,longitude:2.35,tier:2},
  {name:"Berlino",country:"Germania",country_code:"DE",latitude:52.52,longitude:13.4,tier:2},
  {name:"Madrid",country:"Spagna",country_code:"ES",latitude:40.42,longitude:-3.7,tier:2},
  {name:"Istanbul",country:"Turchia",country_code:"TR",latitude:41.01,longitude:28.95,tier:2},
  {name:"Seoul",country:"Corea del Sud",country_code:"KR",latitude:37.57,longitude:126.98,tier:2},
  {name:"Delhi",country:"India",country_code:"IN",latitude:28.61,longitude:77.21,tier:2},
  {name:"Shanghai",country:"Cina",country_code:"CN",latitude:31.23,longitude:121.47,tier:2},
  {name:"Bangkok",country:"Tailandia",country_code:"TH",latitude:13.75,longitude:100.52,tier:2},
  {name:"Singapore",country:"Singapore",country_code:"SG",latitude:1.35,longitude:103.82,tier:2},
  {name:"Amsterdam",country:"Paesi Bassi",country_code:"NL",latitude:52.37,longitude:4.9,tier:2},
  {name:"Vienna",country:"Austria",country_code:"AT",latitude:48.21,longitude:16.37,tier:2},
  {name:"Kyiv",country:"Ucraina",country_code:"UA",latitude:50.45,longitude:30.52,tier:2},
  {name:"Buenos Aires",country:"Argentina",country_code:"AR",latitude:-34.6,longitude:-58.38,tier:2},
  {name:"Lagos",country:"Nigeria",country_code:"NG",latitude:6.45,longitude:3.4,tier:2},
  {name:"Milano",country:"Italia",country_code:"IT",latitude:45.47,longitude:9.19,tier:3},
  {name:"Napoli",country:"Italia",country_code:"IT",latitude:40.85,longitude:14.27,tier:3},
  {name:"Barcellona",country:"Spagna",country_code:"ES",latitude:41.39,longitude:2.15,tier:3},
  {name:"Monaco",country:"Germania",country_code:"DE",latitude:48.14,longitude:11.58,tier:3},
  {name:"Zurigo",country:"Svizzera",country_code:"CH",latitude:47.38,longitude:8.54,tier:3},
  {name:"Budapest",country:"Ungheria",country_code:"HU",latitude:47.5,longitude:19.04,tier:3},
  {name:"Praga",country:"Rep. Ceca",country_code:"CZ",latitude:50.08,longitude:14.44,tier:3},
  {name:"Oslo",country:"Norvegia",country_code:"NO",latitude:59.91,longitude:10.75,tier:3},
  {name:"Copenhagen",country:"Danimarca",country_code:"DK",latitude:55.68,longitude:12.57,tier:3},
  {name:"Varsavia",country:"Polonia",country_code:"PL",latitude:52.23,longitude:21.01,tier:3},
  {name:"San Francisco",country:"USA",country_code:"US",latitude:37.77,longitude:-122.42,tier:3},
  {name:"Miami",country:"USA",country_code:"US",latitude:25.77,longitude:-80.19,tier:3},
  {name:"Toronto",country:"Canada",country_code:"CA",latitude:43.65,longitude:-79.38,tier:3},
  {name:"Nairobi",country:"Kenya",country_code:"KE",latitude:-1.29,longitude:36.82,tier:3},
  {name:"Osaka",country:"Giappone",country_code:"JP",latitude:34.69,longitude:135.5,tier:3},
  {name:"Tel Aviv",country:"Israele",country_code:"IL",latitude:32.08,longitude:34.78,tier:3},
];

const TRANSPORT_EMOJI: Record<string, string> =
  Object.fromEntries(TRANSPORT_MODES.map(m => [m, TRANSPORT[m].emoji]));

/**
 * Registra su MapLibre (via addImage) una piccola icona per ogni mezzo di
 * trasporto, disegnando l'emoji su un canvas 2D (il font di sistema la
 * renderizza a colori) — i layer "circle" da soli non possono mostrare
 * testo/icone, serve un layer "symbol" con icon-image che punti a queste.
 * Idempotente: ogni mezzo viene registrato una sola volta per istanza mappa.
 */
function ensureTransportIcons(map: MapLibreMap) {
  Object.entries(TRANSPORT_EMOJI).forEach(([mode, emoji]) => {
    const id = `transport-icon-${mode}`;
    if (map.hasImage(id)) return;
    const canvas = document.createElement("canvas");
    canvas.width = 28; canvas.height = 28;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 14, 15);
    map.addImage(id, ctx.getImageData(0, 0, 28, 28), { pixelRatio: 2 });
  });
}

/**
 * Costruisce la sequenza di coordinate home → tappe → destinazione per il
 * disegno della rotta sul globo. Per le tratte in auto con un percorso
 * stradale reale salvato (route_geometry, via OSRM), usa quel tracciato
 * invece della linea retta tra i due punti.
 */
export function buildRouteCoords(t: Trip): [number, number][] {
  const stops = [
    ...(t.waypoints ?? [])
      .filter((w): w is typeof w & { lat: number; lon: number } => w.lat != null && w.lon != null && !isNaN(w.lat) && !isNaN(w.lon))
      .map(w => ({ lat: w.lat, lon: w.lon, route: w.route_geometry ?? null })),
    { lat: t.latitude, lon: t.longitude, route: t.route_geometry ?? null },
  ];
  const coords: [number, number][] = [[t.home_longitude!, t.home_latitude!]];
  for (const stop of stops) {
    if (stop.route && stop.route.length > 1) coords.push(...stop.route);
    else coords.push([stop.lon, stop.lat]);
  }
  // Giunzioni: il tracciato stradale di una tratta RICOMINCIA dalla tappa
  // precedente, che è già nell'elenco → la coordinata risultava doppia e
  // produceva un segmento di lunghezza zero (invisibile, ma inutile: il poster
  // già non ce l'ha). Si scartano i doppioni CONSECUTIVI, non tutti: una rotta
  // può legittimamente ripassare da un punto già toccato.
  const senzaDoppioni = coords.filter((c, i) => i === 0 || c[0] !== coords[i - 1][0] || c[1] !== coords[i - 1][1]);
  // Antimeridiano: una tratta Tokyo→Los Angeles verrebbe disegnata attraverso
  // Europa e Atlantico (il verso lungo). Srotolando, prende il Pacifico; le
  // longitudini oltre ±180 le avvolge MapLibre da sé.
  return unwrapPath(senzaDoppioni);
}

export function WorldMap({
  trips, selectedId, onSelectTrip, onSelectCity, autoRotateSetting = "on", selectionOpen = false
}: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<MapLibreMap | null>(null);
  const markersRef    = useRef<Marker[]>([]);
  const rotTimerRef   = useRef<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // Hint "Trascina per ruotare" al primo caricamento: "visible" → "fading"
  // (CSS opacity transition) → "hidden" (rimosso dal DOM). Il flag in
  // localStorage viene salvato non appena si decide di nasconderlo (timeout
  // o primo drag), non a fine transizione, così un refresh immediato dopo
  // il dismiss non lo rimostra.
  const [globeHint, setGlobeHint] = useState<"visible" | "fading" | "hidden">(
    () => (typeof localStorage !== "undefined" && localStorage.getItem(GLOBE_HINT_SEEN_KEY)) ? "hidden" : "visible"
  );
  const dismissGlobeHintRef = useRef<() => void>(() => {});
  dismissGlobeHintRef.current = () => {
    setGlobeHint(prev => {
      if (prev !== "visible") return prev;
      try { localStorage.setItem(GLOBE_HINT_SEEN_KEY, "1"); } catch { /* localStorage non disponibile */ }
      setTimeout(() => setGlobeHint("hidden"), GLOBE_HINT_FADE_MS);
      return "fading";
    });
  };
  const onSelectCityRef = useRef(onSelectCity);
  const onSelectTripRef = useRef(onSelectTrip);
  const cityMarkerRefs = useRef<{marker:Marker;el:HTMLElement;city:CityInfo}[]>([]);
  // I click handler dei layer viaggio vengono registrati UNA volta per layer
  // (map.on con layerId sopravvive a removeLayer/addLayer): questo set tiene
  // traccia di quali sono già attivi, e orderedRef dà loro sempre la lista
  // viaggi corrente invece di una chiusura stantia.
  const tripLayerHandlersRef = useRef<Set<string>>(new Set());
  const orderedRef = useRef<Trip[]>([]);
  // Selezione applicata in modo INCREMENTALE (setPaintProperty/setData), non
  // col rebuild di tutti i layer: selectedIdRef dà il valore corrente al
  // rebuild asincrono, appliedSelRef ricorda cosa c'è già sulla mappa.
  const selectedIdRef = useRef<string | null>(null);
  const appliedSelRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId ?? null; });
  useEffect(() => { onSelectCityRef.current = onSelectCity; }, [onSelectCity]);
  useEffect(() => { onSelectTripRef.current = onSelectTrip; }, [onSelectTrip]);

  useEffect(() => {
    if (globeHint !== "visible") return;
    const t = setTimeout(() => dismissGlobeHintRef.current(), 3000);
    return () => clearTimeout(t);
  }, [globeHint]);

  const ordered = useMemo(() =>
    [...trips]
      .filter(t => hasCoords(t.latitude, t.longitude))
      .sort((a,b) => a.trip_date.localeCompare(b.trip_date)), [trips]);


  // ── Init MapLibre ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let map: MapLibreMap;
    // init() è asincrona (import dinamico + fetch dello style): senza questa
    // guardia, uno smonta/rimonta rapido (navigazione Home↔Statistiche, o il
    // doppio-mount di StrictMode) faceva scattare la cleanup mentre gli await
    // erano ancora in sospeso — mapRef.current era ancora null, quindi la
    // cleanup non rimuoveva nulla, ma init arrivava comunque a creare la mappa:
    // un contesto WebGL orfano mai distrutto ad ogni ciclo. Dopo ~16 il globo
    // non si inizializzava più. Stesso pattern già usato in TripFlyover.
    let cancelled = false;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    // console.warn viene temporaneamente avvolto per silenziare i warning della
    // proiezione globo: va ripristinato in cleanup, altrimenti ogni mount
    // annida un wrapper in più permanentemente.
    let prevWarn: typeof console.warn | null = null;

    const init = async () => {
      const maplibregl = await loadMapLibre();
      if (cancelled) return;

      // CSS di MapLibre: bundlato globalmente (import in main.tsx) — la vecchia
      // iniezione del link dal CDN jsdelivr è stata rimossa: era ridondante e
      // offline riagganciava un CDN irraggiungibile (PWA).

      // Fetch style (cache-backed) and inject globe projection + glyphs (MapLibre 5.x)
      const style = await fetchMapStyle();
      if (cancelled) return;
      style.projection = { type: "globe" };
      // Add glyph server so native symbol layers can render text
      style.glyphs = `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${MAPTILER_KEY}`;

      if (!containerRef.current || cancelled) return;
      map = new maplibregl.Map({
        container: containerRef.current!,
        style,
        center: [10, 20],
        // Globo più "profondo"/distante all'apertura della Home (1.5 → 0.8 →
        // 0.5, sempre su richiesta a vista dell'utente): lascia più cielo
        // attorno.
        zoom: 0.5,
        attributionControl: false,
      });
      // Se la cleanup è scattata proprio durante l'ultimo await, distruggi
      // subito la mappa appena creata invece di lasciarla orfana.
      if (cancelled) { map.remove(); return; }

      mapRef.current = map;
      // Nuova istanza mappa = nessun handler registrato: senza questo reset,
      // dopo lo smonta/rimonta di StrictMode (dev) il set conserverebbe gli id
      // della mappa precedente e i pallini resterebbero senza click handler.
      tripLayerHandlersRef.current.clear();

      // Suppress MapLibre globe projection warnings
      prevWarn = console.warn.bind(console);
      const _warn = prevWarn;
      console.warn = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].includes('globe projection')) return;
        _warn(...args);
      };

      map.on("load", () => {
        if (cancelled) return;
        // Hide all text/symbol layers below zoom 3 so il globo è pulito da lontano
        // (a zoom 1.5-2 default, l'area Europa/Medio Oriente ha così tante etichette
        // di paesi piccoli e vicini tra loro da diventare rumore visivo, specialmente
        // con la rotazione automatica che porta quella regione in vista da sola).
        map.getStyle().layers?.forEach((layer: LayerSpecification) => {
          if (layer.type === "symbol") {
            map.setLayerZoomRange(layer.id, 3, 24);
          }
        });

        // NB: qui per anni c'e' stata una chiamata a map.setFog({...}) per
        // l'atmosfera del globo. setFog e' API di MAPBOX: in MapLibre non
        // esiste (c'e' setSky), quindi lanciava un TypeError che il try/catch
        // inghiottiva — l'atmosfera non e' MAI stata applicata. Rimossa la
        // chiamata morta: zero cambiamenti visivi. Se un giorno la si vuole
        // davvero, va fatta con setSky ed e' un cambio VISIVO da approvare.

        // Signal map ready — useEffect will add markers
        setMapReady(true);

        // City labels as markers
        updateCityLabels(map, maplibregl);

        // L'effetto che avvia la rotazione dipende da [autoRotateSetting], che
        // non cambia al mount: se scattasse prima che mapRef.current sia
        // assegnato (init() è asincrono: dynamic import + fetch dello style),
        // la rotazione non partirebbe mai finché l'utente non tocca
        // manualmente l'impostazione. Avviala qui, appena la mappa è pronta.
        if (autoRotateSetting === "on") startRotation();
      });

      // Click → reverse geocode
      map.on("click", async (e: MapMouseEvent) => {
        // Se il click ha colpito un pallino viaggio, la mini-card è già stata
        // aperta dal suo handler: senza questo controllo, dopo ~1s arriverebbe
        // anche il popup città "Aggiungi come viaggio" a coprirla.
        // Bailla se il click ha colpito un pallino viaggio O una città cliccabile:
        // quei layer hanno già il proprio handler (che apre la card con dati
        // puliti). Senza le città nella guardia, il tap su una città lanciava
        // ANCHE questo reverse-geocode che ~1s dopo sovrascriveva la selezione.
        // Le TAPPE stanno in questo elenco da quando aprono anch'esse la
        // mini-card: senza, il tocco su Trieste apriva la card E il popup
        // "Aggiungi come viaggio" di Trieste — un pannello a tutto schermo
        // sopra la card, che poi si mangiava ogni tocco successivo. Assurdo
        // anche nel merito: quella città l'hai già visitata, è nel viaggio.
        const handledLayers = ["trips-single", "trips-single-icons", "trips-multi", "trips-multi-icons",
          "trips-waypoints", "trips-waypoints-icons", "cities-t1", "cities-t2", "cities-t3"]
          .filter(id => map.getLayer(id));
        if (handledLayers.length > 0 && map.queryRenderedFeatures(e.point, { layers: handledLayers }).length > 0) return;
        const { lng, lat } = e.lngLat;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&accept-language=it`
          );
          const data = await res.json();
          if (!data || data.error) return;
          const addr = data.address || {};
          const name = addr.city || addr.town || addr.village ||
                       addr.suburb || addr.county || data.name ||
                       `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
          onSelectCityRef.current?.({
            name, country: addr.country || "",
            country_code: (addr.country_code || "").toUpperCase(),
            latitude: lat, longitude: lng, tier: 1,
          });
        } catch(_) { /* rete giù o risposta storta: niente popup, nessun danno */ }
      });

      // Stop rotation on interaction
      map.on("mousedown", stopRotation);
      map.on("touchstart", stopRotation);
      map.on("mousedown", () => dismissGlobeHintRef.current());
      map.on("touchstart", () => dismissGlobeHintRef.current());

      resizeTimer = setTimeout(() => { map.resize(); }, 100);
    };

    init();

    return () => {
      cancelled = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      if (prevWarn) { console.warn = prevWarn; prevWarn = null; }
      stopRotation();
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-rotate ────────────────────────────────────────────────────────────
  function startRotation() {
    if (rotTimerRef.current) return;
    // Rispetta "riduci movimento" del sistema: niente rotazione automatica
    // passiva del globo (le animazioni CSS sono già gestite in index.css).
    // Guardia in un solo punto → copre tutti i punti che chiamano startRotation.
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const rotate = () => {
      const map = mapRef.current;
      if (!map) return;
      const center = map.getCenter();
      map.setCenter([center.lng + 0.1, center.lat]);
      rotTimerRef.current = requestAnimationFrame(rotate) as unknown as number;
    };
    rotTimerRef.current = requestAnimationFrame(rotate) as unknown as number;
  }

  function stopRotation() {
    if (rotTimerRef.current) {
      cancelAnimationFrame(rotTimerRef.current as unknown as number);
      rotTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (!mapRef.current) return;
    if (autoRotateSetting === "on") startRotation();
    else stopRotation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRotateSetting]);

  // ── Add trips ──────────────────────────────────────────────────────────────
  function addTripsToMap(map: MapLibreMap, maplibregl: MapLibreModule) {
    // I click handler dei layer (registrati una sola volta) leggono da qui la
    // lista viaggi corrente, mai da una chiusura vecchia.
    orderedRef.current = ordered;

    // Clean old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Remove old layers/sources
    // Remove all route layers
    try {
      const allLayers = map.getStyle()?.layers?.map((l: LayerSpecification) => l.id) ?? [];
      allLayers.filter((id: string) => id.startsWith("route-")).forEach((id: string) => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      });
    } catch(_) { /* stile non ancora pronto: i layer li (ri)crea il seguito */ }
    // Prima TUTTI i layer, poi le source: rimuovere la source "trips-single"
    // mentre il layer "trips-single-icons" (più avanti nella lista) la usa
    // ancora farebbe scattare un errore MapLibre a ogni ridisegno.
    const tripIds = ["route-line","route-points","trips-single","trips-single-icons","trips-multi","trips-multi-icons","trips-waypoints","trips-waypoints-icons","trips-labels"];
    tripIds.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
    tripIds.forEach(id => { if (map.getSource(id)) map.removeSource(id); });

    if (!ordered.length) return;

    // Per-trip lines: pink for single, colored by transport for multi-tappa
    const TRANSPORT_COLORS_MAP: Record<string, string> =
      Object.fromEntries(TRANSPORT_MODES.map(m => [m, TRANSPORT[m].color]));
    // Espressione MapLibre condivisa: colora un pallino in base al mezzo di
    // trasporto della tappa (property "transport"), stessa palette ovunque
    // nell'app (linee, badge, marker del flyover).
    const TRANSPORT_MATCH_EXPR: StyleExpr = [
      "match", ["get", "transport"],
      "plane", TRANSPORT_COLORS_MAP.plane,
      "train", TRANSPORT_COLORS_MAP.train,
      "car",   TRANSPORT_COLORS_MAP.car,
      "ship",  TRANSPORT_COLORS_MAP.ship,
      "walk",  TRANSPORT_COLORS_MAP.walk,
      "bici",  TRANSPORT_COLORS_MAP.bici,
      "moto",  TRANSPORT_COLORS_MAP.moto,
      TRANSPORT_FALLBACK_COLOR
    ];
    // Espressione gemella: sceglie l'icona (immagine registrata via addImage,
    // vedi ensureTransportIcons) invece del colore, stessa property "transport".
    const ICON_MATCH_EXPR: StyleExpr = [
      "match", ["get", "transport"],
      "plane", "transport-icon-plane",
      "train", "transport-icon-train",
      "car",   "transport-icon-car",
      "ship",  "transport-icon-ship",
      "walk",  "transport-icon-walk",
      "bici",  "transport-icon-bici",
      "moto",  "transport-icon-moto",
      "transport-icon-plane"
    ];
    ensureTransportIcons(map);
    // Solo le rotte SEMPRE visibili (multi-tappa), con paint di base: la
    // selezione (rotta rosa dei viaggi secchi, spessore/opacità) viene
    // applicata in modo incrementale da applySelection, senza rebuild.
    ordered.forEach((t) => {
      // hasCoords, non check falsy: la forma negata (!lat || !lon) scartava lo
      // zero — casa a Greenwich o destinazione sull'equatore = rotta mai disegnata.
      if (!hasCoords(t.home_latitude, t.home_longitude) || !hasCoords(t.latitude, t.longitude)) return;
      const hasWp = t.waypoints && t.waypoints.length > 0;
      const lineId = "route-" + t.id;
      if (map.getLayer(lineId)) map.removeLayer(lineId);
      if (map.getSource(lineId)) map.removeSource(lineId);
      if (!hasWp) return;
      const lineColor = TRANSPORT_COLORS_MAP[t.transport_mode ?? "plane"] ?? TRANSPORT_FALLBACK_COLOR;
      const coords = buildRouteCoords(t);
      map.addSource(lineId, {
        type: "geojson",
        data: { type:"Feature", properties: {}, geometry:{ type:"LineString", coordinates: coords } },
      });
      map.addLayer({
        id: lineId, type: "line", source: lineId,
        paint: { "line-color": lineColor, "line-width": 1.8,
          "line-opacity": 0.55, "line-dasharray": [4, 3] },
      });
    });

    // Home marker
    const homeEl = document.createElement("div");
    homeEl.style.cssText = "width:16px;height:16px;border-radius:50%;background:#fbbf24;border:2.5px solid #fff;box-shadow:0 0 8px rgba(251,191,36,0.6);cursor:pointer";
    const firstWithHome = ordered.find((t: Trip) => hasCoords(t.home_latitude, t.home_longitude));
    if (firstWithHome) {
      markersRef.current.push(
        new maplibregl.Marker({ element: homeEl })
          .setLngLat([firstWithHome.home_longitude!, firstWithHome.home_latitude!])
          .addTo(map)
      );
    }

    // Trip markers — use native WebGL circle layers (stay fixed on globe)
    // Build GeoJSON for single-destination trips (colored by transport mode)
    // (niente property "selected": non era letta da alcuna paint expression)
    const singleFeatures = ordered
      .filter((t: Trip) => !t.waypoints?.length)
      .map((t: Trip) => ({
        type: "Feature" as const,
        properties: { id: t.id, transport: t.transport_mode ?? "plane" },
        geometry: { type: "Point" as const, coordinates: [t.longitude, t.latitude] }
      }));

    // Build GeoJSON for multi-tappa trips (colored by transport mode)
    const multiFeatures = ordered
      .filter((t: Trip) => (t.waypoints?.length ?? 0) > 0)
      .map((t: Trip) => ({
        type: "Feature" as const,
        properties: { id: t.id, transport: t.transport_mode ?? "plane" },
        geometry: { type: "Point" as const, coordinates: [t.longitude, t.latitude] }
      }));

    // Add click handlers via map.on for these layers
    const addCircleLayer = (id: string, features: GeoJSON.Feature[], color: StyleExpr) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
      if (!features.length) return;
      map.addSource(id, {
        type: "geojson",
        data: { type: "FeatureCollection", features }
      });
      map.addLayer({
        id, type: "circle", source: id,
        paint: {
          "circle-radius": 7,
          "circle-color": color,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 1,
          "circle-stroke-opacity": 0.9,
        }
      });
      const iconId = id + "-icons";
      if (map.getLayer(iconId)) map.removeLayer(iconId);
      map.addLayer({
        id: iconId, type: "symbol", source: id,
        layout: { "icon-image": ICON_MATCH_EXPR, "icon-size": 1, "icon-allow-overlap": true, "icon-ignore-placement": true },
      });
      registraApertura(id);
    };

    /**
     * Tocco su un punto del viaggio → si apre la sua mini-card.
     * Handler registrati UNA volta per layer id e per istanza mappa:
     * map.on(evento, layerId) sopravvive a removeLayer/addLayer, quindi
     * ri-registrarli a ogni ridisegno (= ogni cambio selezione) li
     * accumulerebbe — N selezioni, N flyTo per ogni click.
     */
    function registraApertura(id: string) {
      if (tripLayerHandlersRef.current.has(id)) return;
      tripLayerHandlersRef.current.add(id);
      map.on("click", id, (e: MapLayerMouseEvent) => {
        if (!e.features?.length) return;
        const tripId = e.features[0].properties.id;
        const trip = orderedRef.current.find((t: Trip) => t.id === tripId);
        // Niente flyTo qui: ci pensa l'effect su selectedId (prima partivano
        // DUE animazioni sovrapposte per lo stesso click, 800ms + 1000ms).
        if (trip) onSelectTripRef.current?.(trip);
      });
      map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
    }

    addCircleLayer("trips-single", singleFeatures, TRANSPORT_MATCH_EXPR);
    addCircleLayer("trips-multi",  multiFeatures,  TRANSPORT_MATCH_EXPR);

    // City name labels: source e layer PERSISTONO (vuoti quando nulla è
    // selezionato) — la selezione li riempie con setData, senza rebuild.
    if (map.getLayer("trips-labels")) map.removeLayer("trips-labels");
    if (map.getSource("trips-labels")) map.removeSource("trips-labels");
    map.addSource("trips-labels", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });
    map.addLayer({
      id: "trips-labels", type: "symbol", source: "trips-labels",
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-size": 13,
        "text-anchor": "top",
        "text-offset": [0, 0.8],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.9)",
        "text-halo-width": 2,
      }
    });

    // Waypoint intermediate stop markers (smaller dots, colored by transport)
    const waypointFeatures = ordered.flatMap((t: Trip) =>
      (t.waypoints ?? [])
        .filter((w) => hasCoords(w.lat, w.lon))
        .map((w) => ({
          type: "Feature" as const,
          // `id` = il VIAGGIO a cui appartiene la tappa: senza, toccare Trieste
          // sul globo non apriva nulla (il gestore del click legge l'id dalla
          // feature). I pallini di destinazione ce l'avevano, le tappe no.
          properties: { id: t.id, transport: w.transport_mode ?? "plane" },
          geometry: { type: "Point" as const, coordinates: [w.lon, w.lat] }
        }))
    );
    if (map.getLayer("trips-waypoints")) map.removeLayer("trips-waypoints");
    if (map.getSource("trips-waypoints")) map.removeSource("trips-waypoints");
    if (waypointFeatures.length) {
      map.addSource("trips-waypoints", {
        type: "geojson",
        data: { type: "FeatureCollection", features: waypointFeatures }
      });
      map.addLayer({
        id: "trips-waypoints", type: "circle", source: "trips-waypoints",
        paint: {
          "circle-radius": 7,
          "circle-color": TRANSPORT_MATCH_EXPR,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.9,
        }
      });
      if (map.getLayer("trips-waypoints-icons")) map.removeLayer("trips-waypoints-icons");
      map.addLayer({
        id: "trips-waypoints-icons", type: "symbol", source: "trips-waypoints",
        layout: { "icon-image": ICON_MATCH_EXPR, "icon-size": 1, "icon-allow-overlap": true, "icon-ignore-placement": true },
      });
      // Anche le TAPPE aprono la mini-card del loro viaggio: prima il tocco su
      // Trieste non faceva nulla (l'apertura era registrata solo sui pallini di
      // destinazione). Su entrambi i layer, perché l'emoji del mezzo sta sopra
      // il cerchio e il dito può capitare sull'una o sull'altro.
      registraApertura("trips-waypoints");
      registraApertura("trips-waypoints-icons");
    }

    // Layer nuovi di zecca: la selezione va riapplicata da zero.
    appliedSelRef.current = null;
    applySelection(map, selectedIdRef.current);
  }

  // ── Selezione incrementale ─────────────────────────────────────────────────
  // Ciò che dipende dalla selezione è poco: la rotta rosa dei viaggi senza
  // tappe (esiste solo da selezionati), spessore/opacità della rotta dei
  // multi-tappa, e le etichette città. Applicarlo con setPaintProperty/setData
  // evita il teardown+rebuild di TUTTE le source a ogni tap sul globo (gesto
  // più frequente della Home, e causa storica del leak WebGL).
  function applySelection(map: MapLibreMap, selId: string | null) {
    if (!map || !map.getSource("trips-labels")) return; // rebuild non ancora passato
    const prev = appliedSelRef.current;
    if (prev === selId) return;

    const routePaint = (id: string, sel: boolean) => {
      map.setPaintProperty(id, "line-width", sel ? 2.5 : 1.8);
      map.setPaintProperty(id, "line-opacity", sel ? 0.9 : 0.55);
    };

    // Spegni la selezione precedente
    if (prev) {
      const prevTrip = orderedRef.current.find((t: Trip) => t.id === prev);
      const prevId = "route-" + prev;
      if (prevTrip?.waypoints?.length) {
        if (map.getLayer(prevId)) routePaint(prevId, false);
      } else {
        // Viaggio secco (o eliminato): la sua rotta rosa esiste solo da selezionato
        if (map.getLayer(prevId)) map.removeLayer(prevId);
        if (map.getSource(prevId)) map.removeSource(prevId);
      }
    }

    // Accendi la nuova
    const trip = selId ? orderedRef.current.find((t: Trip) => t.id === selId) : null;
    if (trip && hasCoords(trip.home_latitude, trip.home_longitude) && hasCoords(trip.latitude, trip.longitude)) {
      const lineId = "route-" + trip.id;
      if (trip.waypoints?.length) {
        if (map.getLayer(lineId)) routePaint(lineId, true);
      } else if (!map.getLayer(lineId)) {
        map.addSource(lineId, {
          type: "geojson",
          data: { type: "Feature" as const, properties: {}, geometry: { type: "LineString", coordinates: buildRouteCoords(trip) } },
        });
        // beforeId: sotto i pallini, stessa pila del rebuild (le rotte
        // venivano aggiunte prima dei circle layer).
        const beforeId = ["trips-single", "trips-multi", "trips-labels"].find(id => map.getLayer(id));
        map.addLayer({
          id: lineId, type: "line", source: lineId,
          paint: { "line-color": "#f472b6", "line-width": 2.5,
            "line-opacity": 0.9, "line-dasharray": [4, 3] },
        }, beforeId);
      }
    }

    // Etichette città (vuote se nulla è selezionato)
    const labelFeatures: GeoJSON.Feature[] = trip ? [
      ...(hasCoords(trip.home_latitude, trip.home_longitude) ? [{
        type: "Feature" as const,
        properties: { name: trip.home_label?.split(",")[0] ?? "Casa" },
        geometry: { type: "Point" as const, coordinates: [trip.home_longitude, trip.home_latitude] }
      }] : []),
      ...(trip.waypoints ?? [])
        .filter((w) => hasCoords(w.lat, w.lon))
        .map((w) => ({
          type: "Feature" as const,
          properties: { name: w.city },
          geometry: { type: "Point" as const, coordinates: [w.lon, w.lat] }
        })),
      {
        type: "Feature" as const,
        properties: { name: trip.city },
        geometry: { type: "Point" as const, coordinates: [trip.longitude, trip.latitude] }
      }
    ] : [];
    (map.getSource("trips-labels") as GeoJSONSource).setData({ type: "FeatureCollection", features: labelFeatures });

    appliedSelRef.current = selId;
  }

  // ── City labels ────────────────────────────────────────────────────────────
  function updateCityLabels(map: MapLibreMap, _maplibregl: MapLibreModule) {
    // Remove old city markers (HTML)
    cityMarkerRefs.current.forEach(({marker}) => marker.remove());
    cityMarkerRefs.current = [];

    // Remove old native layers/sources
    ["cities-t1","cities-t2","cities-t3","cities-t1-labels","cities-t2-labels","cities-t3-labels"].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    ["cities-src-t1","cities-src-t2","cities-src-t3"].forEach(id => {
      if (map.getSource(id)) map.removeSource(id);
    });

    const tiers: (1|2|3)[] = [1,2,3];
    tiers.forEach(tier => {
      const cities = ALL_CITIES.filter(c => c.tier === tier);
      const minZoom = tier === 1 ? 2 : tier === 2 ? 3.5 : 5;

      map.addSource(`cities-src-t${tier}`, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: cities.map(c => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [c.longitude, c.latitude] },
            properties: { name: c.name, country: c.country, country_code: c.country_code, latitude: c.latitude, longitude: c.longitude, tier: c.tier },
          })),
        },
      });

      // Dot
      map.addLayer({
        id: `cities-t${tier}`,
        type: "circle",
        source: `cities-src-t${tier}`,
        minzoom: minZoom,
        paint: {
          "circle-radius": tier === 1 ? 3.5 : tier === 2 ? 2.5 : 2,
          "circle-color": "#ffffff",
          "circle-opacity": 0.9,
          "circle-stroke-width": 0,
        },
      });

      // Label
      map.addLayer({
        id: `cities-t${tier}-labels`,
        type: "symbol",
        source: `cities-src-t${tier}`,
        minzoom: minZoom,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": tier === 1 ? 13 : tier === 2 ? 11 : 10,
          "text-anchor": "left",
          "text-offset": [0.5, 0],
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.9)",
          "text-halo-width": 1.5,
          "text-opacity": ["interpolate",["linear"],["zoom"], minZoom, 0, minZoom + 0.5, 1],
        },
      });

      // Click on city label
      map.on("click", `cities-t${tier}`, (e: MapLayerMouseEvent) => {
        if (!e.features?.length) return;
        // Le properties tornano da MapLibre senza tipi: la CityInfo si
        // ricostruisce dichiarando le conversioni, non fingendo che tornino.
        const p = e.features[0].properties;
        onSelectCityRef.current?.({
          name: String(p.name), country: String(p.country), country_code: String(p.country_code),
          latitude: Number(p.latitude), longitude: Number(p.longitude), tier: Number(p.tier) as CityInfo["tier"],
        });
        e.preventDefault();
      });

      map.on("mouseenter", `cities-t${tier}`, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", `cities-t${tier}`, () => { map.getCanvas().style.cursor = ""; });
    });
  }


  // Rebuild markers when map is ready AND trips change.
  // NB: selectedId NON è più una dipendenza — il tap su un pallino (il gesto
  // più frequente della Home) non deve rifare N+6 source/layer da zero.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    loadMapLibre().then(maplibregl => {
      // Ricontrolla DOPO l'attesa del chunk: smontando la Home prima che
      // maplibre arrivi (prima visita, rete lenta) la mappa è già stata
      // rimossa e disegnarci sopra sarebbe un TypeError non gestito.
      if (!mapRef.current) return;
      addTripsToMap(mapRef.current, maplibregl);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, ordered]);

  // Selezione: solo ritocchi incrementali (paint, rotta rosa, etichette).
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    applySelection(mapRef.current, selectedId ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, selectedId]);

  // Focus selected trip. Deps SOLO su selectedId: con ordered in dipendenza,
  // ogni backfill/refresh dei viaggi rilanciava un flyTo di 1s a caso.
  useEffect(() => {
    if (!selectedId || !mapRef.current) return;
    const t = orderedRef.current.find(x => x.id === selectedId) ?? ordered.find(x => x.id === selectedId);
    if (!t) return;
    mapRef.current.flyTo({ center:[t.longitude,t.latitude], zoom:Math.max(mapRef.current.getZoom(),5), duration:1000 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Popup styles
  useEffect(() => {
    if (!document.getElementById("atlas-popup-css")) {
      const s = document.createElement("style"); s.id = "atlas-popup-css";
      s.textContent = `.atlas-popup .maplibregl-popup-content{background:#0d1829!important;border:1px solid rgba(255,255,255,0.1)!important;border-radius:10px!important;padding:12px 14px!important;box-shadow:0 8px 32px rgba(0,0,0,0.6)!important;color:#e2e8f0!important}.atlas-popup .maplibregl-popup-tip{border-top-color:#0d1829!important}.maplibregl-ctrl-attrib{background:rgba(0,0,0,0.4)!important;color:#475569!important;font-size:9px!important}`;
      document.head.appendChild(s);
    }
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} style={{ position:"absolute", inset:0 }} />

      {/* Zoom (si alza sopra la barra del tempo quando presente). Con la
          mini-card aperta sparisce: a 390px si accavallava ai suoi bottoni. */}
      {!selectionOpen && (
        <div className="absolute right-3 flex flex-col gap-1 z-40" style={{ bottom: 64 }}>
          <button onClick={() => mapRef.current?.zoomIn()}
            className="w-8 h-8 bg-black/60 backdrop-blur border border-white/15 rounded-lg text-white text-lg font-bold flex items-center justify-center hover:bg-white/10 transition-colors select-none">+</button>
          <button onClick={() => mapRef.current?.zoomOut()}
            className="w-8 h-8 bg-black/60 backdrop-blur border border-white/15 rounded-lg text-white text-lg font-bold flex items-center justify-center hover:bg-white/10 transition-colors select-none">−</button>
        </div>
      )}

      {/* Legend — anche lei si fa da parte quando la card è aperta */}
      {!selectionOpen && (
        <div className="absolute right-3 bg-black/50 backdrop-blur border border-white/10 rounded-lg px-3 py-2 flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-white/60 z-40" style={{ bottom: 12 }}>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400"/>Casa</div>
        </div>
      )}

      {/* Hint drag-per-ruotare: solo al primo caricamento (flag in localStorage) */}
      {globeHint !== "hidden" && (
        <div
          className="absolute left-3 z-40 flex items-center gap-2 bg-black/50 backdrop-blur border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white/70"
          style={{ transition: `opacity ${GLOBE_HINT_FADE_MS}ms ease`, opacity: globeHint === "fading" ? 0 : 1, pointerEvents: "none", bottom: 12 }}
        >
          <Hand className="w-3.5 h-3.5" aria-hidden/>
          Trascina per ruotare
        </div>
      )}

    </div>
  );
}
