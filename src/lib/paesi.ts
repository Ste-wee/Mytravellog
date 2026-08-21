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
  /** Il poligono da colorare, se il dataset ne ha uno affidabile. */
  paese: PaeseMondo | null;
  code: string | null;
  nome: string;
  /** Dove mettere la bandiera: il centro del paese, o il punto del viaggio
   *  per chi un poligono non ce l'ha. */
  posizione: [number, number] | null;
};

export function paesiVisitati(trips: Trip[], paesi: PaeseMondo[]) {
  const visitati = new Map<string, PaeseVisitato>();
  /** I punti caduti DENTRO un paese: solo loro possono chiedere una bandiera
   *  senza poligono. Un punto in mezzo all'oceano (dato sporco) non inventa
   *  nulla, com'era prima. */
  const atterrati: { code: string | null; nome: string; lon: number; lat: number; idPaese: string }[] = [];
  /** Per ogni poligono, quante volte ci è caduto ciascun codice paese. */
  const conteggioCodici = new Map<string, Map<string, number>>();
  if (!paesi.length) return visitati;
  for (const t of trips) {
    const punti = [
      { lat: t.latitude, lon: t.longitude, code: t.country_code, nome: t.country },
      ...(t.waypoints ?? [])
        .filter(w => w.lat != null && w.lon != null)
        .map(w => ({ lat: w.lat as number, lon: w.lon as number, code: w.country_code, nome: w.country })),
    ];
    for (const p of punti) {
      const c = paeseDelPunto(p.lon, p.lat, paesi);
      if (!c) continue;
      // Punto su terraferma: se il viaggio dichiara un paese diverso da quello
      // del poligono, se ne riparla sotto (micro-stati).
      atterrati.push({ code: p.code ?? null, nome: p.nome ?? "", lon: p.lon, lat: p.lat, idPaese: c.id });
      // Quante volte ogni codice è caduto in questo poligono: serve subito
      // sotto per battezzarlo con la MAGGIORANZA e non col primo arrivato —
      // in Italia cadono tre viaggi italiani e uno in Vaticano, e non deve
      // decidere l'ordine di lettura chi dà il nome (e la bandiera) al paese.
      if (p.code) {
        const per = conteggioCodici.get(c.id) ?? new Map<string, number>();
        per.set(p.code.toUpperCase(), (per.get(p.code.toUpperCase()) ?? 0) + 1);
        conteggioCodici.set(c.id, per);
      }
      const gia = visitati.get(c.id);
      // Dentro il Regno Unito la bandiera è quella della nazione (gb-sct...),
      // non l'union jack: il poligono è quello della Scozia, e una bandiera
      // britannica sopra la Scozia sarebbe una contraddizione visibile.
      const code = NAZIONI_UK[c.id] ? c.id : p.code ?? null;
      // Il nome da MOSTRARE: per le nazioni UK il nostro ("Scozia"); per gli
      // altri quello del viaggio, che il geocoder salva in ITALIANO ("Svezia")
      // — il world-atlas conosce solo l'inglese ("Sweden"). Il punto caduto
      // dentro il paese porta il suo: un viaggio in Austria non deve
      // battezzare l'Austria col nome della destinazione italiana.
      const nome = NAZIONI_UK[c.id] ?? ((p.nome ?? "").trim() || c.name);
      // il primo valore utile vince: i successivi non devono sovrascriverlo
      if (!gia) visitati.set(c.id, { paese: c, code, nome, posizione: centroPaese(c) });
      else {
        if (!gia.code && code) gia.code = code;
        if (gia.nome === c.name && nome !== c.name) gia.nome = nome;
      }
    }
  }

  // Il codice (e quindi la bandiera) di ogni paese colorato è quello caduto
  // più volte dentro il suo poligono: con tre viaggi in Italia e uno in
  // Vaticano l'Italia resta italiana, e il Vaticano prende la sua bandiera
  // qui sotto. Limite noto e accettato: chi visita SOLO il Vaticano e mai
  // l'Italia vedrà comunque l'Italia colorata — per evitarlo servirebbe la
  // tabella ISO numerico→alpha2, che oggi non abbiamo.
  for (const [id, per] of conteggioCodici) {
    const voce = visitati.get(id);
    if (!voce || NAZIONI_UK[id]) continue;      // le nazioni UK hanno già il loro
    let vincitore = voce.code, max = -1;
    for (const [code, n] of per) if (n > max) { max = n; vincitore = code; }
    if (vincitore && vincitore !== voce.code) {
      voce.code = vincitore;
      // il nome deve seguire la bandiera: preso da un punto con QUEL codice
      const conNome = atterrati.find(a => (a.code ?? "").toUpperCase() === vincitore && a.nome);
      if (conNome) voce.nome = conNome.nome;
    }
  }

  // ── I paesi che la geometria non sa disegnare ─────────────────────────────
  // Non è un caso di scuola: **il poligono del Vaticano nel world-atlas è nel
  // posto sbagliato** (sta a 12,43° di longitudine, il Vaticano vero a 12,45°:
  // nemmeno il suo centro ufficiale ci cade dentro), e lo stesso vale per gli
  // altri micro-stati, ridotti a sei vertici. Un viaggio a Città del Vaticano
  // finiva quindi attribuito all'Italia: la Home contava 7 paesi e il globo ne
  // colorava 6. Stefano: "è un bug! deve disegnarli tutti, è giusto che il
  // Vaticano sia presente anche come bandiera".
  //
  // Rimedio: se un viaggio dichiara un paese che nessun poligono rappresenta,
  // la sua BANDIERA compare lo stesso, piantata sul punto del viaggio. Il
  // poligono resta assente — meglio nessun confine che un confine sbagliato.
  const codiciCoperti = new Set(
    [...visitati.values()].map(v => (v.code ?? "").toUpperCase()).filter(Boolean));
  for (const q of atterrati) {
    const code = (q.code ?? "").toUpperCase();
    if (!code || codiciCoperti.has(code)) continue;
    // Il punto è già rappresentato dal paese in cui è caduto: niente bandiera
    // in più. Vale soprattutto dentro il Regno Unito, dove il viaggio dichiara
    // "GB" ma il poligono è quello della Scozia (GB-SCT) — senza questa
    // guardia comparivano DUE bandiere, l'union jack accanto a quella
    // scozzese, per lo stesso viaggio.
    if (NAZIONI_UK[q.idPaese] && code === "GB") continue;
    codiciCoperti.add(code);
    visitati.set("solo-bandiera-" + code, {
      paese: null, code, nome: q.nome || code, posizione: [q.lon, q.lat],
    });
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
