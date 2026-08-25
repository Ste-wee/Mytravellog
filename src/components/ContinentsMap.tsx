// [FROZEN] — Non modificare senza esplicita richiesta
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/settings";
import { Check } from "lucide-react";
import { Trip as LocalTrip } from "@/lib/storage";
import { loadWorldAtlasCountries, polygonsOf } from "@/lib/worldAtlas";
// La geometria "in quale paese cade il punto" vive in lib/paesi.ts: la usa
// anche il globo della Home, e la regola del poligono più piccolo (nata dal
// caso Russia/Lapponia) deve avere UNA sola implementazione.
import { areaPoligonoCheContiene, deriveCountryId, paeseDelPunto, bboxDiPoligoni, paesiToccatiDaViaggio, paeseVisibileDiViaggio, paeseVisibileDiTappa, type PaeseGeom } from "@/lib/paesi";
import { ISO_A2_CONTINENTE, ISO_NUMERICO_A2 } from "@/lib/isoPaesi";
export { areaPoligonoCheContiene, deriveCountryId, paeseDelPunto } from "@/lib/paesi";
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

/** Il continente di un paese dal suo codice: un dato, non una stima.
 *  Esportata per i test: è la regola che ha sostituito i rettangoli. */
export function continenteDiCodice(code: string | null | undefined): string | null {
  const c = (code ?? "").toUpperCase();
  // le nazioni UK (GB-SCT…) stanno in Europa come il Regno Unito
  const base = c.startsWith("GB-") ? "GB" : c;
  return ISO_A2_CONTINENTE[base] ?? null;
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

export type CountryFeat = PaeseGeom & {
  path: string;
  centroid: [number, number]; // lon, lat
};

let cachedCountryFeats: CountryFeat[] | null = null;

/** Test-only: reset la cache dei country feats tra i test. */
export function __clearCountryFeatsCache() {
  cachedCountryFeats = null;
}

export function ContinentsMap({ trips }: Props) {
  const t = useT();
  const [countries, setCountries] = useState<CountryFeat[]>(cachedCountryFeats ?? []);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<{ code: string; name: string; trips: LocalTrip[] } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (cachedCountryFeats) { setCountries(cachedCountryFeats); return; }
    let cancelled = false;
    // Fetch, cache e conversione topojson vivono in worldAtlas.ts (condivisi
    // con posterSvg: prima lo stesso file veniva scaricato due volte a sessione).
    // 110m e non 50m, misurato: il 50m conosce anche i micro-stati ma porta i
    // path da 148 KB a 1,4 MB nel DOM e l'apertura della pagina da 620 a 1600
    // ms. Su un planisfero largo 450 unità il Vaticano occuperebbe un
    // millesimo di pixel: invisibile comunque. Il globo della Home usa il 50m
    // perché lì ci si può avvicinare, e infatti lo colora.
    loadWorldAtlasCountries("110m")
      .then((geo) => {
        if (cancelled) return;
        const feats: CountryFeat[] = geo.features.map((f, idx) => {
          const path = geoToPath(f.geometry);
          const c = polyCentroid(f.geometry);
          const polygons = extractPolygons(f.geometry);
          const id = deriveCountryId(f, idx);
          return { id, name: f.properties?.name ?? id, path, centroid: c, polygons, bbox: bboxDiPoligoni(polygons) };
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

  /**
   * I continenti visitati, dal CODICE del paese e non dalle coordinate.
   *
   * Prima si indovinava con dei rettangoli di latitudine/longitudine, e
   * sbagliava: Panama finiva in Sud America, le Canarie in Africa. Il
   * continente di un paese è un dato pubblicato dalla ISO, non una stima
   * geometrica — vedi ISO_A2_CONTINENTE. I rettangoli restano solo per i
   * viaggi che un codice paese non ce l'hanno.
   */
  const visitedContinents = useMemo(() => {
    const set = new Set<Continent>();
    for (const t of trips) {
      const p = paeseVisibileDiViaggio(t);
      const punti: { code: string | null; lat: number; lon: number }[] = [
        { code: p.codice, lat: t.latitude, lon: t.longitude },
        ...(t.waypoints ?? []).filter(w => w.lat != null && w.lon != null)
          .map(w => ({ code: paeseVisibileDiTappa(w, p).codice, lat: w.lat as number, lon: w.lon as number })),
      ];
      for (const punto of punti) {
        const daCodice = continenteDiCodice(punto.code);
        const c = (daCodice as Continent | null) ?? classifyContinent(punto.lat, punto.lon);
        if (c) set.add(c);
      }
    }
    return set;
  }, [trips]);

  /**
   * Paesi visitati, viaggi per paese e nome/codice da mostrare: tutto deciso
   * dal codice salvato nel viaggio, esattamente come sul globo della Home.
   *
   * Il match geometrico ("in che poligono cade il punto?") era la fonte di
   * bug ricorrenti — la Russia visitata da un viaggio in Lapponia, il Vaticano
   * scambiato per l'Italia — e sopravvive solo come rete di sicurezza dentro
   * paesiToccatiDaViaggio, per i dati vecchi senza codice.
   *
   * Nota storica sul "quali viaggi": prima si teneva il primo viaggio
   * dell'elenco, e per un paese solo attraversato era quello sbagliato — un
   * Milano→Trieste→Vienna, toccando l'ITALIA, apriva un pannello intestato
   * "Austria". Ora ogni paese porta i viaggi che l'hanno davvero toccato.
   */
  const { visitedCountryIds, tripsByCountryId, infoByCountryId } = useMemo(() => {
    const ids = new Set<string>();
    const map = new Map<string, LocalTrip[]>();
    const info = new Map<string, { name: string; code: string }>();
    if (!countries.length) return { visitedCountryIds: ids, tripsByCountryId: map, infoByCountryId: info };
    for (const t of trips) {
      for (const p of paesiToccatiDaViaggio(t, countries)) {
        ids.add(p.id);
        const arr = map.get(p.id) ?? [];
        arr.push(t);
        map.set(p.id, arr);
        // Il primo nome utile vince: è nella lingua dell'utente e col codice
        // alpha-2, che il topojson non ha (nomi inglesi, id numerici).
        if (!info.has(p.id) && p.name) info.set(p.id, { name: p.name, code: p.code });
      }
    }
    return { visitedCountryIds: ids, tripsByCountryId: map, infoByCountryId: info };
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
        <h2 className="text-lg font-bold text-foreground">{t("Mappa del mondo")}</h2>
</div>

      <div className="w-full rounded-xl p-3" style={{ background: "#060e1e" }}>
        {/* Prima, se il fetch del topojson falliva, l'area restava vuota per
            sempre — indistinguibile da "nessun paese visitato". */}
        {fetchFailed && countries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            {t("Non è stato possibile caricare la mappa. Controlla la connessione e riprova più tardi.")}
          </p>
        ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto block"
          role="img"
          // Dice quello che la mappa MOSTRA: da quando evidenzia i continenti e
          // non più i singoli stati, "paesi visitati" era una promessa che chi
          // ascolta non poteva verificare.
          aria-label={t("Mappa dei continenti visitati")}
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
              // Il continente di QUESTO paese: dal suo codice, non dal centroide.
              // Coi rettangoli, Panama risultava sudamericano e la Spagna si
              // spezzava fra Europa e Africa per via delle Canarie.
              const countryContinent = (continenteDiCodice(ISO_NUMERICO_A2[c.id]) as Continent | null)
                ?? classifyContinent(c.centroid[1], c.centroid[0]);
              const continentVisited = countryContinent ? visitedContinents.has(countryContinent) : false;
              // UN SOLO LIVELLO: il continente visitato, e basta (scelta di
              // Stefano, 2026-08-21). Prima erano due — lo stato visitato in
              // azzurro pieno sopra il continente in blu tenue — e la mappa
              // raccontava due cose insieme; i singoli paesi li mostrano già
              // il globo della Home e i chip dell'elenco qui sotto.
              //
              // 0.55 e non più 0.42: quel valore era tarato per fare da SFONDO
              // sotto gli stati pieni (ruolo "contesto" della scala dei
              // contrasti). Ora che è l'unico segno della mappa può prendersi
              // il peso di un dato, senza diventare sgargiante.
              const fill = continentVisited ? "rgba(96,165,250,0.55)" : "#16233d";
              return (
                <path
                  key={c.id}
                  d={c.path}
                  fill={fill}
                  stroke="#060e1e"
                  strokeWidth={0.5}
                  strokeLinejoin="round"
                  // Il tocco resta sugli stati VISITATI (apre i loro viaggi e le
                  // regioni), anche se ora non hanno più un colore proprio che
                  // lo annunci: la funzione non si perde, e chi la cerca la
                  // trova comunque dai chip "Elenco dei paesi".
                  onClick={isVisited ? () => handleCountryClick(c) : undefined}
                  onKeyDown={isVisited ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCountryClick(c); } } : undefined}
                  tabIndex={isVisited ? 0 : undefined}
                  style={{ cursor: isVisited ? "pointer" : "default" }}
                  role={isVisited ? "button" : undefined}
                  aria-label={isVisited ? t("Viaggi in {paese}", { paese: nomePaese(c) }) : undefined}
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
