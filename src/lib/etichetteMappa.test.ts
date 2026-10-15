import { describe, it, expect } from "vitest";
import { disponiEtichette, type Box, type Opzioni, type Punto } from "./etichetteMappa";

const OPZ: Opzioni = {
  w: 600, h: 800, misura: (n: string) => n.length * 6, altezza: 12, raggioStella: 3,
  scostamento: 5, distanzaGrappolo: 15, margine: 6,
};
const p = (id: string, x: number, y: number, nome = id): Punto => ({ id, nome, x, y });
const sovrapposti = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/** Tutti i riquadri di testo scritti sul foglio (accanto, col filo, nei riquadri). */
const scritte = (d: ReturnType<typeof disponiEtichette>) => [
  ...d.accanto.map(e => e.box), ...d.conFilo.map(e => e.box), ...d.riquadri.flatMap(r => r.nomi.map(e => e.box)),
];
/** Il nome di ogni punto compare esattamente una volta, da qualche parte. */
const nomiScritti = (d: ReturnType<typeof disponiEtichette>) => [
  ...d.accanto.map(e => e.id), ...d.conFilo.map(e => e.id), ...d.riquadri.flatMap(r => r.nomi.map(e => e.id)),
];

describe("disponiEtichette", () => {
  it("stelle lontane: ogni nome accanto alla sua, niente riquadri né fili", () => {
    const punti = [p("Edimburgo", 100, 100), p("Vienna", 400, 300), p("Bari", 300, 650)];
    const d = disponiEtichette(punti, OPZ);
    expect(d.accanto.map(e => e.id).sort()).toEqual(["Bari", "Edimburgo", "Vienna"]);
    expect(d.riquadri).toEqual([]);
    expect(d.conFilo).toEqual([]);
  });

  it("un grappolo di stelle che quasi si toccano finisce in un riquadro, coi suoi nomi", () => {
    const umbria = [p("Perugia", 300, 400), p("Assisi", 309, 403), p("Spello", 312, 409), p("Cortona", 293, 393), p("Montepulciano", 287, 401)];
    const d = disponiEtichette([...umbria, p("Edimburgo", 80, 80)], OPZ);
    expect(d.riquadri).toHaveLength(1);
    const r = d.riquadri[0];
    expect(r.ids.sort()).toEqual(umbria.map(q => q.id).sort());
    expect(r.nomi.map(e => e.id).sort()).toEqual(umbria.map(q => q.id).sort());   // tutti, nel riquadro
    expect(r.scala).toBeGreaterThanOrEqual(2);
    // e sulla mappa grande quei nomi NON ci sono
    expect(d.accanto.map(e => e.id)).toEqual(["Edimburgo"]);
  });

  it("ogni nome è scritto una volta sola, e nessuna scritta ne copre un'altra", () => {
    const punti: Punto[] = [];
    // un'Italia finta: una catena lungo la costa, un grappolo, stelle sparse
    for (let i = 0; i < 12; i++) punti.push(p(`Costa${i}`, 250 + i * 14, 300 + i * 30));
    for (let i = 0; i < 6; i++) punti.push(p(`Lago${i}`, 420 + (i % 3) * 7, 250 + Math.floor(i / 3) * 7));
    for (let i = 0; i < 8; i++) punti.push(p(`Sparsa${i}`, 60 + i * 65, 120 + (i % 2) * 40));
    const d = disponiEtichette(punti, OPZ);
    const ids = nomiScritti(d);
    expect(d.senzaPosto).toEqual([]);
    expect(ids.sort()).toEqual(punti.map(q => q.id).sort());
    const box = scritte(d);
    for (let i = 0; i < box.length; i++) for (let j = i + 1; j < box.length; j++) {
      expect(sovrapposti(box[i], box[j]), `scritte ${i} e ${j} sovrapposte`).toBe(false);
    }
  });

  it("i riquadri stanno nel foglio, non si toccano e non coprono stelle né nomi della mappa", () => {
    const punti: Punto[] = [];
    for (let g = 0; g < 3; g++) for (let i = 0; i < 4; i++) punti.push(p(`G${g}-${i}`, 200 + g * 120 + (i % 2) * 8, 400 + Math.floor(i / 2) * 8));
    const d = disponiEtichette(punti, OPZ);
    expect(d.riquadri.length).toBe(3);
    for (const r of d.riquadri) {
      expect(r.posto.x).toBeGreaterThanOrEqual(OPZ.margine);
      expect(r.posto.y).toBeGreaterThanOrEqual(OPZ.margine);
      expect(r.posto.x + r.posto.w).toBeLessThanOrEqual(OPZ.w - OPZ.margine);
      expect(r.posto.y + r.posto.h).toBeLessThanOrEqual(OPZ.h - OPZ.margine);
      for (const s of punti) expect(s.x > r.posto.x && s.x < r.posto.x + r.posto.w && s.y > r.posto.y && s.y < r.posto.y + r.posto.h).toBe(false);
      for (const e of d.accanto) expect(sovrapposti(e.box, r.posto)).toBe(false);
    }
    for (let i = 0; i < d.riquadri.length; i++) for (let j = i + 1; j < d.riquadri.length; j++) {
      expect(sovrapposti(d.riquadri[i].posto, d.riquadri[j].posto)).toBe(false);
    }
  });

  it("il riquadro va nel vuoto PIÙ VICINO, cominciando da sopra", () => {
    const g = [p("a", 300, 500, "Bellagio"), p("b", 307, 503, "Varenna"), p("c", 304, 509, "Menaggio")];
    const d = disponiEtichette(g, OPZ);
    const r = d.riquadri[0];
    expect(r.centroPosto.y).toBeLessThan(r.centroZona.y);                 // sopra
    expect(Math.abs(r.centroPosto.x - r.centroZona.x)).toBeLessThan(40);   // non di lato
  });

  it("dentro il riquadro le stelle sono ingrandite intorno alla zona", () => {
    const g = [p("a", 300, 500, "Bellagio"), p("b", 307, 503, "Varenna"), p("c", 304, 509, "Menaggio")];
    const r = disponiEtichette(g, OPZ).riquadri[0];
    const a = r.stelle.find(s => s.id === "a")!, b = r.stelle.find(s => s.id === "b")!;
    // la distanza fra due stelle cresce esattamente della scala
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(Math.hypot(7, 3) * r.scala, 6);
    expect(r.filo.x1).toBeGreaterThanOrEqual(r.zona.x);
  });

  it("una stella il cui nome non entra accanto prende il nome col filo, non un riquadro", () => {
    // tutt'intorno alla stella lo spazio è vietato: i quattro posti accanto sono tolti
    const vietate: Box[] = [{ x: 220, y: 270, w: 160, h: 60 }];
    const d = disponiEtichette([p("Montepulciano", 300, 300)], { ...OPZ, vietate });
    expect(d.riquadri).toEqual([]);
    expect(d.accanto).toEqual([]);
    expect(d.conFilo).toHaveLength(1);
    const e = d.conFilo[0];
    expect(e.filo.x1).toBe(300);
    expect(e.filo.y1).toBe(300);
    // e il filo arriva DAVVERO all'etichetta
    expect(e.filo.x2).toBeGreaterThanOrEqual(e.box.x);
    expect(e.filo.x2).toBeLessThanOrEqual(e.box.x + e.box.w);
    expect(e.filo.y2).toBeGreaterThanOrEqual(e.box.y);
    expect(e.filo.y2).toBeLessThanOrEqual(e.box.y + e.box.h);
  });

  it("due nomi lunghi su stelle vicine si spostano invece di coprirsi", () => {
    // non un grappolo (sono due), ma a «sopra» i due nomi si accavallerebbero
    const d = disponiEtichette([p("Montepulciano", 300, 300), p("Castiglione del Lago", 330, 302)], OPZ);
    const box = scritte(d);
    expect(box).toHaveLength(2);
    expect(sovrapposti(box[0], box[1])).toBe(false);
  });

  it("un grappolo nell'angolo: il riquadro resta comunque dentro il foglio", () => {
    const d = disponiEtichette([p("Fort William", 20, 20), p("Glencoe", 27, 24), p("Kinlochleven", 23, 29)], OPZ);
    const r = d.riquadri[0];
    expect(r).toBeDefined();
    expect(r.posto.x).toBeGreaterThanOrEqual(OPZ.margine);
    expect(r.posto.y).toBeGreaterThanOrEqual(OPZ.margine);
  });

  it("il riquadro non copre una stella nemmeno quando quella non ha il nome accanto", () => {
    // il nome è troppo lungo per stare da qualunque parte: sulla mappa resta la
    // sola stella, e niente scritta la «protegge» — conta solo il controllo stelle
    const lunghissimo = "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch".repeat(2);
    const d = disponiEtichette([p("lungo", 300, 440, lunghissimo), p("Bellagio", 300, 500), p("Varenna", 307, 503), p("Menaggio", 304, 509)], OPZ);
    const r = d.riquadri[0];
    expect(r).toBeDefined();
    const coperta = 300 > r.posto.x && 300 < r.posto.x + r.posto.w && 440 > r.posto.y && 440 < r.posto.y + r.posto.h;
    expect(coperta).toBe(false);
  });

  it("in mezzo a tante stelle, il riquadro non ne copre nessuna", () => {
    // un cielo fitto ma regolare di stelle isolate, e un grappolo al centro
    const punti: Punto[] = [];
    let seme = 7;
    const caso = () => { seme = (seme * 16807) % 2147483647; return seme / 2147483647; };
    for (let i = 0; i < 70; i++) {
      const x = 30 + caso() * 540, y = 30 + caso() * 740;
      if (Math.hypot(x - 300, y - 400) > 40) punti.push(p(`s${i}`, x, y, "·"));
    }
    punti.push(p("Bellagio", 300, 400), p("Varenna", 307, 403), p("Menaggio", 304, 409));
    const d = disponiEtichette(punti, OPZ);
    expect(d.riquadri.length).toBeGreaterThan(0);
    for (const r of d.riquadri) for (const s of punti) {
      const dentroRiq = s.x > r.posto.x && s.x < r.posto.x + r.posto.w && s.y > r.posto.y && s.y < r.posto.y + r.posto.h;
      expect(dentroRiq, `la stella ${s.id} è sotto il riquadro ${r.numero}`).toBe(false);
    }
  });

  it("le zone vietate (i bottoni) restano libere da nomi e riquadri", () => {
    const vietata: Box = { x: 0, y: 0, w: 120, h: 120 };
    const d = disponiEtichette([p("Vicino-al-bottone", 60, 140), p("x1", 300, 300), p("x2", 306, 303), p("x3", 303, 309)], { ...OPZ, vietate: [vietata] });
    for (const b of scritte(d)) expect(sovrapposti(b, vietata)).toBe(false);
    for (const r of d.riquadri) expect(sovrapposti(r.posto, vietata)).toBe(false);
  });

  it("una catena di tappe vicine (un lungo viaggio in auto) NON diventa un grappolo unico", () => {
    // 12 tappe a 12 px l'una dall'altra: a catena sarebbero un solo grappolo da 130 px
    const catena = Array.from({ length: 12 }, (_, i) => p(`Tappa${i}`, 200 + i * 8, 200 + i * 9));
    const d = disponiEtichette(catena, OPZ);
    for (const r of d.riquadri) {
      expect(r.zona.w, `il riquadro ${r.numero} copre ${Math.round(r.zona.w)} px di catena`).toBeLessThan(70);
      expect(r.zona.h).toBeLessThan(70);
    }
  });

  it("i nomi di un riquadro restano nel riquadro (accanto o col filo), mai sulla mappa grande", () => {
    // un grappolo stretto di nomi lunghi: nel riquadro non stanno tutti accanto
    const g = [p("a", 300, 400, "San Feliciano sul Trasimeno"), p("b", 304, 402, "Castiglione del Lago"), p("c", 302, 406, "Passignano sul Trasimeno"), p("d", 306, 405, "Tuoro sul Trasimeno")];
    const d = disponiEtichette(g, OPZ);
    expect(d.riquadri).toHaveLength(1);
    const r = d.riquadri[0];
    const dentroRiq = [...r.nomi, ...r.conFilo].map(e => e.id).sort();
    expect(dentroRiq).toEqual(["a", "b", "c", "d"]);
    expect(d.accanto).toEqual([]);
    expect(d.conFilo).toEqual([]);
    for (const e of [...r.nomi, ...r.conFilo]) {
      expect(e.box.x).toBeGreaterThanOrEqual(r.posto.x);
      expect(e.box.x + e.box.w).toBeLessThanOrEqual(r.posto.x + r.posto.w);
    }
  });

  it("sulla mappa grande un filo non è mai più lungo di filoMax", () => {
    const vietate: Box[] = [{ x: 200, y: 260, w: 200, h: 80 }];
    const d = disponiEtichette([p("Montepulciano", 300, 300)], { ...OPZ, vietate, filoMax: 60 });
    for (const e of d.conFilo) expect(Math.hypot(e.filo.x2 - e.filo.x1, e.filo.y2 - e.filo.y1)).toBeLessThanOrEqual(60);
  });

  it("tre stelle vicine ma distinte, coi nomi che stanno accanto: niente riquadro", () => {
    const d = disponiEtichette([p("Genova", 300, 300), p("Pisa", 318, 310), p("Lucca", 296, 322)], OPZ);
    expect(d.riquadri).toEqual([]);
    expect(nomiScritti(d).sort()).toEqual(["Genova", "Lucca", "Pisa"]);
  });

  it("l'angolo del numero, in alto a sinistra nel riquadro, resta libero dai nomi", () => {
    const g = [p("a", 300, 400, "Bellagio"), p("b", 304, 402, "Varenna"), p("c", 302, 406, "Menaggio"), p("d", 306, 405, "Lecco")];
    const r = disponiEtichette(g, OPZ).riquadri[0];
    const angolo: Box = { x: r.posto.x, y: r.posto.y, w: 22, h: 20 };
    for (const e of [...r.nomi, ...r.conFilo]) expect(sovrapposti(e.box, angolo)).toBe(false);
  });

  it("nessun punto: nessuna scritta", () => {
    expect(disponiEtichette([], OPZ)).toEqual({ accanto: [], conFilo: [], riquadri: [], senzaPosto: [] });
  });
});
