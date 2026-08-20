// [FROZEN] — Non modificare senza esplicita richiesta
import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Trip as LocalTrip } from "@/lib/storage";
import { loadWorldAtlasCountries, polygonsOf } from "@/lib/worldAtlas";
import { CountryMapModal } from "@/components/CountryMapModal";

// Approximate continent bounding boxes (lat, lon)
// Used to classify both trip markers AND country centroids
type Continent = "Africa" | "Antartide" | "Asia" | "Europa" | "Nord America" | "Oceania" | "Sud America";

const CONTINENTS: Continent[] = [
  "Africa", "Antartide", "Asia", "Europa", "Nord America", "Oceania", "Sud America",
];

/**
 * Un viaggio non tocca solo la destinazione finale: ogni waypoint intermedio
 * ha coordinate proprie ed è una tappa effettivamente visitata (con data e
 * mezzo di trasporto). Le raccogliamo tutte per il conteggio di paesi/continenti.
 */
export function allVisitedPoints(trips: LocalTrip[]): { lat: number; lon: number }[] {
  const points: { lat: number; lon: number }[] = [];
  for (const t of trips) {
    points.push({ lat: t.latitude, lon: t.longitude });
    for (const w of t.waypoints ?? []) {
      if (w.lat != null && w.lon != null) points.push({ lat: w.lat, lon: w.lon });
    }
  }
  return points;
}

function classifyContinent(lat: number, lon: number): Continent | null {
  if (lat < -60) return "Antartide";
  // Europe
  if (lat >= 36 && lat <= 71 && lon >= -25 && lon <= 45) return "Europa";
  // Africa
  if (lat >= -35 && lat < 37 && lon >= -20 && lon <= 52) return "Africa";
  // Asia (broad)
  if (lat >= 0 && lat <= 78 && lon > 45 && lon <= 180) return "Asia";
  if (lat >= -10 && lat < 8 && lon >= 95 && lon <= 141) return "Asia"; // Indonesia etc.
  // Oceania
  if (lat >= -50 && lat < 0 && lon >= 110 && lon <= 180) return "Oceania";
  if (lat >= -50 && lat < 0 && lon >= -180 && lon <= -130) return "Oceania";
  // Americas
  if (lat >= 12 && lon >= -170 && lon <= -50) return "Nord America";
  if (lat < 12 && lat >= -60 && lon >= -90 && lon <= -34) return "Sud America";
  if (lat >= -60 && lat < 12 && lon >= -120 && lon <= -75) return "Sud America";
  return null;
}

// Full equirectangular world dimensions (no clamping → no horizontal artifacts)
const W = 450;
// Full world height if we used the entire latitude range -180..180 lon, -90..90 lat
const FULL_H = W / 2; // = 225
// We crop the poles via viewBox instead of clamping coordinates.
// Latitude range we want to display:
const LAT_MAX = 83;
const LAT_MIN = -58;
// Visible height after cropping the poles
const H = Math.round((FULL_H * (LAT_MAX - LAT_MIN)) / 180); // ~176

function project(lon: number, lat: number): [number, number] {
  const x = ((lon + 180) / 360) * W;
  // Map latitude linearly across the full sphere, then we crop via viewBox
  const yFull = ((90 - lat) / 180) * FULL_H;
  // Shift so that LAT_MAX becomes y=0 in the cropped viewBox
  const yOffset = ((90 - LAT_MAX) / 180) * FULL_H;
  return [x, yFull - yOffset];
}


interface Props {
  trips: LocalTrip[];
}

export type CountryFeat = {
  id: string;
  name: string;
  path: string;
  centroid: [number, number]; // lon, lat
  polygons: number[][][][]; // list of polygons; each polygon = list of rings of [lon,lat]
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat] — prefiltro per pointInCountry
};

/**
 * Bounding box [minLon, minLat, maxLon, maxLat] di un paese. Prefiltro
 * economico prima del costoso pointInCountry (ray casting su ogni vertice di
 * ogni ring): se il punto è fuori dal box è sicuramente fuori dal paese.
 * Conservativo: per i paesi che attraversano ±180° (Russia, Fiji) il box
 * risulta molto ampio → nessuno speedup ma nemmeno falsi negativi.
 */
function computeBbox(polygons: number[][][][]): [number, number, number, number] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const poly of polygons) {
    for (const ring of poly) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

// I confini dei paesi non cambiano a runtime, ma senza cache il topojson
// (e il ricalcolo di path/centroidi/poligoni per ogni paese) verrebbe
// ri-scaricato ed elaborato ogni volta che questa pagina si smonta e
// rimonta — es. navigando Statistiche → Home → Statistiche con HashRouter.
let cachedCountryFeats: CountryFeat[] | null = null;

/** Test-only: reset la cache dei country feats tra i test. */
export function __clearCountryFeatsCache() {
  cachedCountryFeats = null;
}

export function ContinentsMap({ trips }: Props) {
  const [countries, setCountries] = useState<CountryFeat[]>(cachedCountryFeats ?? []);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<{ code: string; name: string; trips: LocalTrip[] } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (cachedCountryFeats) { setCountries(cachedCountryFeats); return; }
    let cancelled = false;
    // Fetch, cache e conversione topojson vivono in worldAtlas.ts (condivisi
    // con posterSvg: prima lo stesso file veniva scaricato due volte a sessione).
    loadWorldAtlasCountries("110m")
      .then((geo) => {
        if (cancelled) return;
        const feats: CountryFeat[] = geo.features.map((f, idx) => {
          const path = geoToPath(f.geometry);
          const c = polyCentroid(f.geometry);
          const polygons = extractPolygons(f.geometry);
          const id = deriveCountryId(f, idx);
          return { id, name: f.properties?.name ?? id, path, centroid: c, polygons, bbox: computeBbox(polygons) };
        });
        cachedCountryFeats = feats;
        setCountries(feats);
      })
      // Prima l'area restava vuota per sempre, senza dire perché: ora un
      // messaggio spiega che la mappa non si è caricata (rete assente/CDN
      // irraggiungibile) invece di sembrare semplicemente "nessun paese visitato".
      .catch(() => { if (!cancelled) setFetchFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // Ogni tappa (waypoint) attraversata conta come "visitata", non solo la
  // destinazione finale del viaggio.
  const visitedPoints = useMemo(() => allVisitedPoints(trips), [trips]);

  const visitedContinents = useMemo(() => {
    const set = new Set<Continent>();
    for (const p of visitedPoints) {
      const c = classifyContinent(p.lat, p.lon);
      if (c) set.add(c);
    }
    return set;
  }, [visitedPoints]);

  const visitedCountryIds = useMemo(() => {
    const set = new Set<string>();
    if (!countries.length) return set;
    for (const p of visitedPoints) {
      const c = paeseDelPunto(p.lon, p.lat, countries);
      if (c) set.add(c.id);
    }
    return set;
  }, [visitedPoints, countries]);

  // Quali viaggi hanno toccato ciascun paese (destinazione o una tappa): serve
  // a rispondere al tap su un paese visitato con "questi viaggi ci sono stati",
  // esattamente come i chip in "Elenco dei paesi" (StatsSection) — prima il
  // tap non faceva assolutamente nulla. Il match è geometrico (stesso
  // pointInCountry di visitedCountryIds), non per nome/codice paese: i confini
  // del world-atlas non condividono un identificatore con trip.country_code.
  // Nello stesso giro geometrico si registra anche NOME e CODICE del paese,
  // presi dal punto che ci è caduto dentro (tappa o destinazione).
  //
  // Prima si usava il primo viaggio dell'elenco: per un paese attraversato solo
  // di passaggio era il viaggio SBAGLIATO. Un Milano→Trieste→Vienna faceva
  // aprire, toccando l'ITALIA, un pannello intestato "Austria" con bandiera
  // austriaca e confini austriaci scaricati — cioè la mappa di un altro paese.
  const { tripsByCountryId, infoByCountryId } = useMemo(() => {
    const map = new Map<string, LocalTrip[]>();
    const info = new Map<string, { name: string; code: string }>();
    if (!countries.length) return { tripsByCountryId: map, infoByCountryId: info };
    for (const t of trips) {
      const points = [
        { lat: t.latitude, lon: t.longitude, name: t.country, code: t.country_code },
        ...(t.waypoints ?? []).filter(w => w.lat != null && w.lon != null)
          .map(w => ({ lat: w.lat!, lon: w.lon!, name: w.country, code: w.country_code })),
      ];
      const touchedIds = new Set<string>();
      for (const p of points) {
        // Stessa regola di visitedCountryIds (poligono più piccolo): altrimenti
        // il tap su un paese mostrerebbe i viaggi di un altro.
        const c = paeseDelPunto(p.lon, p.lat, countries);
        if (!c) continue;
        touchedIds.add(c.id);
        // Il primo punto che cade qui dà il nome: è nella lingua dell'utente
        // e col codice alpha-2, che il topojson non ha (nomi inglesi, id M49).
        if (!info.has(c.id) && p.name) info.set(c.id, { name: p.name, code: p.code ?? "" });
      }
      for (const id of touchedIds) {
        const arr = map.get(id) ?? [];
        arr.push(t);
        map.set(id, arr);
      }
    }
    return { tripsByCountryId: map, infoByCountryId: info };
  }, [trips, countries]);

  /** Nome del paese come lo chiama l'utente; ripiego sul topojson (inglese). */
  const nomePaese = (c: CountryFeat) => infoByCountryId.get(c.id)?.name ?? c.name;

  const handleCountryClick = (c: CountryFeat) => {
    const countryTrips = tripsByCountryId.get(c.id);
    if (!countryTrips || countryTrips.length === 0) return; // paese non visitato: nessun viaggio da mostrare
    const info = infoByCountryId.get(c.id);
    setSelectedCountry({
      code: info?.code ?? "",
      name: info?.name ?? c.name,
      trips: countryTrips.slice().sort((a, b) => b.trip_date.localeCompare(a.trip_date)),
    });
  };

  return (
    <div className="glass-card p-5 animate-fade-up">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-foreground">Mappa del mondo</h2>
</div>

      <div className="w-full rounded-xl p-3" style={{ background: "#060e1e" }}>
        {/* Prima, se il fetch del topojson falliva, l'area restava vuota per
            sempre — indistinguibile da "nessun paese visitato". */}
        {fetchFailed && countries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            Non è stato possibile caricare la mappa. Controlla la connessione e riprova più tardi.
          </p>
        ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto block"
          role="img"
          aria-label="Mappa dei paesi visitati"
        >
          <defs>
            <clipPath id="map-clip">
              <rect x={0} y={0} width={W} height={H} />
            </clipPath>
          </defs>
          <rect x={0} y={0} width={W} height={H} fill="#060e1e" />
          <g clipPath="url(#map-clip)">
            {countries.map((c) => {
              const isVisited = visitedCountryIds.has(c.id);
              const countryContinent = classifyContinent(c.centroid[1], c.centroid[0]);
              const continentVisited = countryContinent ? visitedContinents.has(countryContinent) : false;
              // Il continente visitato è CONTESTO: la scala dei contrasti
              // dell'app dà 0.45 a questo ruolo (0.75 dati, 0.6 etichette), e
              // 0.22 era metà della soglia — l'Europa si doveva cercare. A 0.42
              // si legge a colpo d'occhio senza toccare la gerarchia: il blu
              // pieno resta l'unico segno del paese davvero visitato.
              const fill = isVisited
                ? "#0ea5e9"
                : continentVisited
                  ? "rgba(96,165,250,0.42)"
                  : "#16233d";
              return (
                <path
                  key={c.id}
                  d={c.path}
                  fill={fill}
                  stroke="#060e1e"
                  strokeWidth={0.5}
                  strokeLinejoin="round"
                  onClick={isVisited ? () => handleCountryClick(c) : undefined}
                  onKeyDown={isVisited ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCountryClick(c); } } : undefined}
                  tabIndex={isVisited ? 0 : undefined}
                  style={{ cursor: isVisited ? "pointer" : "default" }}
                  role={isVisited ? "button" : undefined}
                  aria-label={isVisited ? `Viaggi in ${nomePaese(c)}` : undefined}
                >
                  {/* Nome nella lingua dell'utente: il tooltip e il lettore di
                      schermo dicevano "Italy" mentre il resto dell'app dice
                      "Italia" (il topojson dei confini è in inglese). */}
                  {isVisited && <title>{nomePaese(c)}</title>}
                </path>
              );
            })}
          </g>
        </svg>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {CONTINENTS.map((c) => {
          const v = visitedContinents.has(c);
          return (
            <div
              key={c}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium ${
                v
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-muted/20 border-border text-muted-foreground"
              }`}
            >
              <span>{c}</span>
              {/* La ✓ resta sui visitati; la × sui non visitati sembrava un
                  bottone per rimuoverli — il chip spento dice già tutto. */}
              {v && <Check className="w-3.5 h-3.5" aria-hidden />}
            </div>
          );
        })}
      </div>

      {selectedCountry && (
        <CountryMapModal
          countryCode={selectedCountry.code}
          countryName={selectedCountry.name}
          trips={selectedCountry.trips}
          onClose={() => setSelectedCountry(null)}
        />
      )}
    </div>
  );
}

// --- Geometry helpers ---

/**
 * Some world-atlas TopoJSON features (e.g. Antarctica, a few disputed
 * territories) have no numeric `id`. String(undefined) === "undefined" for
 * all of them, which made every such feature share the same React key.
 * Fall back to the feature name, then to the array index, to guarantee
 * uniqueness.
 */
export function deriveCountryId(f: { id?: unknown; properties?: { name?: string } }, index: number): string {
  if (f.id != null) return String(f.id);
  if (f.properties?.name) return f.properties.name;
  return `unknown-${index}`;
}

function geoToPath(geom: GeoJSON.Geometry | null | undefined): string {
  if (!geom) return "";
  if (geom.type === "Polygon") return polyToPath(geom.coordinates);
  if (geom.type === "MultiPolygon")
    return geom.coordinates.map(poly => polyToPath(poly)).join(" ");
  return "";
}

// Split a ring whenever consecutive points jump across the antimeridian
// (longitude difference > 180°). Without this the equirectangular projection
// draws a long horizontal line across the whole map for any country whose
// polygon crosses the ±180° meridian (Russia, Antarctica, Fiji, Kiribati…).
export function splitRingAtAntimeridian(ring: number[][]): number[][][] {
  const segments: number[][][] = [];
  let current: number[][] = [];
  let prevLon: number | null = null;
  for (const point of ring) {
    const lon = point[0];
    if (prevLon !== null && Math.abs(lon - prevLon) > 180) {
      if (current.length) segments.push(current);
      current = [];
    }
    current.push(point);
    prevLon = lon;
  }
  if (current.length) segments.push(current);
  return segments;
}

function polyToPath(rings: number[][][]): string {
  return rings
    .map((ring) => {
      const segments = splitRingAtAntimeridian(ring);
      return segments
        .map((seg) => {
          if (seg.length < 2) return "";
          const pts = seg.map(([lon, lat]) => project(lon, lat));
          return (
            "M" +
            pts
              .map(([x, y], i) => `${i === 0 ? "" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
              .join(" ")
          );
        })
        .filter(Boolean)
        .join(" ");
    })
    .join(" ");
}

function polyCentroid(geom: GeoJSON.Geometry): [number, number] {
  // Returns [lon, lat] approximate centroid
  let coords: number[][] = [];
  if (geom.type === "Polygon") coords = geom.coordinates[0];
  else if (geom.type === "MultiPolygon") {
    // pick the largest ring
    let best: number[][] = [];
    for (const poly of geom.coordinates) {
      if (poly[0].length > best.length) best = poly[0];
    }
    coords = best;
  }
  if (!coords.length) return [0, 0];
  let lon = 0, lat = 0;
  for (const [x, y] of coords) { lon += x; lat += y; }
  return [lon / coords.length, lat / coords.length];
}

// La normalizzazione Polygon/MultiPolygon è condivisa: vive in worldAtlas.ts.
const extractPolygons = polygonsOf;

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Area del bounding box del poligono PIÙ PICCOLO che contiene il punto,
 * o Infinity se nessuno lo contiene. Serve a scegliere fra più candidati.
 */
export function areaPoligonoCheContiene(lon: number, lat: number, polygons: number[][][][]): number {
  let minima = Infinity;
  for (const poly of polygons) {
    if (!poly.length || !pointInRing(lon, lat, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) if (pointInRing(lon, lat, poly[h])) { inHole = true; break; }
    if (inHole) continue;
    let mnLo = Infinity, mxLo = -Infinity, mnLa = Infinity, mxLa = -Infinity;
    for (const [lo, la] of poly[0]) {
      if (lo < mnLo) mnLo = lo; if (lo > mxLo) mxLo = lo;
      if (la < mnLa) mnLa = la; if (la > mxLa) mxLa = la;
    }
    const area = (mxLo - mnLo) * (mxLa - mnLa);
    if (area < minima) minima = area;
  }
  return minima;
}

/**
 * In quale paese cade il punto? Vince il poligono PIÙ PICCOLO fra quelli che
 * lo contengono, non il primo dell'elenco.
 *
 * Perché: il poligono continentale della Russia va da -180° a +180° (scavalca
 * l'antimeridiano in Chukotka) e il ray casting su una forma che avvolge il
 * mondo dà falsi positivi — Kiruna e Abisko, in Svezia, risultavano dentro la
 * Russia. Fermandosi al primo match vinceva la Russia solo perché nel
 * world-atlas è la 18ª feature e la Svezia la 110ª: la mappa mostrava la
 * Russia visitata per un viaggio in Lapponia (segnalato da Stefano).
 * Il poligono svedese è minuscolo rispetto a quello russo: il più piccolo è
 * sempre il più specifico. Verificato che Mosca, Vladivostok, Chukotka,
 * Alaska, Fiji e Nuova Zelanda restano attribuite correttamente.
 */
export function paeseDelPunto(lon: number, lat: number, countries: CountryFeat[]): CountryFeat | null {
  let vincitore: CountryFeat | null = null;
  let areaMin = Infinity;
  for (const c of countries) {
    if (lon < c.bbox[0] || lon > c.bbox[2] || lat < c.bbox[1] || lat > c.bbox[3]) continue;
    const area = areaPoligonoCheContiene(lon, lat, c.polygons);
    if (area < areaMin) { areaMin = area; vincitore = c; }
  }
  return vincitore;
}

function pointInCountry(lon: number, lat: number, polygons: number[][][][]): boolean {
  for (const poly of polygons) {
    if (!poly.length) continue;
    if (pointInRing(lon, lat, poly[0])) {
      let inHole = false;
      for (let h = 1; h < poly.length; h++) {
        if (pointInRing(lon, lat, poly[h])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
  }
  return false;
}
