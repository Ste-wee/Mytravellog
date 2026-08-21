// [FROZEN] — Non modificare senza esplicita richiesta
import { useEffect, useRef, useState, useMemo } from "react";
import { Trip } from "@/lib/storage";
import { AutoRotate } from "@/lib/settings";
import { unwrapPath } from "@/lib/lonWrap";
import { hasCoords } from "@/lib/coords";
import { TRANSPORT, TRANSPORT_MODES, TRANSPORT_FALLBACK_COLOR } from "@/lib/transport";
import { caricaPaesi, paesiVisitati, centroPaese } from "@/lib/paesi";
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
  /** Dimensione dei pallini scelta in Impostazioni: il raggio interpola fra
   *  min (da lontano) e max (da vicino). Prima l'impostazione esisteva, si
   *  salvava e si rileggeva… ma il globo non la guardava proprio: i tre
   *  preset disegnavano tutti pallini identici (raggio 7 fisso). */
  minMarkerScale?: number;
  maxMarkerScale?: number;
  /** Modalità "paesi": invece dei pallini dei viaggi il globo evidenzia i
   *  paesi visitati, con la bandiera al centro di ciascuno. La telecamera si
   *  porta sui propri paesi (globo INTERO, col cielo attorno) e la rotazione
   *  automatica va in pausa: con la vista ravvicinata scapperebbe via. */
  modalitaPaesi?: boolean;
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

// ── Modalità paesi: nomi delle cose che appaiono e spariscono insieme ───────
const SRC_PAESI = "paesi-visitati";
const SRC_BANDIERE = "paesi-bandiere";
const LAYER_PAESI_FILL = "paesi-visitati-fill";
const LAYER_PAESI_BORDO = "paesi-visitati-bordo";
const LAYER_BANDIERE = "paesi-bandiere-layer";
const IMG_BANDIERA = "bandiera-";
/**
 * Quanto è grande il globo, in Home e in modalità paesi: lo STESSO valore,
 * una costante sola perché le due viste non possano più divergere (era la
 * richiesta: "i pallini alla stessa dimensione dell'altro con le bandiere").
 *
 * 0.8 è misurato a 390px: il globo riempie lo schermo restando INTERO, col
 * cielo attorno; da 0.95 in su la sfera esce dai bordi e diventa una mappa.
 * Storia del valore, tutta a vista dell'utente: 1.5 → 0.8 → 0.5 → 0.8.
 */
const ZOOM_GLOBO = 0.8;
/**
 * Lo zoom si ADATTA al contenitore: 0.8 è tarato sul telefono (contenitore
 * 358px sul lato corto, sfera al 92%), ma su desktop lo stesso valore lascia
 * la sfera al 56% dell'altezza — un globo piccolo perso nel cielo.
 *
 * Misurato sul dev server (1248×588): il diametro cresce di ~2× per ogni
 * punto di zoom in più, quindi +log2(latoCorto/358) tiene la PROPORZIONE del
 * telefono su qualunque schermo. Clamp: mai sotto 0.8 (il telefono resta
 * esattamente com'è: il valore l'ha scelto Stefano a vista) e mai sopra 1.6
 * (a 1.7 la sfera sfiora i bordi e il cielo sparisce).
 */
const BASE_LATO_CORTO = 358;
function zoomGloboPer(el: HTMLElement | null): number {
  const w = el?.clientWidth ?? 0, h = el?.clientHeight ?? 0;
  const lato = Math.min(w, h);
  if (lato <= BASE_LATO_CORTO) return ZOOM_GLOBO;   // telefoni e jsdom
  return Math.min(1.6, ZOOM_GLOBO + Math.log2(lato / BASE_LATO_CORTO));
}
/** I layer dei viaggi, che in modalità paesi si fanno da parte. I pallini e
 *  le etichette hanno un id fisso; le ROTTE ne hanno uno per viaggio
 *  ("route-<id>"), quindi si cercano nello stile invece di elencarle. */
const LAYER_VIAGGI = ["trips-single", "trips-multi", "trips-waypoints", "trips-labels"];
function layerDaNascondere(map: MapLibreMap): string[] {
  const rotte = map.getStyle()?.layers?.map(l => l.id).filter(id => id.startsWith("route-")) ?? [];
  return [...LAYER_VIAGGI, ...rotte];
}

function aggiungiSorgente(map: MapLibreMap, id: string, features: GeoJSON.Feature[]) {
  const data = { type: "FeatureCollection", features } as GeoJSON.FeatureCollection;
  const src = map.getSource(id) as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined;
  if (src?.setData) src.setData(data);
  else map.addSource(id, { type: "geojson", data });
}

function mostraLayerViaggi(map: MapLibreMap, visibili: boolean) {
  for (const id of layerDaNascondere(map)) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibili ? "visible" : "none");
  }
}

function pulisciModalitaPaesi(map: MapLibreMap) {
  for (const id of [LAYER_BANDIERE, LAYER_PAESI_BORDO, LAYER_PAESI_FILL]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [SRC_BANDIERE, SRC_PAESI]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

/**
 * Scarica le bandiere e le registra come immagini della mappa, restituendo
 * solo le feature che ce l'hanno fatta. Le immagini vanno registrate PRIMA del
 * layer che le nomina, altrimenti MapLibre non trova l'icona e non disegna
 * nulla. Chi fallisce (offline, paese senza bandiera) viene semplicemente
 * lasciato indietro: il paese colorato basta da solo.
 */
async function registraBandiere(map: MapLibreMap, features: GeoJSON.Feature[]) {
  const ok: GeoJSON.Feature[] = [];
  await Promise.all(features.map(async f => {
    const id = String(f.properties?.icona ?? "");
    const cc = id.slice(IMG_BANDIERA.length);
    if (!cc) return;
    try {
      if (!map.hasImage(id)) {
        // w80 e non w40: la stessa bandiera con il doppio dei pixel si legge
        // meglio sul globo satellitare, dove il fondo è scuro e mosso.
        const r = await fetch(`https://flagcdn.com/w80/${cc}.png`);
        if (!r.ok) return;
        const bmp = await createImageBitmap(await r.blob());
        // Ricontrolla DOPO l'attesa: due bandiere dello stesso paese possono
        // arrivare insieme, e registrare due volte la stessa immagine è un
        // errore in MapLibre.
        // La misura sullo schermo è (larghezza immagine / pixelRatio) ×
        // icon-size. Prima: 40/3 × 1,05 = 14px. Ora: 80/4 × 1,0 = 20px, cioè
        // un terzo più grande e con il DOPPIO dei pixel — "leggermente più
        // leggibili" come chiesto, senza diventare adesivi da valigia
        // (a pixelRatio 2 venivano 46px: provato, troppo).
        if (!map.hasImage(id)) map.addImage(id, bmp, { pixelRatio: 4 });
      }
      ok.push(f);
    } catch {
      /* bandiera non disponibile: il paese resta colorato senza */
    }
  }));
  return ok;
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
  trips, selectedId, onSelectTrip, onSelectCity, autoRotateSetting = "on", selectionOpen = false,
  minMarkerScale = 0.3, maxMarkerScale = 0.7, modalitaPaesi = false,
}: Props) {
  // Raggio dei pallini: il 7 storico moltiplicato per la scala scelta, che
  // cresce con lo zoom (min da lontano, max da vicino). Con "Piccoli"
  // (0,3-0,7) si passa da ~2 a ~5 pixel: il globo pieno resta leggibile.
  const raggioPallino = useMemo(() => ([
    "interpolate", ["linear"], ["zoom"],
    1, 7 * minMarkerScale,
    6, 7 * maxMarkerScale,
  ] as unknown as StyleExpr), [minMarkerScale, maxMarkerScale]);
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
  /** Dove guardava il globo prima di entrare in modalità paesi: uscendo si
   *  torna lì, così il gesto è reversibile davvero e non lascia la vista
   *  spostata a caso. */
  const vistaPrimaRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  /** Lo zoom del globo per QUESTO schermo (vedi zoomGloboPer): calcolato al
   *  mount e condiviso da init e modalità paesi, così le due viste hanno per
   *  costruzione la stessa dimensione. */
  const zoomGloboRef = useRef(ZOOM_GLOBO);
  /** I paesi sono DAVVERO disegnati sul globo — non basta che la modalità sia
   *  richiesta: se i confini non arrivano o nessun viaggio cade in un paese
   *  noto, i pallini devono restare al loro posto invece di lasciare il globo
   *  vuoto. Lo legge anche chi RICOSTRUISCE i layer dei viaggi (refresh, sync,
   *  backfill): nascono visibili e ricomparirebbero sopra i paesi colorati.
   *  Un ref e non uno stato: addTripsToMap gira dentro una promise e leggerebbe
   *  una chiusura vecchia. */
  const paesiAttiviRef = useRef(false);
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
      // Adesso il contenitore è nel DOM e ha la sua taglia vera: lo zoom si
      // taglia su di lui (telefono 0.8, schermi larghi fino a 1.6).
      zoomGloboRef.current = zoomGloboPer(containerRef.current);
      map = new maplibregl.Map({
        container: containerRef.current!,
        style,
        center: [10, 20],
        zoom: zoomGloboRef.current,
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
        // In modalità paesi il globo si GUARDA, non si modifica: proporre
        // "Aggiungi come viaggio" toccando un paese colorato è assurdo nel
        // merito — quel paese è illuminato PERCHÉ ci sei già stato.
        if (paesiAttiviRef.current) return;
        const handledLayers = ["trips-single", "trips-multi",
          "trips-waypoints", "cities-t1", "cities-t2", "cities-t3"]
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
    const tripIds = ["route-line","route-points","trips-single","trips-multi","trips-waypoints","trips-labels"];
    tripIds.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
    tripIds.forEach(id => { if (map.getSource(id)) map.removeSource(id); });

    if (!ordered.length) return;

    // Per-trip lines: pink for single, colored by transport for multi-tappa
    const TRANSPORT_COLORS_MAP: Record<string, string> =
      Object.fromEntries(TRANSPORT_MODES.map(m => [m, TRANSPORT[m].color]));
    // Espressione MapLibre condivisa: colora un pallino in base al mezzo di
    // trasporto della tappa (property "transport"), stessa palette ovunque
    // nell'app (linee, badge, marker del flyover).
    // I casi si generano dall'elenco dei mezzi: scritti a mano, un mezzo nuovo
    // restava del colore di ripiego finché qualcuno non se ne accorgeva.
    const TRANSPORT_MATCH_EXPR: StyleExpr = [
      "match", ["get", "transport"],
      ...TRANSPORT_MODES.flatMap(m => [m, TRANSPORT_COLORS_MAP[m]]),
      TRANSPORT_FALLBACK_COLOR
    ];
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
          "circle-radius": raggioPallino,
          "circle-color": color,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 1,
          "circle-stroke-opacity": 0.9,
        }
      });
      // NB: qui c'era anche un layer "symbol" con l'emoji del mezzo dentro il
      // pallino. Rimosso su richiesta: con l'archivio pieno le iconcine si
      // impastavano e il colore del pallino dice già il mezzo.
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
          "circle-radius": raggioPallino,
          "circle-color": TRANSPORT_MATCH_EXPR,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.9,
        }
      });
      // Anche le TAPPE aprono la mini-card del loro viaggio: prima il tocco su
      // Trieste non faceva nulla (l'apertura era registrata solo sui pallini di
      // destinazione). Ora c'è un solo layer da registrare: l'emoji del mezzo
      // sopra il cerchio non esiste più.
      registraApertura("trips-waypoints");
    }

    // Layer nuovi di zecca: la selezione va riapplicata da zero.
    appliedSelRef.current = null;
    applySelection(map, selectedIdRef.current);
    // ...e se il globo è in modalità paesi devono nascere già nascosti: un
    // refresh dei viaggi (sync, backfill) li ricrea VISIBILI, e i pallini
    // ricomparirebbero sopra i paesi colorati.
    if (paesiAttiviRef.current) mostraLayerViaggi(map, false);
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
  }, [mapReady, selectedId]);

  // ── Modalità paesi ─────────────────────────────────────────────────────────
  // Entrando: i paesi visitati si colorano, ognuno con la sua bandiera, e i
  // pallini dei viaggi si nascondono (non spariscono: torneranno identici).
  // Uscendo: tutto come prima, telecamera e rotazione comprese.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    let annullato = false;

    if (!modalitaPaesi) {
      paesiAttiviRef.current = false;
      pulisciModalitaPaesi(map);
      mostraLayerViaggi(map, true);
      // la vista di prima, se l'avevamo messa da parte entrando
      const prima = vistaPrimaRef.current;
      if (prima) {
        vistaPrimaRef.current = null;
        map.flyTo({ center: prima.center, zoom: prima.zoom, duration: 900 });
        // La rotazione riparte SOLO a volo finito: gira chiamando setCenter a
        // ogni frame, e un setCenter durante un flyTo lo cancella — il globo
        // restava allo zoom della modalità paesi invece di tornare com'era.
        if (autoRotateSetting === "on") map.once("moveend", () => startRotation());
      } else if (autoRotateSetting === "on") {
        startRotation();
      }
      return;
    }

    // Con la telecamera ferma sui propri paesi, la rotazione automatica li
    // porterebbe fuori vista in pochi secondi: si mette in pausa.
    stopRotation();
    // I pallini NON si nascondono qui: i confini possono metterci diversi
    // secondi (misurati 9 su desktop, dove il globo è più grande) e il globo
    // restava vuoto nel frattempo — niente viaggi, niente paesi. Si nascondono
    // nell'istante in cui i paesi entrano, così il cambio è netto.
    if (!vistaPrimaRef.current) {
      const c = map.getCenter();
      vistaPrimaRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() };
    }

    // Se i confini non arrivano (offline) o non c'è niente da colorare, i
    // pallini TORNANO: senza questa rete di sicurezza il globo restava vuoto
    // — niente viaggi, niente paesi — e sembrava rotto.
    const rinuncia = () => {
      paesiAttiviRef.current = false;
      if (!annullato && mapRef.current) mostraLayerViaggi(mapRef.current, true);
    };
    caricaPaesi().then(async paesi => {
      if (annullato || !mapRef.current) return;
      // `ordered` del render, non orderedRef: il ref lo riempie l'effetto dei
      // viaggi, che passa da un import asincrono — entrando in modalità paesi
      // troppo presto sarebbe ancora vuoto e non si colorerebbe niente.
      const visitati = [...paesiVisitati(ordered, paesi).values()];
      if (!visitati.length) { rinuncia(); return; }

      const poligoni: GeoJSON.Feature[] = [];
      const bandiere: GeoJSON.Feature[] = [];
      let sommaLon = 0, sommaLat = 0, quanti = 0;
      for (const { paese, code, nome, posizione } of visitati) {
        // Il poligono solo per chi ce l'ha: i micro-stati (Vaticano, San
        // Marino...) hanno geometrie sbagliate o assenti nel world-atlas, e
        // arrivano qui senza. La BANDIERA invece spetta a tutti — è ciò che
        // rende il conteggio della Home e il globo d'accordo.
        if (paese) {
          // `nome` e non paese.name: è quello in ITALIANO, preso dal viaggio
          // (il world-atlas conosce solo "Sweden"/"Italy").
          poligoni.push({ type: "Feature", properties: { nome }, geometry: paese.geometry });
        }
        if (!posizione) continue;
        sommaLon += posizione[0];
        sommaLat += posizione[1];
        quanti++;
        if (code) {
          bandiere.push({
            type: "Feature",
            properties: { icona: IMG_BANDIERA + code.toLowerCase() },
            geometry: { type: "Point", coordinates: posizione },
          });
        }
      }

      paesiAttiviRef.current = true;
      // Ora che i paesi ci sono, i pallini escono di scena: un solo istante di
      // cambio invece di secondi di globo spoglio.
      mostraLayerViaggi(map, false);
      aggiungiSorgente(map, SRC_PAESI, poligoni);   // può essere vuota: solo bandiere
      if (!map.getLayer(LAYER_PAESI_FILL)) {
        map.addLayer({
          id: LAYER_PAESI_FILL, type: "fill", source: SRC_PAESI,
          paint: { "fill-color": "#60a5fa", "fill-opacity": 0.45 },
        });
        map.addLayer({
          id: LAYER_PAESI_BORDO, type: "line", source: SRC_PAESI,
          paint: { "line-color": "#93c5fd", "line-width": 0.8, "line-opacity": 0.9 },
        });
      }

      // La telecamera va sui propri paesi tenendo il GLOBO INTERO in vista
      // (zoom basso apposta): avvicinandosi di più le bandiere sarebbero più
      // grandi ma la sfera uscirebbe dallo schermo e diventerebbe una mappa.
      if (quanti > 0) {
        map.flyTo({ center: [sommaLon / quanti, sommaLat / quanti], zoom: zoomGloboRef.current, duration: 1100 });
      }

      // Le bandiere sono immagini di rete: si registrano PRIMA del layer che le
      // nomina, e chi non arriva (offline) semplicemente non compare — il paese
      // resta comunque colorato, che è l'informazione principale.
      const arrivate = await registraBandiere(map, bandiere);
      if (annullato || !mapRef.current) return;
      aggiungiSorgente(map, SRC_BANDIERE, arrivate);
      if (arrivate.length && !map.getLayer(LAYER_BANDIERE)) {
        map.addLayer({
          id: LAYER_BANDIERE, type: "symbol", source: SRC_BANDIERE,
          layout: {
            "icon-image": ["get", "icona"] as unknown as StyleExpr,
            "icon-size": 1, "icon-allow-overlap": true, "icon-ignore-placement": true,
          },
        });
      }
    }).catch(rinuncia);   // world-atlas irraggiungibile: meglio i pallini che il vuoto

    return () => { annullato = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, modalitaPaesi, ordered, autoRotateSetting]);

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

      {/* Qui c'era la legenda "● Casa". RIMOSSA: una legenda con UNA sola voce
          non è una legenda, è un'etichetta che spiega un pallino già evidente
          (l'unico ambra del globo, da cui partono tutte le rotte). Non era
          cliccabile e non centrava nulla: occupava un angolo per zero
          informazione. Il pallino di casa sul globo RESTA — senza, il punto di
          partenza sparisce e le rotte nascono dal nulla. */}

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
