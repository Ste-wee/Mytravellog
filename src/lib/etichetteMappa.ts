/**
 * I NOMI della Mappa della vita: dove scriverli perché si leggano tutti.
 *
 * Scelta di Stefano (2026-10-15, fra due mockup sulla mappa vera): i nomi
 * OVUNQUE, e per i punti troppo fitti dei riquadri di ingrandimento, quanti ne
 * servono. Prima la mappa della vita non aveva nomi («si accavallano»): qui si
 * decide per ognuno, in pixel, una di tre sorti —
 *
 *  1. ACCANTO alla sua stella, sopra/sotto/destra/sinistra, se c'è spazio;
 *  2. in un RIQUADRO, se fa parte di un grappolo di stelle che quasi si
 *     toccano: il riquadro ingrandisce la zona finché i nomi ci stanno, e va
 *     nel posto vuoto più vicino (prima sopra), legato alla zona da un filo;
 *  3. COL FILO, se è una stella isolata il cui nome non entra: il nome va nel
 *     posto libero più vicino e un filo sottile lo lega alla stella.
 *
 * Funzione PURA (pixel in, pixel out): la usano lo schermo, l'immagine da
 * condividere e il master SVG di stampa, così le tre uscite si somigliano. Le
 * misure dei testi le dà chi chiama (`misura`): il canvas a schermo, una stima
 * nel master.
 */

export interface Box { x: number; y: number; w: number; h: number }
export interface Punto { id: string; nome: string; x: number; y: number }
export type Ancora = "top" | "bottom" | "right" | "left";

export interface Etichetta {
  id: string;
  nome: string;
  box: Box;
  /** Dove scrivere il testo: x del centro (o del bordo), y della linea di base. */
  testo: { x: number; y: number; allinea: "middle" | "start" | "end" };
}
export interface EtichettaConFilo extends Etichetta {
  /** Dalla stella al bordo dell'etichetta. */
  filo: { x1: number; y1: number; x2: number; y2: number };
}
export interface Riquadro {
  numero: number;
  ids: string[];
  /** Chi è il gruppo (le sue tappe, in ordine): la chiave per regolarlo a mano. */
  chiave: string;
  /** La zona sulla mappa (il tratteggio). */
  zona: Box;
  /** Dove sta il riquadro. */
  posto: Box;
  /** Quante volte ingrandisce: un punto p della mappa finisce in
   *  centroPosto + (p − centroZona) · scala. */
  scala: number;
  centroZona: { x: number; y: number };
  centroPosto: { x: number; y: number };
  /** Il filo dal tratteggio al riquadro. */
  filo: { x1: number; y1: number; x2: number; y2: number };
  /** Il bollino col numero accanto al tratteggio (un quadrato: ci sta il
   *  cerchio), in un angolo libero che i nomi della mappa grande non coprono
   *  (prima si leggeva «Innsbruck¹»). */
  numeroZona: Box;
  /** Le stelle e i nomi DENTRO il riquadro, già in pixel del foglio. */
  stelle: { id: string; x: number; y: number }[];
  /** Le stelle di ALTRE tappe che cadono nel riquadro ingrandito: si
   *  disegnano piccole e spente (il loro nome è sulla mappa grande). */
  altre: { x: number; y: number }[];
  nomi: Etichetta[];
  /** Nomi che nel riquadro non stavano accanto: restano DENTRO, col filo. */
  conFilo: EtichettaConFilo[];
}
export interface RiquadroFisso { posto: Box; centro: { x: number; y: number } }

/** La chiave di un gruppo di tappe: le loro id, ordinate. */
export const chiaveGruppo = (ids: string[]) => [...ids].sort().join(",");

export interface Disposizione {
  accanto: Etichetta[];
  conFilo: EtichettaConFilo[];
  riquadri: Riquadro[];
  /** Nomi che non hanno trovato posto da nessuna parte (si spera nessuno). */
  senzaPosto: string[];
}

export interface Opzioni {
  /** Il foglio, in px. */
  w: number;
  h: number;
  /** Larghezza in px del nome scritto. */
  misura: (nome: string) => number;
  /** Altezza della riga di testo. */
  altezza: number;
  /** Ingombro di una stella (raggio). */
  raggioStella: number;
  /** Distanza fra stella e nome. */
  scostamento: number;
  /** Stelle più vicine di così formano un grappolo (se sono almeno 3). */
  distanzaGrappolo: number;
  /** Margine dal bordo del foglio. */
  margine: number;
  /** I tracciati in px: i riquadri non ci vanno sopra (i nomi sì, come sulle carte). */
  linee?: { x: number; y: number }[][];
  /** Zone vietate (es. i bottoni): niente nomi né riquadri. */
  vietate?: Box[];
  /** Quanto può essere lungo un filo sulla mappa grande (default 90 px):
   *  oltre, un nome «col filo» non si capisce più di chi sia. Si supera solo
   *  quando entro filoMax non c'è posto: allora meglio un filo lungo che
   *  un nome che manca. */
  filoMax?: number;
  /** Riquadri più grandi (default 1): alza il tetto e il margine intorno al
   *  gruppo, così dentro si vede più strada prima che esca dal bordo. La usa
   *  la stampa, dove lo spazio c'è (scelta di Stefano, 2026-10-19). */
  grandezzaRiquadri?: number;
  /** Riquadri regolati A MANO (anteprima di stampa, scelta B di Stefano,
   *  2026-10-19), per chiave del gruppo: dove sta (`posto`) e dove cade il
   *  centro della sua zona (`centro`: allargandolo da un lato si scopre più
   *  mappa da quel lato, il contenuto non scivola). Tutto il resto gli gira
   *  intorno. */
  riquadriFissi?: Record<string, RiquadroFisso>;
}

const sovrapposti = (a: Box, b: Box, m = 0) =>
  a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
const dentro = (r: Box, w: number, h: number, m: number) =>
  r.x >= m && r.y >= m && r.x + r.w <= w - m && r.y + r.h <= h - m;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
/** Il punto di `r` più vicino a `p`. */
const piuVicino = (r: Box, p: { x: number; y: number }) => ({
  x: Math.max(r.x, Math.min(p.x, r.x + r.w)), y: Math.max(r.y, Math.min(p.y, r.y + r.h)),
});

/** Le quattro posizioni classiche di un nome attorno alla sua stella. */
function candidati(p: { x: number; y: number }, tw: number, o: Pick<Opzioni, "altezza" | "scostamento">) {
  const th = o.altezza, s = o.scostamento;
  const base = (box: Box) => box.y + th * 0.78;
  const lista: { ancora: Ancora; box: Box }[] = [
    { ancora: "top", box: { x: p.x - tw / 2, y: p.y - s - th, w: tw, h: th } },
    { ancora: "bottom", box: { x: p.x - tw / 2, y: p.y + s, w: tw, h: th } },
    { ancora: "right", box: { x: p.x + s, y: p.y - th / 2, w: tw, h: th } },
    { ancora: "left", box: { x: p.x - s - tw, y: p.y - th / 2, w: tw, h: th } },
  ];
  return lista.map(c => ({
    ...c,
    testo: c.ancora === "right" ? { x: c.box.x, y: base(c.box), allinea: "start" as const }
      : c.ancora === "left" ? { x: c.box.x + c.box.w, y: base(c.box), allinea: "end" as const }
      : { x: p.x, y: base(c.box), allinea: "middle" as const },
  }));
}

/** Scrive accanto alla stella i nomi che ci stanno, in un foglio w×h. */
function accanto(punti: Punto[], tutteLeStelle: { x: number; y: number }[], o: Opzioni,
  w: number, h: number, occupati: Box[]): { fatti: Etichetta[]; falliti: Punto[] } {
  const fatti: Etichetta[] = [];
  const falliti: Punto[] = [];
  const stelle = tutteLeStelle.map(s => ({ x: s.x - o.raggioStella, y: s.y - o.raggioStella, w: 2 * o.raggioStella, h: 2 * o.raggioStella }));
  // prima i più affollati: hanno meno scelte
  const vicini = (p: Punto) => tutteLeStelle.filter(s => dist(s, p) < 60).length;
  const ordine = [...punti].sort((a, b) => vicini(b) - vicini(a));
  for (const p of ordine) {
    const tw = o.misura(p.nome);
    const scelta = candidati(p, tw, o).find(c =>
      dentro(c.box, w, h, o.margine)
      && !stelle.some(s => sovrapposti(c.box, s))
      && !fatti.some(e => sovrapposti(c.box, e.box, 2))
      && !occupati.some(b => sovrapposti(c.box, b, 2)));
    if (scelta) fatti.push({ id: p.id, nome: p.nome, box: scelta.box, testo: scelta.testo });
    else falliti.push(p);
  }
  return { fatti, falliti };
}

/**
 * Grappoli COMPATTI: un centro (la stella con più vicine) e le stelle entro
 * 1,6·r da lui — mai a catena. ⚠️ A catena, sul telefono, le tappe di un lungo
 * viaggio in auto (a ~12 px l'una dall'altra) si agganciavano fino a fare un
 * «grappolo» di mezza Italia, che il riquadro quasi non ingrandiva (visto).
 */
function grappoli(punti: Punto[], r: number): Punto[][] {
  const liberi = new Set(punti);
  const quanti = (p: Punto) => punti.filter(q => q !== p && dist(p, q) < r).length;
  const ordine = [...punti].sort((a, b) => quanti(b) - quanti(a));
  const out: Punto[][] = [];
  for (const p of ordine) {
    if (!liberi.has(p)) continue;
    const g = [p, ...punti.filter(q => q !== p && liberi.has(q) && dist(p, q) < r * 1.6)];
    g.forEach(q => liberi.delete(q));
    out.push(g);
  }
  return out;
}

/** Il posto libero più vicino a una stella per scriverne il nome, col filo. */
function postoColFilo(p: { x: number; y: number }, tw: number, th: number, scostamento: number,
  dMax: number, libero: (r: Box) => boolean): Box | null {
  for (let d = scostamento + th; d <= dMax; d += 4) {
    for (let a = -90; a < 270; a += 12) {
      const t = (a * Math.PI) / 180;
      const r = { x: p.x + Math.cos(t) * d - tw / 2, y: p.y + Math.sin(t) * d - th / 2, w: tw, h: th };
      if (libero(r)) return r;
    }
  }
  return null;
}
const conIlFilo = (id: string, nome: string, p: { x: number; y: number }, box: Box, th: number): EtichettaConFilo => {
  const fine = piuVicino(box, p);
  return {
    id, nome, box,
    testo: { x: box.x + box.w / 2, y: box.y + th * 0.78, allinea: "middle" },
    filo: { x1: p.x, y1: p.y, x2: fine.x, y2: fine.y },
  };
};

/** Il primo posto libero a cerchi crescenti attorno a `c`, partendo da nord. */
function cercaPosto(c: { x: number; y: number }, w: number, h: number, dMin: number, dMax: number,
  libero: (r: Box) => boolean): Box | null {
  for (let d = dMin; d <= dMax; d += 6) {
    for (let a = -90; a < 270; a += 8) {
      const t = (a * Math.PI) / 180;
      const r = { x: c.x + Math.cos(t) * d - w / 2, y: c.y + Math.sin(t) * d - h / 2, w, h };
      if (libero(r)) return r;
    }
  }
  return null;
}

export function disponiEtichette(punti: Punto[], o: Opzioni): Disposizione {
  const vietate = o.vietate ?? [];
  const stelle = punti.map(p => ({ x: p.x, y: p.y }));
  const campioniLinee = (o.linee ?? []).flatMap(l => {
    const out: { x: number; y: number }[] = [];
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], b = l[i];
      const n = Math.max(1, Math.ceil(dist(a, b) / 4));
      for (let k = 0; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
    return out;
  });

  // 1. un grappolo (almeno 3 stelle vicine) va in un riquadro quando le stelle
  //    si sovrappongono davvero — lì, anche se i nomi ci stessero, non si
  //    capisce quale nome sia di quale stella e gli aloni fanno una macchia
  //    (trovato da un test) — oppure quando qualche nome non entra. Se invece
  //    stanno tutti accanto e le stelle si distinguono, niente riquadro: su
  //    desktop Genova–La Spezia–Pisa finivano ingranditi senza bisogno (visto).
  const prova = accanto(punti, stelle, o, o.w, o.h, vietate);
  const nonEntrano = new Set(prova.falliti.map(p => p.id));
  const vicinissime = (g: Punto[]) => {
    for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) if (dist(g[a], g[b]) < o.distanzaGrappolo * 0.7) return true;
    return false;
  };
  // quanto DOVREBBE ingrandire un gruppo (abbastanza che le due stelle più
  // vicine abbiano spazio per due nomi) e quanto PUÒ (il tetto in pixel: in
  // proporzione allo schermo, su desktop un riquadro arrivava a mezzo poster
  // quasi vuoto — visto: Napoli–Cosenza)
  const serve = (o.altezza + o.scostamento) * 2 + 4;
  const gR = o.grandezzaRiquadri ?? 1;
  const wMax = Math.min(o.w * 0.55 * gR, 300 * gR), hMax = Math.min(o.h * 0.42 * gR, 220 * gR);
  const misureGruppo = (g: Punto[]) => {
    const xs = g.map(p => p.x), ys = g.map(p => p.y);
    const zw = Math.max(...xs) - Math.min(...xs), zh = Math.max(...ys) - Math.min(...ys);
    let minimo = Infinity;
    for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) minimo = Math.min(minimo, Math.max(1, dist(g[a], g[b])));
    const voluta = Math.min(8, Math.max(2, serve / minimo));
    const aria = { x: (Math.max(...g.map(p => o.misura(p.nome))) + 24) * gR, y: ((o.altezza + o.scostamento) * 2 + 18) * gR };
    const possibile = Math.min(Math.max(1.5, (wMax - aria.x) / Math.max(1, zw)), Math.max(1.5, (hMax - aria.y) / Math.max(1, zh)));
    return { voluta, possibile, aria, zw, zh };
  };
  // un gruppo che nemmeno al massimo ingrandimento stacca le sue stelle si
  // divide nei suoi grappoli più stretti, ognuno col suo riquadro; chi resta
  // fuori fa gruppo a sé (scelta C, «Due riquadri», 2026-10-15: sul telefono
  // l'Umbria restava appiccicata dentro un riquadro da Pisa a Roma)
  const dividi = (g: Punto[], r: number): Punto[][] => {
    if (g.length <= 3 || r < 4) return [g];
    const m = misureGruppo(g);
    if (m.possibile >= m.voluta * 0.85) return [g];
    const sotto = grappoli(g, r / 2);
    const stretti = sotto.filter(s => s.length >= 3);
    if (!stretti.length) return [g];
    const sciolti = sotto.filter(s => s.length < 3).flat();
    return [...stretti.flatMap(s => dividi(s, r / 2)), ...(sciolti.length >= 3 ? [sciolti] : [])];
  };
  const daIngrandire = grappoli(punti, o.distanzaGrappolo)
    .flatMap(g => dividi(g, o.distanzaGrappolo))
    .filter(g => g.length >= 3 && (vicinissime(g) || g.some(p => nonEntrano.has(p.id))));
  // una stella libera che cade DENTRO la zona di un gruppo entra nel gruppo:
  // ingrandita lì con le altre, invece che spenta nel riquadro e col filo
  // sulla mappa grande (visto: Montepulciano, rimasto fuori dall'Umbria)
  // — nella zona tratteggiata PIÙ PICCOLA che la contiene (Montepulciano sta
  // anche nella zona della costa, ma è umbro)
  const presi = new Set(daIngrandire.flat());
  const tratteggi = daIngrandire.map(g => {
    const xs = g.map(q => q.x), ys = g.map(q => q.y);
    return { x0: Math.min(...xs) - 8, x1: Math.max(...xs) + 8, y0: Math.min(...ys) - 8, y1: Math.max(...ys) + 8 };
  });
  for (const q of punti) {
    if (presi.has(q)) continue;
    let meglio = -1, area = Infinity;
    tratteggi.forEach((z, i) => {
      const a = (z.x1 - z.x0) * (z.y1 - z.y0);
      if (q.x > z.x0 && q.x < z.x1 && q.y > z.y0 && q.y < z.y1 && a < area) { meglio = i; area = a; }
    });
    if (meglio >= 0) { daIngrandire[meglio].push(q); presi.add(q); }
  }
  const nelRiquadro = new Set(daIngrandire.flat().map(p => p.id));

  // le zone tratteggiate si conoscono già qui, PRIMA dei nomi della mappa
  // grande: un nome scritto sopra un tratteggio si leggeva male (visto)
  const zone = daIngrandire.map(g => {
    const xs = g.map(p => p.x), ys = g.map(p => p.y);
    return { x: Math.min(...xs) - 8, y: Math.min(...ys) - 8, w: Math.max(...xs) - Math.min(...xs) + 16, h: Math.max(...ys) - Math.min(...ys) + 16 };
  });

  // 2. di nuovo accanto, senza i punti dei riquadri (il loro spazio si libera),
  //    lontano dai tratteggi
  const restanti = punti.filter(p => !nelRiquadro.has(p.id));
  const fuori = accanto(restanti, stelle, o, o.w, o.h, [...vietate, ...zone]);
  // chi non ci sta senza toccare un tratteggio ci va sopra, accanto alla sua
  // stella, come prima: vietarlo e basta faceva SPARIRE nomi (visto: Colmar,
  // Ginevra, Innsbruck…). Il numero della zona poi si sposta, lui sì.
  if (fuori.falliti.length) {
    const ancora = accanto(fuori.falliti, stelle, o, o.w, o.h, [...vietate, ...fuori.fatti.map(e => e.box)]);
    fuori.fatti.push(...ancora.fatti);
    fuori.falliti = ancora.falliti;
  }

  // i riquadri regolati a mano stanno dove li ha messi chi li ha regolati: i
  // nomi della mappa grande che ci finiscono sotto si rimettono col filo
  const fissi = o.riquadriFissi ?? {};
  const fissiQui = daIngrandire.map(g => fissi[chiaveGruppo(g.map(p => p.id))]).filter((x): x is RiquadroFisso => !!x);
  if (fissiQui.length) {
    const sotto = fuori.fatti.filter(e => fissiQui.some(fx => sovrapposti(e.box, fx.posto, 2)));
    fuori.fatti = fuori.fatti.filter(e => !sotto.includes(e));
    fuori.falliti.push(...sotto.map(e => punti.find(p => p.id === e.id)!));
  }

  // 3. i riquadri: ingranditi quanto serve, nel vuoto più vicino
  const occupatiRiquadri: Box[] = [...zone.map(z => ({ ...z })), ...fissiQui.map(fx => fx.posto)];
  const riquadri: Riquadro[] = [];
  const ordine = daIngrandire.map((g, i) => ({ g, i })).sort((a, b) => b.g.length - a.g.length);
  const tornaFuori: Punto[] = [];
  // gli OSPITI: una stella che si vede dentro un riquadro e che sulla mappa
  // grande non ha trovato posto accanto entra nel riquadro, col nome lì
  // (visto coi viaggi veri: Friburgo spenta nel riquadro dell'Alsazia e il
  // suo nome fuori, legato da un filo che passava SOTTO il riquadro)
  const senzaNomeFuori = new Set(fuori.falliti.map(p => p.id));
  const ospitati = new Set<string>();
  for (const { g, i } of ordine) {
    const zona = zone[i];
    const chiave = chiaveGruppo(g.map(p => p.id));
    const fisso = fissi[chiave];
    const { voluta, possibile, aria, zw, zh } = misureGruppo(g);
    let scala = Math.min(voluta, possibile);
    let w = Math.round(Math.max(110 * gR, zw * scala + aria.x)), h = Math.round(Math.max(76 * gR, zh * scala + aria.y));
    const centroZona = { x: zona.x + zona.w / 2, y: zona.y + zona.h / 2 };
    const libero = (r: Box) => dentro(r, o.w, o.h, o.margine)
      && !stelle.some(s => s.x > r.x - 8 && s.x < r.x + r.w + 8 && s.y > r.y - 8 && s.y < r.y + r.h + 8)
      && !campioniLinee.some(s => s.x > r.x - 4 && s.x < r.x + r.w + 4 && s.y > r.y - 4 && s.y < r.y + r.h + 4)
      && !fuori.fatti.some(e => sovrapposti(r, e.box, 4))
      && !occupatiRiquadri.some(b => sovrapposti(r, b, 6))
      && !vietate.some(b => sovrapposti(r, b, 4));
    // un nome del gruppo che dentro non entra NON va fuori al primo colpo: il
    // riquadro si allarga (stessa scala, più spazio intorno) e si riprova.
    // ⚠️ coi viaggi veri «Friburgo in Brisgovia», nel riquadro dell'Alsazia
    // largo 209 px, finiva sulla mappa grande col filo e la stella restava
    // dentro senza nome: «Friburgo esce dal quadrato»
    const prova = (w0: number, h0: number, scala0: number) => {
    let w = w0, h = h0, scala = scala0;
    let posto: Box | null = fisso ? { ...fisso.posto } : null;
    for (let tentativo = 0; tentativo < 3 && !posto; tentativo++) {
      posto = cercaPosto(centroZona, w, h, 30, Math.max(o.w, o.h) * 0.35, libero);
      if (!posto) { w = Math.round(w * 0.88); h = Math.round(h * 0.88); scala *= 0.88; }
    }
    posto = posto ?? cercaPosto(centroZona, w, h, 30, Math.max(o.w, o.h), libero);
    if (!posto) return null;
    const centroPosto = fisso ? { ...fisso.centro } : { x: posto.x + posto.w / 2, y: posto.y + posto.h / 2 };
    const dentroRiq = (p: { x: number; y: number }) => ({ x: centroPosto.x + (p.x - centroZona.x) * scala, y: centroPosto.y + (p.y - centroZona.y) * scala });
    const pz0 = posto;
    const siVede = (p: Punto) => {
      const q = dentroRiq(p);
      return q.x > pz0.x + 6 && q.x < pz0.x + pz0.w - 6 && q.y > pz0.y + 6 && q.y < pz0.y + pz0.h - 6;
    };
    const ospiti = punti.filter(p => !g.includes(p) && senzaNomeFuori.has(p.id) && !ospitati.has(p.id) && siVede(p));
    const tutti = [...g, ...ospiti];
    const membri = tutti.map(p => ({ ...p, ...dentroRiq(p) }));
    // dentro il riquadro, gli stessi nomi accanto (in coordinate del riquadro)
    const locali = membri.map(p => ({ ...p, x: p.x - posto!.x, y: p.y - posto!.y }));
    const altreVisibili = punti.filter(p => !tutti.includes(p)).map(dentroRiq)
      .filter(p => p.x > posto!.x && p.x < posto!.x + posto!.w && p.y > posto!.y && p.y < posto!.y + posto!.h)
      .map(p => ({ x: p.x - posto!.x, y: p.y - posto!.y }));
    // l'angolo del numero, in proporzione al carattere (schermo e stampa)
    const angoloNumero: Box = { x: 0, y: 0, w: Math.round(o.altezza * 1.9), h: Math.round(o.altezza * 1.6) };
    const interni = accanto(locali, [...locali, ...altreVisibili], { ...o, margine: 4 }, posto.w, posto.h, [angoloNumero]);
    const pz = posto;
    // chi non sta accanto resta nel riquadro col filo (prima finiva sulla mappa
    // grande, con fili da un capo all'altro: Como e Varenna fuori, Bellagio dentro)
    const filiDentro: EtichettaConFilo[] = [];
    const senzaNomeQui: Punto[] = [];
    const stelleLoc = [...locali, ...altreVisibili].map(q => ({ x: q.x - o.raggioStella - 1, y: q.y - o.raggioStella - 1, w: 2 * o.raggioStella + 2, h: 2 * o.raggioStella + 2 }));
    for (const q of interni.falliti) {
      const tw = o.misura(q.nome);
      const box = postoColFilo(q, tw, o.altezza, o.scostamento, Math.max(pz.w, pz.h), r => dentro(r, pz.w, pz.h, 4)
        && !stelleLoc.some(b => sovrapposti(r, b, 1))
        && !interni.fatti.some(e => sovrapposti(r, e.box, 2))
        && !filiDentro.some(e => sovrapposti(r, e.box, 2))
        && !sovrapposti(r, angoloNumero, 1));
      if (box) filiDentro.push(conIlFilo(q.id, q.nome, q, box, o.altezza));
      else senzaNomeQui.push(punti.find(x => x.id === q.id)!);
    }
    return { posto, pz, scala, centroPosto, membri, altreVisibili, ospiti, tutti, interni, filiDentro, senzaNomeQui };
    };
    let esito = prova(w, h, scala);
    // (un riquadro regolato a mano non si allarga da sé: lo decide chi lo regola)
    for (let allarga = 0; allarga < 3 && !fisso && esito && esito.senzaNomeQui.length; allarga++) {
      // più spazio quanto il nome più lungo rimasto fuori, in largo e in alto
      const manca = Math.max(...esito.senzaNomeQui.map(q => o.misura(q.nome)));
      w = Math.round(w + manca * 0.7 + o.scostamento * 2);
      h = Math.round(h + (o.altezza + o.scostamento) * 1.5);
      const piu = prova(w, h, scala);
      if (piu && piu.senzaNomeQui.length < esito.senzaNomeQui.length) esito = piu;
    }
    if (!esito) { tornaFuori.push(...g); continue; }
    const { posto, pz, centroPosto, membri, altreVisibili, ospiti, tutti, interni, filiDentro, senzaNomeQui } = esito;
    scala = esito.scala;
    // un riquadro che non tiene dentro almeno metà dei suoi nomi non serve:
    // si scarta e le sue stelle tornano sulla mappa grande (visto sul telefono:
    // un riquadro rimpicciolito per entrare, con tre stelle e nessun nome)
    if (!fisso && interni.fatti.length + filiDentro.length < g.length / 2) { tornaFuori.push(...g); continue; }
    tornaFuori.push(...senzaNomeQui);
    for (const p of ospiti) if (!senzaNomeQui.includes(p)) ospitati.add(p.id);
    occupatiRiquadri.push(posto);
    // il tratteggio abbraccia anche gli ospiti accolti (la loro stella sulla
    // mappa grande resta senza nome: si capisce che è dentro il riquadro)
    const accolti = ospiti.filter(p => ospitati.has(p.id));
    const zonaVista = accolti.length ? (() => {
      const x0 = Math.min(zona.x, ...accolti.map(p => p.x - 8)), y0 = Math.min(zona.y, ...accolti.map(p => p.y - 8));
      const x1 = Math.max(zona.x + zona.w, ...accolti.map(p => p.x + 8)), y1 = Math.max(zona.y + zona.h, ...accolti.map(p => p.y + 8));
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    })() : zona;
    const sposta = <T extends Etichetta>(e: T): T => ({
      ...e, box: { ...e.box, x: e.box.x + pz.x, y: e.box.y + pz.y }, testo: { ...e.testo, x: e.testo.x + pz.x, y: e.testo.y + pz.y },
    });
    const a = piuVicino(zonaVista, centroPosto), b = piuVicino(pz, centroZona);
    riquadri.push({
      numero: 0, chiave, ids: tutti.filter(p => !senzaNomeQui.includes(p) || g.includes(p)).map(p => p.id),
      zona: zonaVista, posto: pz, numeroZona: zonaVista, scala, centroZona, centroPosto,
      filo: { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
      // (chi dentro è rimasto senza nome ha la stella spenta: il suo nome è fuori)
      stelle: membri.filter(p => !senzaNomeQui.some(q => q.id === p.id)).map(p => ({ id: p.id, x: p.x, y: p.y })),
      altre: [
        ...altreVisibili.map(q => ({ x: q.x + pz.x, y: q.y + pz.y })),
        // un ospite che dentro non ha trovato posto resta una stella spenta
        ...membri.filter(p => senzaNomeQui.some(q => q.id === p.id) || (!g.some(q => q.id === p.id) && !ospitati.has(p.id))).map(p => ({ x: p.x, y: p.y })),
      ],
      nomi: interni.fatti.map(sposta),
      conFilo: filiDentro.map(e => ({ ...sposta(e), filo: { x1: e.filo.x1 + pz.x, y1: e.filo.y1 + pz.y, x2: e.filo.x2 + pz.x, y2: e.filo.y2 + pz.y } })),
    });
  }
  // numeri in ordine di lettura (dall'alto, poi da sinistra)
  riquadri.sort((a, b) => a.zona.y - b.zona.y || a.zona.x - b.zona.x).forEach((r, i) => { r.numero = i + 1; });
  // il numero accanto al tratteggio, nel primo angolo libero da stelle, nomi,
  // riquadri, fili e altri numeri: attaccato a un nome si leggeva «Bolzano 3»
  // (visto). Si sceglie DOPO i riquadri, che così vanno nel vuoto più vicino
  // senza un numero di troppo fra i piedi.
  const stelleIngombro = stelle.map(s => ({ x: s.x - o.raggioStella - 1, y: s.y - o.raggioStella - 1, w: 2 * o.raggioStella + 2, h: 2 * o.raggioStella + 2 }));
  const sulFilo = (b: Box, f: Riquadro["filo"]) => {
    for (let k = 0; k <= 10; k++) {
      const x = f.x1 + ((f.x2 - f.x1) * k) / 10, y = f.y1 + ((f.y2 - f.y1) * k) / 10;
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
    }
    return false;
  };
  const numeri: Box[] = [];
  for (const r of riquadri) {
    const z = r.zona, n = Math.round(o.altezza * 1.3);   // il bollino (scelta D): un cerchio poco più alto del testo
    const angoli: Box[] = [
      { x: z.x + z.w + 2, y: z.y - n, w: n, h: n },
      { x: z.x - 2 - n, y: z.y - n, w: n, h: n },
      { x: z.x + z.w + 2, y: z.y + z.h, w: n, h: n },
      { x: z.x - 2 - n, y: z.y + z.h, w: n, h: n },
      { x: z.x + z.w + 2, y: z.y + z.h / 2 - n / 2, w: n, h: n },
      { x: z.x - 2 - n, y: z.y + z.h / 2 - n / 2, w: n, h: n },
    ];
    // angoli tutti presi (scene fitte): lungo il bordo, poi qualche giro più in là
    for (const s of [2, 2 + n, 2 + 2 * n, 2 + 3 * n]) {
      for (let x = z.x - s - n; x <= z.x + z.w + s; x += n / 2) {
        angoli.push({ x, y: z.y - s - n, w: n, h: n }, { x, y: z.y + z.h + s, w: n, h: n });
      }
      for (let y = z.y - s - n; y <= z.y + z.h + s; y += n / 2) {
        angoli.push({ x: z.x - s - n, y, w: n, h: n }, { x: z.x + z.w + s, y, w: n, h: n });
      }
    }
    r.numeroZona = angoli.find(b => dentro(b, o.w, o.h, 2)
      && !stelleIngombro.some(s => sovrapposti(b, s))
      && !fuori.fatti.some(e => sovrapposti(b, e.box, 1))
      && !riquadri.some(q => sovrapposti(b, q.posto, 2) || (q !== r && sovrapposti(b, q.zona, 1)) || sulFilo(b, q.filo))
      && !numeri.some(m => sovrapposti(b, m, 1))
      && !vietate.some(v => sovrapposti(b, v, 1))) ?? angoli[0];
    numeri.push(r.numeroZona);
  }

  // 4. col filo: chi resta senza nome, nel posto libero più vicino
  const conFilo: EtichettaConFilo[] = [];
  const senzaPosto: string[] = [];
  const stelleBox = stelle.map(s => ({ x: s.x - o.raggioStella - 1, y: s.y - o.raggioStella - 1, w: 2 * o.raggioStella + 2, h: 2 * o.raggioStella + 2 }));
  for (const p of [...fuori.falliti.filter(q => !ospitati.has(q.id)), ...tornaFuori.filter(q => !fuori.fatti.some(e => e.id === q.id))]) {
    if (conFilo.some(e => e.id === p.id)) continue;
    const tw = o.misura(p.nome), th = o.altezza;
    // un filo che passa SOTTO un riquadro non si vede, e il nome sembra di
    // nessuno: fuori dall'ultima spiaggia, il filo gira intorno ai riquadri
    const filoSottoRiquadro = (r: Box) => {
      const fine = piuVicino(r, p);
      for (let k = 1; k < 20; k++) {
        const x = p.x + ((fine.x - p.x) * k) / 20, y = p.y + ((fine.y - p.y) * k) / 20;
        if (riquadri.some(q => x > q.posto.x - 2 && x < q.posto.x + q.posto.w + 2 && y > q.posto.y - 2 && y < q.posto.y + q.posto.h + 2)) return true;
      }
      return false;
    };
    const libero = (sulTratteggio: boolean, sottoRiquadri = false) => (r: Box) => dentro(r, o.w, o.h, o.margine)
      && (sottoRiquadri || !filoSottoRiquadro(r))
      && !stelleBox.some(s => sovrapposti(r, s, 1))
      && !fuori.fatti.some(e => sovrapposti(r, e.box, 2))
      && !conFilo.some(e => sovrapposti(r, e.box, 2))
      && !riquadri.some(q => sovrapposti(r, q.posto, 3) || (!sulTratteggio && sovrapposti(r, q.zona, 2)) || sovrapposti(r, q.numeroZona, 2))
      && !vietate.some(b => sovrapposti(r, b, 2));
    // ultima spiaggia: anche sopra un tratteggio (mai sopra il suo numero) e
    // con il filo lungo quanto serve. Brutto, ma un nome che manca è peggio:
    // ne sparivano (Chamonix sul telefono, Alberobello sul desktop; col
    // doppio di filoMax ancora San Benedetto, visto). La ricerca parte
    // comunque da vicino: il filo è lungo solo se serve.
    // e un filo passa sotto un riquadro solo se non c'è proprio altra strada
    // (Friburgo: era un filo lungo dell'ultima spiaggia, che sotto ci passava)
    const box = postoColFilo(p, tw, th, o.scostamento, o.filoMax ?? 90, libero(false))
      ?? postoColFilo(p, tw, th, o.scostamento, Math.max(o.w, o.h), libero(true))
      ?? postoColFilo(p, tw, th, o.scostamento, Math.max(o.w, o.h), libero(true, true));
    if (!box) { senzaPosto.push(p.nome); continue; }
    conFilo.push(conIlFilo(p.id, p.nome, p, box, th));
  }
  return { accanto: fuori.fatti, conFilo, riquadri, senzaPosto };
}
