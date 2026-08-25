import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/settings";
import { createPortal } from "react-dom";
import { Trip } from "@/lib/storage";
import { polygonsOf } from "@/lib/worldAtlas";
import { pointInPolygons } from "@/lib/pointInPolygon";
import { hasCoords } from "@/lib/coords";
import { useModalFocus } from "@/lib/useModalFocus";
import { ISO2_TO_ISO3 } from "@/lib/iso3166";
import { X } from "lucide-react";

/**
 * geoBoundaries ritorna URL nella forma github.com/<owner>/<repo>/raw/<ref>/<path>:
 * un redirect (302) verso media.githubusercontent.com il cui hop intermedio ha
 * un header Access-Control-Allow-Origin vuoto, bloccato dal browser come CORS
 * error. raw.githubusercontent.com serve lo stesso path senza redirect e con
 * CORS permissivo — ma per i file più grandi (i paesi con confini più
 * complessi) tracciati con Git LFS ritorna solo il file puntatore testuale,
 * non il contenuto reale, che va letto da media.githubusercontent.com usando
 * l'hash completo del commit (risolto via l'API di GitHub, anch'essa CORS-friendly).
 */
export function parseGithubRawUrl(url: string): { owner: string; repo: string; ref: string; path: string } | null {
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/);
  return m ? { owner: m[1], repo: m[2], ref: m[3], path: m[4] } : null;
}

export function isGitLfsPointer(text: string): boolean {
  return text.trimStart().startsWith("version https://git-lfs");
}

// GeoJSON di geoBoundaries: poligoni regionali con le due proprietà che usiamo.
type RegionGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;
type RegionFeature = GeoJSON.Feature<RegionGeometry, { shapeName?: string; shapeISO?: string | null }>;

/**
 * Perché i confini non sono arrivati. Serve a non mentire all'utente:
 * "Mappa non disponibile per questo paese" andava bene solo per `assente`,
 * mentre col limite di richieste (429 di raw.githubusercontent, che succede
 * aprendo molte mappe di fila) il paese è supportatissimo.
 */
type MotivoErrore = "limite" | "offline" | "assente";
class ErroreConfini extends Error {
  constructor(public motivo: MotivoErrore) { super(motivo); }
}

/** 429 = ci hanno chiuso il rubinetto; vale per GitHub raw, media e API. */
const seLimite = (r: Response) => { if (r.status === 429) throw new ErroreConfini("limite"); };

async function fetchGithubRawJson(url: string): Promise<{ features?: unknown } | null> {
  const parsed = parseGithubRawUrl(url);
  const directUrl = parsed
    ? `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.ref}/${parsed.path}`
    : url;
  const r = await fetch(directUrl);
  seLimite(r);
  if (!r.ok) return null;
  const text = await r.text();
  if (!isGitLfsPointer(text)) return JSON.parse(text);
  if (!parsed) return null;

  // File tracciato con Git LFS: media.githubusercontent accetta il ref COSÌ
  // COM'È nell'URL (anche lo sha corto) — niente api.github.com, che a 60
  // richieste/ora anonime era la vera causa dei 403 dopo qualche mappa.
  // L'API resta solo come ripiego se media rifiutasse il ref.
  const direttoR = await fetch(`https://media.githubusercontent.com/media/${parsed.owner}/${parsed.repo}/${parsed.ref}/${parsed.path}`);
  seLimite(direttoR);
  if (direttoR.ok) return await direttoR.json();

  const shaR = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits/${parsed.ref}`);
  seLimite(shaR);
  if (!shaR.ok) return null;
  const fullSha = (await shaR.json())?.sha;
  if (!fullSha) return null;
  const mediaUrl = `https://media.githubusercontent.com/media/${parsed.owner}/${parsed.repo}/${fullSha}/${parsed.path}`;
  const mediaR = await fetch(mediaUrl);
  seLimite(mediaR);
  if (!mediaR.ok) return null;
  return await mediaR.json();
}

/**
 * Suddivisioni di primo livello (regioni/stati/province) per praticamente
 * ogni paese del mondo, via l'API pubblica e gratuita di geoBoundaries.org
 * (nessuna chiave richiesta). Ogni feature ha "shapeName" (nome) e
 * "shapeISO" (codice ISO 3166-2, es. "AT-9") — quest'ultimo permette di
 * abbinare le regioni visitate senza dover tradurre i nomi paese per paese
 * (vedi REGION_ALIASES sotto, usata solo come fallback per i viaggi
 * salvati prima che venisse tracciato il codice ISO).
 */
// Per la maggior parte dei paesi ADM1 è il livello "regioni/stati/province"
// che ci si aspetta. Alcuni paesi però in geoBoundaries hanno un ADM1 diverso
// dalle suddivisioni amministrative comuni e le regioni vere stanno in ADM2:
//  - Italia: ADM1 = 5 macro-aree statistiche NUTS-1 (Nord-Ovest, Centro, …);
//    le 20 regioni vere (Lazio, Toscana, …) sono in ADM2.
//  - Grecia: ADM1 = 8 raggruppamenti macro; le 13 periferie vere (Attica,
//    Creta, …) + Monte Athos sono in ADM2.
//  - Belgio: ADM1 = le 3 regioni politiche (Fiandre, Vallonia, Bruxelles);
//    su una mappa dei viaggi sono povere, le 11 province stanno in ADM2.
//    (La Slovenia invece resta ADM1 nonostante dia solo 2 macro-aree:
//    l'ADM2 sono 212 comuni, illeggibili — le 12 regioni statistiche vere
//    in geoBoundaries non esistono.)
// Senza override la mappa mostrerebbe i blocchi macro e "0 regioni" perché i
// nomi salvati dai viaggi non combaciano con quelli delle macro-aree.
const ADM_LEVEL_BY_COUNTRY: Record<string, "ADM1" | "ADM2"> = {
  IT: "ADM2",
  GR: "ADM2",
  BE: "ADM2",
};

/**
 * L'elenco dei paesi presenti nel pacchetto locale, letto UNA volta per
 * sessione da `confini/index.json` (lo scrive `npm run confini`).
 *
 * Senza elenco ogni apertura di un paese non incluso sparava una richiesta
 * destinata al 404 — rumore negli strumenti di rete e, su GitHub Pages, una
 * pagina d'errore intera scaricata per nulla. Se il manifest non c'è (nessun
 * paese ancora generato) l'insieme è vuoto e il pacchetto locale viene
 * saltato del tutto: si va in rete come prima.
 */
let elencoLocale: Promise<Set<string>> | null = null;
function paesiNelPacchetto(): Promise<Set<string>> {
  if (!elencoLocale) {
    elencoLocale = fetch(`${import.meta.env.BASE_URL}confini/index.json`)
      .then(r => {
        if (r.ok) return r.json();
        // 404 = il pacchetto non esiste: è una risposta definitiva, si tiene.
        if (r.status === 404) return null;
        throw new Error(`manifest ${r.status}`);
      })
      .then(j => new Set<string>(Array.isArray(j?.paesi) ? j.paesi.map((c: string) => String(c).toUpperCase()) : []))
      .catch(() => {
        // Un errore di RETE non si cristallizza (la lezione di loadGis): se il
        // manifest non è arrivato perché l'app è partita offline, tenerlo in
        // cache significherebbe ignorare il pacchetto locale — che il service
        // worker avrebbe — per tutto il resto della sessione.
        elencoLocale = null;
        return new Set<string>();
      });
  }
  return elencoLocale;
}

/** Test-only: dimentica il manifest dei confini locali. */
export function __clearElencoLocale() {
  elencoLocale = null;
}

/**
 * I confini ospitati da NOI (`public/confini/<ISO2>.json`, generati una volta
 * con `npm run confini`). Stesso dominio dell'app: nessun limite di richieste,
 * nessun CORS, e il service worker li tiene offline.
 *
 * È il primo tentativo; se il paese non è ancora nel pacchetto si torna alla
 * rete come prima, così l'app funziona anche a pacchetto incompleto.
 */
async function fetchConfiniLocali(code2: string): Promise<RegionFeature[] | null> {
  try {
    if (!(await paesiNelPacchetto()).has(code2)) return null;
    const r = await fetch(`${import.meta.env.BASE_URL}confini/${code2}.json`);
    if (!r.ok) return null;
    const j = await r.json();
    const features = j?.features;
    return Array.isArray(features) && features.length > 0 ? (features as RegionFeature[]) : null;
  } catch {
    return null; // file assente o illeggibile: si passa alla rete
  }
}

/**
 * I confini del paese DALLA RETE (geoBoundaries → GitHub). Il pacchetto
 * locale non passa di qui: lo tenta `load` per primo, perché la provenienza
 * decide la persistenza — i confini di rete vale la pena tenerli in
 * localStorage (evitano un fetch limitato), quelli locali no: sarebbero una
 * seconda copia degli stessi dati nello spazio (5 MB in tutto) che l'app
 * condivide con i viaggi, e il file è già cache del service worker.
 */
async function fetchCountryRegions(countryCode2: string): Promise<RegionFeature[] | null> {
  const code2 = countryCode2?.toUpperCase();
  const iso3 = ISO2_TO_ISO3[code2];
  if (!iso3) return null;
  const admLevel = ADM_LEVEL_BY_COUNTRY[code2] ?? "ADM1";
  try {
    const metaUrl = `https://www.geoboundaries.org/api/current/gbOpen/${iso3}/${admLevel}/`;
    const metaR = await fetch(metaUrl);
    seLimite(metaR);
    if (!metaR.ok) return null;
    const meta = await metaR.json();
    const geoUrl: string | undefined = meta?.simplifiedGeometryGeoJSON || meta?.gjDownloadURL;
    if (!geoUrl) return null;
    const geo = await fetchGithubRawJson(geoUrl);
    const features = geo?.features;
    return Array.isArray(features) && features.length > 0 ? (features as RegionFeature[]) : null;
  } catch (e) {
    // Il MOTIVO non va inghiottito: "troppe richieste" e "sei senza rete" non
    // sono "questo paese non è supportato", e prima finivano tutti nello
    // stesso messaggio. Senza rete lo dice il browser, non serve indovinarlo.
    if (e instanceof ErroreConfini) throw e;
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ErroreConfini("offline");
    return null;
  }
}

// Fallback per i viaggi salvati prima che venisse tracciato il codice ISO
// 3166-2 (region_details): traduce i nomi inglese (da Nominatim EN) nei nomi
// locali usati dal GeoJSON. Con il codice ISO disponibile questo non serve
// più: l'abbinamento per codice è indipendente dalla lingua.
const REGION_ALIASES: Record<string, Record<string, string>> = {
  IT: {
    // English → Italian
    "tuscany": "toscana",
    "sicily": "sicilia",
    "sardinia": "sardegna",
    "apulia": "puglia",
    "piedmont": "piemonte",
    "lombardy": "lombardia",
    "veneto": "veneto",
    "liguria": "liguria",
    "umbria": "umbria",
    "marche": "marche",
    "lazio": "lazio",
    "abruzzo": "abruzzo",
    "molise": "molise",
    "campania": "campania",
    "basilicata": "basilicata",
    "calabria": "calabria",
    "aosta valley": "valle d'aosta/vallée d'aoste",
    "aosta": "valle d'aosta/vallée d'aoste",
    "valle d'aosta": "valle d'aosta/vallée d'aoste",
    "friuli-venezia giulia": "friuli-venezia giulia",
    "friuli venezia giulia": "friuli-venezia giulia",
    "emilia-romagna": "emilia-romagna",
    "emilia romagna": "emilia-romagna",
    "trentino-alto adige": "trentino-alto adige/südtirol",
    "trentino alto adige": "trentino-alto adige/südtirol",
    "south tyrol": "trentino-alto adige/südtirol",
    "trentino": "trentino-alto adige/südtirol",
  },
  ES: {
    "catalonia": "cataluña",
    "aragon": "aragón",
    "andalusia": "andalucía",
    "castile and león": "castilla y león",
    "castile-la mancha": "castilla-la mancha",
    "basque country": "país vasco",
    "valencian community": "comunitat valenciana",
    "canary islands": "canarias",
    "balearic islands": "illes balears",
    "navarre": "navarra",
    "la rioja": "la rioja",
    "extremadura": "extremadura",
    "galicia": "galicia",
    "asturias": "asturias",
    "cantabria": "cantabria",
    "murcia": "región de murcia",
    "madrid": "comunidad de madrid",
  },
  FR: {
    "brittany": "bretagne",
    "normandy": "normandie",
    "occitanie": "occitanie",
    "new aquitaine": "nouvelle-aquitaine",
    "auvergne-rhône-alpes": "auvergne-rhône-alpes",
    "provence-alpes-côte d'azur": "provence-alpes-côte d'azur",
    "ile-de-france": "île-de-france",
    "hauts-de-france": "hauts-de-france",
    "grand est": "grand est",
    "bourgogne-franche-comté": "bourgogne-franche-comté",
    "centre-val de loire": "centre-val de loire",
    "pays de la loire": "pays de la loire",
  },
  AT: {
    // Inglese (Nominatim) → Tedesco (nomi usati nel GeoJSON austriaco)
    "vienna": "wien",
    "tyrol": "tirol",
    "styria": "steiermark",
    "upper austria": "oberösterreich",
    "lower austria": "niederösterreich",
    "carinthia": "kärnten",
    "burgenland": "burgenland",
    "salzburg": "salzburg",
    "vorarlberg": "vorarlberg",
  },
  GR: {
    // Grecia (ADM2): geoBoundaries usa nomi traslitterati ("Attikis") senza
    // codice ISO, mentre Nominatim restituisce le periferie in greco e anch'esso
    // senza ISO — quindi l'unico abbinamento possibile è per nome, via questi
    // alias. Le CHIAVI sono già normalizzate (minuscolo, accenti rimossi) come
    // le confronta regionMatches; i VALORI sono lo shapeName esatto del GeoJSON.
    "περιφερεια ανατολικης μακεδονιας και θρακης": "Anatolikis Makedonias kai Thr*", // Macedonia Or. e Tracia
    "περιφερεια κεντρικης μακεδονιας": "Kentrikis Makedonias",   // Macedonia Centrale
    "περιφερεια δυτικης μακεδονιας": "Dytikis Makedonias",       // Macedonia Occidentale
    "περιφερεια ηπειρου": "Ipeiroy",                             // Epiro
    "περιφερεια θεσσαλιας": "Thessalias",                        // Tessaglia
    "περιφερεια στερεας ελλαδας": "Stereas Elladas",             // Grecia Centrale
    "περιφερεια ιονιων νησων": "Ionion Nison",                   // Isole Ionie
    "περιφερεια δυτικης ελλαδας": "Dytikis Elladas",             // Grecia Occidentale
    "περιφερεια πελοποννησου": "Peloponnisoy",                   // Peloponneso
    "περιφερεια αττικης": "Attikis",                             // Attica
    "περιφερεια βορειου αιγαιου": "Voreioy Aigaioy",             // Egeo Settentrionale
    "περιφερεια νοτιου αιγαιου": "Notioy Aigaioy",               // Egeo Meridionale
    "περιφερεια κρητης": "Kritis",                               // Creta
    "αυτονομη μοναστικη πολιτεια αγιου ορους": "Agion Oros",     // Monte Athos
  },
};

// Cache in memoria (per la sessione) + localStorage (tra le sessioni): i
// confini di un paese non cambiano, quindi non serve una scadenza. Evita di
// rifare fetch a geoBoundaries/GitHub ad ogni apertura del modal — l'API di
// GitHub usata per risolvere i file Git LFS (fetchGithubRawJson) è limitata a
// 60 richieste/ora senza autenticazione, quindi visitando molte mappe di
// paesi "pesanti" nella stessa sessione si rischia di esaurirla e vedere
// "Mappa non disponibile" per un paese in realtà supportato.
const geoCache: Record<string, RegionFeature[]> = {};
// v2: l'Italia ora scarica ADM2 (20 regioni) invece di ADM1 (5 macro-aree) —
// le cache v1 esistenti tenevano i confini sbagliati, il bump le invalida.
const GEO_LOCALSTORAGE_PREFIX = "geoBoundariesCache:v2:";

function readPersistedFeatures(countryCode: string): RegionFeature[] | null {
  try {
    const raw = localStorage.getItem(GEO_LOCALSTORAGE_PREFIX + countryCode);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writePersistedFeatures(countryCode: string, features: RegionFeature[]) {
  try {
    localStorage.setItem(GEO_LOCALSTORAGE_PREFIX + countryCode, JSON.stringify(features));
  } catch {
    // localStorage piena o non disponibile (es. modalità privata): la cache
    // in-memory resta comunque valida per la sessione corrente.
  }
}

/** Libera la copia di rete pregressa quando il paese entra nel pacchetto
 *  locale: sono gli stessi dati, e quello spazio è condiviso coi viaggi. */
function removePersistedFeatures(countryCode: string) {
  try {
    localStorage.removeItem(GEO_LOCALSTORAGE_PREFIX + countryCode);
  } catch {
    // non disponibile: pazienza, era solo pulizia
  }
}

/** Test-only: reset la cache del GeoJSON (in memoria e in localStorage) tra i test. */
export function __clearGeoCache() {
  __clearMemoryCache();
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(GEO_LOCALSTORAGE_PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

/** Test-only: reset solo la cache in memoria, per simulare un nuovo caricamento di pagina con localStorage già popolato. */
export function __clearMemoryCache() {
  for (const k of Object.keys(geoCache)) delete geoCache[k];
}

interface Props {
  countryCode: string;
  countryName: string;
  trips: Trip[];
  onClose: () => void;
}

function projectGeoJSON(features: RegionFeature[], W: number, H: number) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  // polygonsOf salta in silenzio le geometrie inattese (il tipo RegionFeature
  // è solo un cast su dati di rete/localStorage): una feature strana non deve
  // far cadere l'intero modal, come non lo faceva la vecchia ricorsione.
  for (const f of features) {
    for (const poly of polygonsOf(f.geometry)) for (const ring of poly) for (const [lon, lat] of ring) {
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
  }

  const pad = 20;
  const scaleX = (W - pad * 2) / (maxLon - minLon);
  const scaleY = (H - pad * 2) / (maxLat - minLat);
  const scale = Math.min(scaleX, scaleY);
  const offX = pad + ((W - pad * 2) - (maxLon - minLon) * scale) / 2;
  const offY = pad + ((H - pad * 2) - (maxLat - minLat) * scale) / 2;

  const project = (lon: number, lat: number): [number, number] => [
    offX + (lon - minLon) * scale,
    H - (offY + (lat - minLat) * scale),
  ];
  return { project };
}

function drawRing(ctx: CanvasRenderingContext2D, ring: GeoJSON.Position[], project: (lon: number, lat: number) => [number, number]) {
  if (!ring?.length) return;
  const [x0, y0] = project(ring[0][0], ring[0][1]);
  ctx.moveTo(x0, y0);
  for (let i = 1; i < ring.length; i++) {
    const [x, y] = project(ring[i][0], ring[i][1]);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function buildFeaturePath(ctx: CanvasRenderingContext2D, feature: RegionFeature, project: (lon: number, lat: number) => [number, number]) {
  ctx.beginPath();
  // Solo l'anello esterno di ogni poligono (poly[0]): i buchi non si disegnano.
  for (const poly of polygonsOf(feature.geometry)) drawRing(ctx, poly[0], project);
}

/** Normalize a region name for matching: lowercase, remove accents, trim */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "'")
    .trim();
}

/**
 * Returns true if a visited region (name + eventuale codice ISO) matches un
 * feature del GeoJSON.
 * 1. Match esatto per codice ISO 3166-2, quando presente su entrambi i lati
 * 2. Match esatto per nome dopo normalize — resta valido anche quando i
 *    codici sono entrambi presenti ma non coincidono: Nominatim e
 *    geoBoundaries usano a volte numerazioni ISO 3166-2 diverse per la
 *    stessa regione (es. Polonia: "PL-12" vs "PL-MA" per "Lesser Poland
 *    Voivodeship"), quindi un mismatch di codice non è di per sé prova che
 *    siano regioni diverse.
 * 3. Alias lookup (EN→locale) dopo normalize — solo fallback per viaggi
 *    salvati prima che il codice ISO venisse tracciato
 * 4. Substring containment dopo normalize — SOLO quando manca il codice su
 *    almeno un lato. Se entrambi i lati hanno un codice e non coincidono, il
 *    fallback per sottostringa va escluso: due regioni distinte possono
 *    avere nomi l'una sottostringa dell'altra (es. "Kyiv" città, codice
 *    UA-30, vs "Kyiv Oblast", codice UA-32 — la sottostringa le
 *    confonderebbe, contando 2 regioni visitate invece di 1).
 */
function regionMatches(
  visited: { name: string; code: string | null },
  geoName: string,
  geoCode: string | null,
  countryCode: string
): boolean {
  const bothHaveCodes = !!visited.code && !!geoCode;
  if (bothHaveCodes && visited.code!.toUpperCase() === geoCode!.toUpperCase()) return true;

  const t = normalize(visited.name);
  const g = normalize(geoName);

  if (t === g) return true;

  const aliases = REGION_ALIASES[countryCode?.toUpperCase()] ?? {};
  const resolved = aliases[t];
  if (resolved && normalize(resolved) === g) return true;

  if (bothHaveCodes) return false;

  if (t.length >= 4 && g.includes(t)) return true;
  if (g.length >= 4 && t.includes(g)) return true;

  return false;
}

/**
 * Raccoglie le regioni visitate di un paese da tutti i viaggi, deduplicate.
 * Usa region_details (nome+codice ISO) quando disponibile; per i viaggi
 * salvati prima di quel campo, ricade sul parsing del vecchio campo region
 * (stringa con nomi separati da virgola, nessun codice).
 */
/**
 * Tutti i punti toccati dai viaggi: destinazione E tappe intermedie.
 * Il dato di regione (`region_details`) l'app lo calcola SOLO per la
 * destinazione finale, quindi un Milano→Trieste→Vienna non faceva risultare
 * visitata nessuna regione italiana pur passando da Trieste. Con le coordinate
 * si risale alla regione dai confini che stiamo già disegnando.
 */
function visitedPoints(trips: Trip[]): { lon: number; lat: number }[] {
  const pts: { lon: number; lat: number }[] = [];
  for (const t of trips) {
    if (hasCoords(t.latitude, t.longitude)) pts.push({ lon: t.longitude, lat: t.latitude });
    for (const w of t.waypoints ?? []) {
      if (hasCoords(w.lat, w.lon)) pts.push({ lon: w.lon!, lat: w.lat! });
    }
  }
  return pts;
}

function collectVisitedRegions(trips: Trip[], countryCode?: string): { name: string; code: string | null }[] {
  const seen = new Set<string>();
  const out: { name: string; code: string | null }[] = [];
  const paese = (countryCode ?? "").toUpperCase();
  for (const t of trips) {
    const entries = t.region_details && t.region_details.length > 0
      ? t.region_details
      : (t.region ? t.region.split(",").map(r => ({ name: r.trim(), code: null as string | null })).filter(r => r.name) : []);
    for (const entry of entries) {
      // SOLO le regioni di QUESTO paese. I viaggi arrivano qui perché toccano
      // il paese, ma le loro region_details descrivono la destinazione: per
      // l'Austria comparivano anche "Slovenia" e "Friuli-Venezia Giulia",
      // regioni di altri stati. Il codice ISO 3166-2 porta il paese nel
      // prefisso ("IT-36"); le voci vecchie senza codice si tengono solo se il
      // viaggio stesso è di quel paese — e se nemmeno il viaggio dichiara un
      // paese non si butta nulla: non c'è NIENTE che dica che la regione sia
      // di un altro stato, e scartarla farebbe sparire dall'elenco le regioni
      // dei viaggi più vecchi (scritti prima del codice ISO) senza motivo.
      if (paese) {
        const prefisso = entry.code?.split("-")[0]?.toUpperCase();
        const paeseViaggio = (t.country_code ?? "").toUpperCase();
        const ammessa = prefisso ? prefisso === paese : (paeseViaggio ? paeseViaggio === paese : true);
        if (!ammessa) continue;
      }
      const key = entry.code ? `code:${entry.code.toUpperCase()}` : `name:${entry.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
}

export function CountryMapModal({ countryCode, countryName, trips, onClose }: Props) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  // Non basta "c'è stato un errore": serve il PERCHÉ, per non dare la colpa
  // al paese quando il problema è il limite di richieste o la rete.
  const [error, setError] = useState<MotivoErrore | null>(null);
  const [visitedRegions, setVisitedRegions] = useState<string[]>([]);
  const [totalRegions, setTotalRegions] = useState(0);
  // Il contatore dei tentativi: cambiarlo rilancia il caricamento. Serve per
  // "Riprova" — il messaggio invitava a riprovare senza darne il modo, e la
  // sola strada era chiudere e riaprire il pannello.
  const [tentativo, setTentativo] = useState(0);

  const visitedList = collectVisitedRegions(trips, countryCode);
  const punti = visitedPoints(trips);
  // Focus dentro il pannello all'apertura, ciclo chiuso sul Tab, ritorno al
  // trigger alla chiusura: era l'ultimo overlay dell'app senza gestione focus.
  const panelRef = useModalFocus<HTMLDivElement>();

  // Esc chiude il modale (prima solo click fuori / X).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let features = geoCache[countryCode];
        if (!features) {
          // Il pacchetto locale ha la PRECEDENZA sulla copia persistita: se
          // il paese è entrato nel pacchetto, la copia di rete in localStorage
          // è ridondante e va liberata — altrimenti chi l'aveva già scaricata
          // se la terrebbe per sempre nello spazio condiviso coi viaggi.
          // (Per i paesi fuori dal pacchetto è un lookup nel manifest già in
          // memoria: nessuna richiesta in più.)
          const locali = await fetchConfiniLocali(countryCode.toUpperCase());
          if (cancelled) return;
          if (locali) {
            features = locali;
            geoCache[countryCode] = features;
            removePersistedFeatures(countryCode);
          }
        }
        if (!features) {
          features = readPersistedFeatures(countryCode);
          if (features) geoCache[countryCode] = features;
        }
        if (!features) {
          features = await fetchCountryRegions(countryCode);
          if (cancelled) return; // modal chiuso o paese cambiato durante il fetch
          if (!features) throw new Error("Nessuna suddivisione disponibile");
          geoCache[countryCode] = features;
          // Qui arrivano SOLO i confini di rete (il pacchetto locale è stato
          // tentato sopra): questi sì che vale la pena persisterli.
          writePersistedFeatures(countryCode, features);
        }
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const { project } = projectGeoJSON(features, W, H);

        const visited: string[] = [];
        features.forEach(f => {
          const geoName: string = f.properties?.shapeName ?? "";
          const geoCode: string | null = f.properties?.shapeISO ?? null;
          // Visitata per NOME/codice (destinazione con region_details) oppure
          // perché una tappa cade dentro i suoi confini (Trieste & co.).
          const isVisited = visitedList.some(v => regionMatches(v, geoName, geoCode, countryCode))
            || punti.some(p => pointInPolygons(p.lon, p.lat, polygonsOf(f.geometry)));
          if (isVisited) visited.push(geoName);

          ctx.save();
          buildFeaturePath(ctx, f, project);
          ctx.fillStyle = isVisited ? "rgba(96,165,250,0.5)" : "rgba(255,255,255,0.12)";
          ctx.fill();
          ctx.strokeStyle = isVisited ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.25)";
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.restore();
        });

        setVisitedRegions(visited);
        setTotalRegions(features.length);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setLoading(false);
        setError(e instanceof ErroreConfini ? e.motivo : "assente");
      }
    };
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode, tentativo]);

  const riprova = () => {
    setError(null);
    setLoading(true);
    setTentativo(n => n + 1);
  };

  const pct = totalRegions > 0 ? Math.round((visitedRegions.length / totalRegions) * 100) : 0;

  // Portal sul body: il modale vive dentro la card di Statistiche, che ha
  // .animate-fade-up — e un antenato con `transform` diventa il riferimento
  // dei discendenti `position:fixed`. Così il pannello si ancorava alla card e
  // si sovrapponeva alla sezione sotto invece di coprire lo schermo.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Mappa di ${countryName}`} style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }} onClick={onClose}>
      <div ref={panelRef} tabIndex={-1} style={{
        background: "#0a1628", border: "0.5px solid #1a2d4a", borderRadius: 16,
        width: "100%", maxWidth: 580, maxHeight: "90vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        outline: "none",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #1a2d4a", display: "flex", alignItems: "center", gap: 10 }}>
          {countryCode && (
            <img src={"https://flagcdn.com/w40/" + countryCode.toLowerCase() + ".png"} alt="" loading="lazy"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(255,255,255,0.1)" }}/>
          )}
          <div className="font-display" style={{ fontSize: 16, fontWeight: 700, color: "#f0f4ff", flex: 1 }}>{countryName}</div>
          <button onClick={onClose} aria-label="Chiudi mappa del paese"
            style={{ width: 28, height: 28, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
            <X style={{ width: 16, height: 16 }}/>
          </button>
        </div>

        {/* Stats */}
        {!loading && !error && totalRegions > 0 && (
          <div style={{ textAlign: "center", paddingTop: 16 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: "#60a5fa" }}>{pct}%</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginLeft: 8 }}>del paese visitato</span>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
              {visitedRegions.length} region{visitedRegions.length === 1 ? "e" : "i"} su {totalRegions}
            </div>
          </div>
        )}

        {/* Map */}
        <div style={{ flex: 1, padding: 16, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          {loading && (
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{t("Caricamento mappa…")}</div>
          )}
          {error && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{error === "assente" ? "🗺️" : "⏳"}</div>
              <div>
                {error === "limite" ? (<>{t("Troppe richieste al servizio dei confini.")}<br/><span style={{ color: "rgba(255,255,255,0.5)" }}>{t("Aspetta qualche minuto.")}</span></>)
                  : error === "offline" ? (<>{t("Sei senza connessione.")}<br/><span style={{ color: "rgba(255,255,255,0.5)" }}>{t("I confini si scaricano quando torni online.")}</span></>)
                  : t("Mappa non disponibile per questo paese.")}
              </div>
              {/* "Riprova" solo dove riprovare ha senso: se il paese non ha
                  suddivisioni, insistere darebbe sempre lo stesso esito. */}
              {error !== "assente" && (
                <button onClick={riprova} style={{
                  marginTop: 12, padding: "6px 14px", borderRadius: 8,
                  border: "1px solid rgba(96,165,250,0.45)", background: "rgba(96,165,250,0.12)",
                  color: "rgba(191,219,254,0.95)", fontSize: 12, cursor: "pointer",
                }}>{t("Riprova")}</button>
              )}
              {visitedList.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11 }}>
                  Regioni visitate: {visitedList.map(v => v.name).join(", ")}
                </div>
              )}
            </div>
          )}
          {!error && (
            <canvas ref={canvasRef} width={540} height={380}
              style={{ width: "100%", maxWidth: 540, height: "auto", display: loading ? "none" : "block" }}/>
          )}
        </div>

      </div>
    </div>,
    document.body,
  );
}
