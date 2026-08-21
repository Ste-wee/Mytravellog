/**
 * Geometria dei paesi: "in quale paese cade questo punto?" e "quali paesi ho
 * visitato?". Fonte UNICA — la regola che sceglie il poligono più piccolo
 * (vedi paeseDelPunto) è nata da un bug vero e non va mai duplicata: una
 * seconda copia significherebbe una seconda occasione di sbagliare.
 *
 * Viveva dentro ContinentsMap, che la usa per la mappa del mondo; ora la usa
 * anche il globo della Home per evidenziare i paesi visitati.
 */
import type { Trip } from "@/lib/storage";
import { loadWorldAtlasCountries, polygonsOf } from "@/lib/worldAtlas";
import { ISO_NUMERICO_A2 } from "@/lib/isoPaesi";

/**
 * Le quattro nazioni del Regno Unito contano come paesi a sé.
 *
 * Non è un errore geografico: la Scozia non è uno stato sovrano, e per l'ONU
 * il paese è il Regno Unito. Ma un diario di viaggio racconta dove sei stato,
 * e Scozia, Inghilterra, Galles e Irlanda del Nord hanno identità, bandiera e
 * confini propri — le app di viaggio le contano separate, e Stefano se lo
 * aspettava ("la Scozia dovrebbe essere a parte").
 *
 * Il riconoscimento passa dal codice ISO 3166-2 che salviamo già in
 * `region_details` (Nominatim dà GB-SCT, GB-WLS...), col nome come rete di
 * sicurezza per i viaggi vecchi che hanno solo quello. I codici valgono anche
 * come bandiera: flagcdn serve gb-sct, gb-eng, gb-wls, gb-nir.
 */
export const NAZIONI_UK: Record<string, string> = {
  "GB-SCT": "Scozia",
  "GB-ENG": "Inghilterra",
  "GB-WLS": "Galles",
  "GB-NIR": "Irlanda del Nord",
};
const NOME_A_CODICE_UK: Record<string, string> = {
  scozia: "GB-SCT", scotland: "GB-SCT",
  inghilterra: "GB-ENG", england: "GB-ENG",
  galles: "GB-WLS", wales: "GB-WLS",
  "irlanda del nord": "GB-NIR", "northern ireland": "GB-NIR",
};

/**
 * Il paese da MOSTRARE per un luogo: di norma quello che arriva dal geocoder,
 * ma dentro il Regno Unito la nazione (Scozia, Galles...). Fonte unica, così
 * conteggio della Home, elenco delle Statistiche e globo dicono lo stesso
 * numero: prima bastava che uno dei tre contasse diversamente per far
 * litigare "16 paesi" con un elenco di 15 chip.
 */
export function paeseVisibile(
  nome: string | null | undefined,
  codice: string | null | undefined,
  regione?: string | null,
  codiceRegione?: string | null,
): { nome: string; codice: string | null } {
  const base = { nome: (nome ?? "").trim(), codice: codice ?? null };
  if ((codice ?? "").toUpperCase() !== "GB") return base;
  const daCodice = (codiceRegione ?? "").toUpperCase();
  const iso = NAZIONI_UK[daCodice]
    ? daCodice
    : NOME_A_CODICE_UK[(regione ?? "").trim().toLowerCase()] ?? null;
  if (!iso) return base;                    // GB senza regione nota: resta Regno Unito
  return { nome: NAZIONI_UK[iso], codice: iso };
}

/** Il paese visibile di un viaggio, leggendo la regione dove l'abbiamo salvata. */
export function paeseVisibileDiViaggio(t: {
  country?: string | null; country_code?: string | null;
  region?: string | null; region_details?: { name: string; code: string | null }[] | null;
}) {
  const primaRegione = t.region_details?.[0];
  return paeseVisibile(t.country, t.country_code, primaRegione?.name ?? t.region, primaRegione?.code);
}

/**
 * Il paese visibile di una TAPPA. Le tappe non hanno una regione salvata: da
 * sole, dentro il Regno Unito, resterebbero "Regno Unito" — e il viaggio in
 * Scozia di Stefano (Pitlochry, con tappe Edimburgo e Fort Augustus) avrebbe
 * contato DUE paesi, Scozia più Regno Unito, gonfiando il totale.
 * Una tappa britannica di un viaggio scozzese sta in Scozia: eredita.
 */
export function paeseVisibileDiTappa(
  w: { country?: string | null; country_code?: string | null },
  paeseDelViaggio: { nome: string; codice: string | null },
) {
  const eredita = (w.country_code ?? "").toUpperCase() === "GB"
    && !!paeseDelViaggio.codice && !!NAZIONI_UK[paeseDelViaggio.codice];
  return eredita ? paeseDelViaggio : { nome: (w.country ?? "").trim(), codice: w.country_code ?? null };
}

/**
 * NB storico: qui viveva una lista di micro-stati "con geometria inaffidabile"
 * (Vaticano e Monaco), da trattare a parte. Non serve più: da quando il paese
 * lo decide il codice del viaggio e il confine si cerca per codice, quei due
 * non sono più casi speciali — sono paesi come gli altri, e il fatto che il
 * loro poligono sia impreciso non toglie nulla al conteggio né alla bandiera.
 * Una pezza in meno è meglio di una pezza migliore.
 */

/** Il minimo che serve per rispondere "il punto è dentro?": niente disegno. */
export type PaeseGeom = {
  id: string;
  name: string;
  /** lista di poligoni; ogni poligono = lista di anelli di [lon,lat] */
  polygons: number[][][][];
  /** [minLon, minLat, maxLon, maxLat] — prefiltro prima del ray casting */
  bbox: [number, number, number, number];
};

/**
 * Bounding box di un paese. Prefiltro economico prima del costoso ray casting
 * su ogni vertice di ogni anello: se il punto è fuori dal box è sicuramente
 * fuori dal paese. Conservativo: per i paesi che attraversano ±180° (Russia,
 * Fiji) il box risulta molto ampio → nessuno speedup ma nemmeno falsi negativi.
 */
export function bboxDiPoligoni(polygons: number[][][][]): [number, number, number, number] {
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

/** Identificatore stabile di un paese del world-atlas (id numerico ISO, o il nome). */
export function deriveCountryId(f: { id?: unknown; properties?: { name?: string } }, index: number): string {
  if (f.id != null) return String(f.id);
  if (f.properties?.name) return f.properties.name;
  return `unknown-${index}`;
}

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
 * sempre il più specifico.
 *
 * Generica sul tipo: la mappa del mondo passa le sue feature disegnabili (con
 * path SVG e centroide), il globo le sue, e nessuna delle due deve adattarsi
 * all'altra.
 */
export function paeseDelPunto<T extends PaeseGeom>(lon: number, lat: number, countries: T[]): T | null {
  let vincitore: T | null = null;
  let areaMin = Infinity;
  for (const c of countries) {
    if (lon < c.bbox[0] || lon > c.bbox[2] || lat < c.bbox[1] || lat > c.bbox[3]) continue;
    const area = areaPoligonoCheContiene(lon, lat, c.polygons);
    if (area < areaMin) { areaMin = area; vincitore = c; }
  }
  return vincitore;
}

/** I paesi del mondo pronti per le domande geometriche, con la loro geometria
 *  originale (serve a disegnarli sul globo). Cache condivisa: il world-atlas
 *  si scarica una volta sola per sessione (ci pensa loadWorldAtlasCountries). */
export type PaeseMondo = PaeseGeom & { geometry: GeoJSON.Geometry };

let cachePaesi: Promise<PaeseMondo[]> | null = null;

/** Test-only: azzera la cache dei paesi fra un test e l'altro. */
export function __clearPaesiCache() { cachePaesi = null; }

/**
 * Le quattro nazioni del Regno Unito come poligoni separati, dal pacchetto di
 * confini che ospitiamo noi (`public/confini/GB.json`, 30 KB: c'è già, serviva
 * alle regioni). Se non arriva — offline, pacchetto assente — si torna al
 * Regno Unito intero: meglio un confine grossolano che nessuna mappa.
 */
async function caricaNazioniUK(): Promise<PaeseMondo[]> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}confini/GB.json`);
    if (!r.ok) return [];
    const j = await r.json();
    const feats: { properties?: { shapeISO?: string }; geometry: GeoJSON.Geometry }[] = j?.features ?? [];
    return feats.flatMap(f => {
      const iso = (f.properties?.shapeISO ?? "").toUpperCase();
      const nome = NAZIONI_UK[iso];
      if (!nome) return [];
      const polygons = polygonsOf(f.geometry);
      if (!polygons.length) return [];
      return [{ id: iso, name: nome, polygons, bbox: bboxDiPoligoni(polygons), geometry: f.geometry }];
    });
  } catch {
    return [];
  }
}

export function caricaPaesi(): Promise<PaeseMondo[]> {
  if (!cachePaesi) {
    // 50m e non 110m: la risoluzione bassa conosce 177 paesi e **si perde
    // tutti i micro-stati** — Vaticano, San Marino, Monaco, Liechtenstein,
    // Andorra, Malta, Singapore. Un viaggio a Città del Vaticano finiva
    // attribuito all'Italia, e il globo coloriva un paese in meno di quanti
    // ne conta la Home (7 contro 6: segnalato da Stefano, "è un bug!").
    // Il 50m ne conosce 241 e li ha tutti. Costa 739 KB invece di 105, ma si
    // scarica una volta sola e il service worker lo tiene offline.
    cachePaesi = Promise.all([loadWorldAtlasCountries("50m"), caricaNazioniUK()]).then(([geo, nazioniUK]) => {
      const mondo = geo.features.map((f, i) => {
        const polygons = polygonsOf(f.geometry);
        return {
          id: deriveCountryId(f, i),
          name: (f.properties?.name as string) ?? "",
          polygons,
          bbox: bboxDiPoligoni(polygons),
          geometry: f.geometry,
        };
      });
      if (!nazioniUK.length) return mondo;
      // Il Regno Unito esce dall'elenco e al suo posto entrano le quattro
      // nazioni: così il match geometrico restituisce direttamente "Scozia" e
      // il globo colora la Scozia, non tutta l'isola.
      // id 826 = codice ISO numerico del Regno Unito: regge anche se un domani
      // il world-atlas cambia il nome (il nome resta come rete di sicurezza).
      return [...mondo.filter(p => p.id !== "826" && p.name !== "United Kingdom"), ...nazioniUK];
    });
    // niente cache avvelenata: un errore di rete non deve condannare la sessione
    cachePaesi.catch(() => { cachePaesi = null; });
  }
  return cachePaesi;
}

/**
 * I paesi toccati dai viaggi, con il codice bandiera di ciascuno.
 *
 * Il match è GEOMETRICO e non per `country_code`: i confini del world-atlas non
 * condividono un identificatore con i nostri viaggi. Il codice per la bandiera
 * arriva invece dal PUNTO che è caduto dentro quel paese — così un viaggio in
 * Austria non si porta dietro la bandiera della destinazione italiana.
 *
 * Conta anche le TAPPE, non solo le destinazioni: il dato per-viaggio descrive
 * l'arrivo, e chi attraversa l'Austria per andare a Vienna l'Austria l'ha vista.
 */
export type PaeseVisitato = {
  /** Il confine da colorare, se il dataset ne ha uno per questo paese. */
  paese: PaeseMondo | null;
  code: string | null;
  nome: string;
  /** Dove va la bandiera: il centro del paese, o il punto del viaggio per chi
   *  un confine non ce l'ha. */
  posizione: [number, number] | null;
};

/**
 * I paesi visitati, decisi dal CODICE che il geocoder ha salvato nel viaggio.
 *
 * Questa funzione è stata riscritta da zero il 2026-08-21, e il motivo merita
 * di essere ricordato. Prima il paese si DEDUCEVA dalla geometria: si guardava
 * dove cadeva il punto e si prendeva il poligono che lo conteneva. Sembra
 * naturale, ed è stata la fonte di ogni guaio avuto con questa mappa:
 *
 *  - la Russia risultava visitata per un viaggio in Lapponia, perché il suo
 *    poligono scavalca l'antimeridiano e il ray casting sbagliava;
 *  - il Vaticano finiva attribuito all'Italia: il suo confine, nel dataset, è
 *    disegnato due chilometri più a ovest di dov'è davvero;
 *  - Monaco spariva del tutto: il suo poligono è impreciso e la Francia ha il
 *    buco al posto giusto, quindi il punto non cadeva da nessuna parte;
 *  - e ogni rimedio era una pezza sopra la precedente (il poligono più
 *    piccolo, la maggioranza dei punti, una lista di eccezioni scritta a mano).
 *
 * Il paese però lo sappiamo già: lo dice il geocoder quando salvi il viaggio,
 * ed è nel dato (country_code). La geometria non serve a sapere DOVE sei
 * stato, serve solo a disegnarne il confine — e quindi si cerca per codice,
 * con la tabella ISO. Se un confine manca o è sbagliato, il paese resta
 * comunque nell'elenco: prende la bandiera, piantata sul punto del viaggio.
 * Niente più liste di eccezioni, e i casi qui sopra diventano impossibili per
 * costruzione.
 *
 * Il vecchio metodo sopravvive come RETE DI SICUREZZA per i viaggi salvati
 * senza codice paese (dati vecchi): lì la geometria è tutto ciò che abbiamo.
 */
export function paesiVisitati(trips: Trip[], paesi: PaeseMondo[]) {
  const visitati = new Map<string, PaeseVisitato>();
  if (!paesi.length) return visitati;

  // Indice dei confini per codice a due lettere: le nazioni UK hanno già l'id
  // giusto (GB-SCT), gli altri passano dalla tabella ISO numerico → alpha2.
  const perCodice = new Map<string, PaeseMondo>();
  for (const p of paesi) {
    const code = NAZIONI_UK[p.id] ? p.id : ISO_NUMERICO_A2[p.id];
    if (code && !perCodice.has(code)) perCodice.set(code, p);
  }

  const aggiungi = (code: string | null | undefined, nome: string, lon: number, lat: number) => {
    const c = (code ?? "").toUpperCase();
    if (!c) return;
    const gia = visitati.get(c);
    if (gia) {
      if (!gia.nome && nome) gia.nome = nome;   // il primo nome utile resta
      return;
    }
    const confine = perCodice.get(c) ?? null;
    visitati.set(c, {
      paese: confine,
      code: c,
      nome: nome || confine?.name || c,
      // il centro del paese se il confine c'è, altrimenti il punto del viaggio
      posizione: (confine && centroPaese(confine)) || [lon, lat],
    });
  };

  /** Rete di sicurezza per i punti senza codice: si torna a chiedere al
   *  poligono, come si faceva prima. */
  const daGeometria = (lon: number, lat: number, nome: string) => {
    const c = paeseDelPunto(lon, lat, paesi);
    if (!c) return;
    aggiungi(NAZIONI_UK[c.id] ? c.id : ISO_NUMERICO_A2[c.id], nome || c.name, lon, lat);
  };

  for (const t of trips) {
    const p = paeseVisibileDiViaggio(t);
    if (p.codice) aggiungi(p.codice, p.nome, t.longitude, t.latitude);
    else daGeometria(t.longitude, t.latitude, p.nome);

    for (const w of t.waypoints ?? []) {
      if (w.lat == null || w.lon == null) continue;
      const pw = paeseVisibileDiTappa(w, p);
      if (pw.codice) aggiungi(pw.codice, pw.nome, w.lon, w.lat);
      else daGeometria(w.lon, w.lat, pw.nome);
    }
  }
  return visitati;
}

/** Centro visivo di un paese: baricentro dell'anello esterno del poligono PIÙ
 *  GRANDE. Non la media di tutti i poligoni, che per la Francia (con la Guyana
 *  e le isole) cadrebbe in mezzo all'Atlantico. */
export function centroPaese(p: PaeseGeom): [number, number] | null {
  let esterno: number[][] | null = null;
  let max = -1;
  for (const poly of p.polygons) {
    if (!poly.length) continue;
    if (poly[0].length > max) { max = poly[0].length; esterno = poly[0]; }
  }
  if (!esterno || !esterno.length) return null;
  // La longitudine si media come ANGOLO, non come numero: le Figi vanno da
  // -180 a +180 e la media aritmetica dava 15,9° — la loro bandiera finiva in
  // Angola. Sommando i versori e riprendendo l'angolo con atan2, il giro
  // dell'antimeridiano si chiude come deve. (Stesso nemico del caso Russia in
  // paeseDelPunto: con i dati geografici il segno del meridiano 180 morde.)
  let sx = 0, sy = 0, lat = 0;
  for (const [x, y] of esterno) {
    const r = (x * Math.PI) / 180;
    sx += Math.cos(r); sy += Math.sin(r); lat += y;
  }
  const lon = (Math.atan2(sy, sx) * 180) / Math.PI;
  return [lon, lat / esterno.length];
}
