import { describe, it, expect } from "vitest";
import { disponiEtichette, type Box, type Opzioni, type Punto } from "./etichetteMappa";
import { LINEE_SOFY, PUNTI_SOFY } from "./etichetteMappa.scenaSofy";

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

  it("sulla mappa grande il filo resta entro filoMax, quando lì un posto c'è", () => {
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

  it("i nomi della mappa grande non toccano i tratteggi né i loro numeri (era «Bolzano 3»)", () => {
    // tante scene da telefono, fitte, con un generatore fisso: il difetto
    // c'era in alcune, non in tutte
    let seme = 11;
    const caso = () => (seme = (seme * 16807) % 2147483647) / 2147483647;
    const o: Opzioni = { ...OPZ, w: 390, h: 700, altezza: 13, raggioStella: 4, scostamento: 6, margine: 8 };
    let zoneViste = 0, senzaPosto = 0;
    for (let scena = 0; scena < 25; scena++) {
      const punti: Punto[] = [];
      for (let g = 0; g < 6; g++) {
        const cx = 60 + caso() * 270, cy = 80 + caso() * 540;
        for (let i = 0; i < 5; i++) punti.push(p(`s${scena}g${g}i${i}`, cx + (caso() - 0.5) * 40, cy + (caso() - 0.5) * 40, "Nome" + "x".repeat(Math.floor(caso() * 6))));
      }
      const d = disponiEtichette(punti, o);
      senzaPosto += d.senzaPosto.length;
      for (const r of d.riquadri) {
        zoneViste++;
        // (sul tratteggio un nome ci può finire, come ultima spiaggia: vedi
        // il test «dal lato libero» — sul numero mai)
        for (const e of [...d.accanto, ...d.conFilo]) {
          expect(sovrapposti(e.box, r.numeroZona), `scena ${scena}: ${e.id} sul numero ${r.numero}`).toBe(false);
        }
        // due bollini non si sovrappongono (visti il 7 e l'8 uno sull'altro)
        for (const q of d.riquadri) if (q !== r) expect(sovrapposti(q.numeroZona, r.numeroZona), `scena ${scena}: bollini ${q.numero} e ${r.numero}`).toBe(false);
        for (const q of punti) {
          const stella: Box = { x: q.x - o.raggioStella, y: q.y - o.raggioStella, w: 2 * o.raggioStella, h: 2 * o.raggioStella };
          if (!sovrapposti(stella, r.zona)) expect(sovrapposti(stella, r.numeroZona), `scena ${scena}: numero ${r.numero} su una stella`).toBe(false);
        }
      }
    }
    expect(zoneViste).toBeGreaterThan(20);   // la prova ha davvero visto delle zone
    expect(senzaPosto).toBe(0);              // e nessun nome è andato perso
  });

  it("un nome accanto a un tratteggio va dal lato libero, non sopra il tratteggio", () => {
    // sopra «Lontano» c'è la zona del grappolo: il primo posto provato (sopra)
    // la coprirebbe, sotto è libero
    const g = [p("c", 300, 400, "Centro"), p("a", 303, 402, "Accanto"), p("b", 306, 398, "Basso")];
    const d = disponiEtichette([...g, p("L", 320, 422, "Lontano")], OPZ);
    expect(d.riquadri).toHaveLength(1);
    const e = d.accanto.find(x => x.id === "L");
    expect(e, "Lontano scritto accanto").toBeDefined();
    expect(sovrapposti(e!.box, d.riquadri[0].zona)).toBe(false);
  });

  it("una stella chiusa fra un tratteggio e i bordi tiene il suo nome, anche sopra il tratteggio", () => {
    // il grappolo fa la zona; «Lontana» è appena fuori (dentro, entrerebbe
    // nel gruppo) e tutto attorno è vietato: resta solo il tratteggio
    // (grappoli larghi: distanzaGrappolo 40 → stelle fino a 64 px dal centro)
    const g = [p("c", 300, 400, "Centro"), p("a", 310, 405, "Accanto"), p("n", 300, 340, "Nord"), p("e", 360, 400, "Est")];
    const sola = p("L", 372, 345, "Lontana");   // appena fuori dalla zona: a sinistra il nome ci finisce sopra
    const d = disponiEtichette([...g, sola], {
      ...OPZ, distanzaGrappolo: 40,
      // libero solo l'interno della zona e, lontano, una fascia per il riquadro
      vietate: [{ x: 0, y: 0, w: 600, h: 328 }, { x: 372, y: 328, w: 228, h: 272 }, { x: 0, y: 328, w: 288, h: 272 }, { x: 288, y: 417, w: 84, h: 183 }],
    });
    expect(d.riquadri).toHaveLength(1);
    expect(d.riquadri[0].ids).not.toContain("L");
    expect(d.senzaPosto).toEqual([]);
    // accanto (a sinistra, dentro il tratteggio), non col filo: di chi sia
    // si capisce meglio
    expect(d.accanto.map(e => e.id)).toContain("L");
  });

  it("…e se nemmeno accanto c'è posto, col filo sopra il tratteggio", () => {
    // la stessa scena, ma il nome lungo accanto a sinistra toccherebbe «Nord»
    const g = [p("c", 300, 400, "Centro"), p("a", 310, 405, "Accanto"), p("n", 300, 340, "Nord"), p("e", 360, 400, "Est")];
    const d = disponiEtichette([...g, p("L", 372, 345, "Lontanissima")], {
      ...OPZ, distanzaGrappolo: 40,
      vietate: [{ x: 0, y: 0, w: 600, h: 328 }, { x: 372, y: 328, w: 228, h: 272 }, { x: 0, y: 328, w: 288, h: 272 }, { x: 288, y: 417, w: 84, h: 183 }],
    });
    expect(d.senzaPosto).toEqual([]);
    expect(d.conFilo.map(e => e.id)).toContain("L");
    expect(sovrapposti(d.conFilo.find(e => e.id === "L")!.box, d.riquadri[0].zona)).toBe(true);
  });

  it("se vicino non c'è posto, il filo si allunga piuttosto che perdere il nome (ma il meno possibile)", () => {
    // tutto vietato tranne una tasca a ~70 px dalla stella: oltre filoMax 40
    const d = disponiEtichette([p("L", 300, 400, "Lontano")], {
      ...OPZ, filoMax: 40,
      vietate: [{ x: 0, y: 0, w: 600, h: 383 }, { x: 0, y: 417, w: 600, h: 383 }, { x: 0, y: 383, w: 338, h: 34 }, { x: 422, y: 383, w: 178, h: 34 }],
    });
    expect(d.senzaPosto).toEqual([]);
    expect(d.conFilo).toHaveLength(1);
    const f = d.conFilo[0].filo;
    expect(Math.hypot(f.x2 - f.x1, f.y2 - f.y1)).toBeLessThanOrEqual(80);
  });

  // le coordinate VERE del telefono (390 px) in cui l'Umbria restava
  // appiccicata dentro un solo riquadro da Pisa a Roma
  const CENTRO_ITALIA_TELEFONO = [
    p("Pisa", 200, 333), p("Grosseto", 206, 345), p("Roma", 219, 356), p("Città del Vaticano", 219.5, 356.3),
    p("Ascoli Piceno", 229, 344), p("San Benedetto", 232, 343),
    p("Perugia", 218, 341), p("San Feliciano", 216, 341), p("Cortona", 214, 339), p("Montepulciano", 212, 341), p("Spello", 221, 342), p("Assisi", 220, 341),
  ];
  const UMBRIA = ["Perugia", "San Feliciano", "Cortona", "Montepulciano", "Spello", "Assisi"];
  const OPZ_TELEFONO: Opzioni = { ...OPZ, w: 340, h: 600, altezza: 13, raggioStella: 4, scostamento: 6, margine: 8 };

  it("un gruppo che nemmeno ingrandito si stacca si divide: l'Umbria ha il suo riquadro (scelta C)", () => {
    const d = disponiEtichette(CENTRO_ITALIA_TELEFONO, OPZ_TELEFONO);
    const umbria = d.riquadri.find(r => r.ids.includes("Perugia"))!;
    expect(umbria, "un riquadro con Perugia").toBeDefined();
    expect([...umbria.ids].sort()).toEqual([...UMBRIA].sort());   // solo l'Umbria, non la costa
    expect(d.riquadri.length).toBeGreaterThanOrEqual(2);
    expect(d.senzaPosto).toEqual([]);
  });

  it("un riquadro che non tiene almeno metà dei suoi nomi si scarta: i nomi tornano fuori", () => {
    // tre stelle fitte dai nomi lunghi; libera solo una tasca bassa sotto di
    // loro: il riquadro ci entrerebbe solo rimpicciolito, e i nomi no
    // (nomi da 108 px; la tasca è 160×80: ci sta solo un riquadro
    // rimpicciolito, e lì dentro nomi così non entrano — scena cercata
    // apposta fra tante: deve fallire se la regola manca)
    const g = [p("a", 300, 300, "Montescudaio Basso"), p("b", 304, 302, "Castelvecchio Alto"), p("c", 302, 305, "Monteriggioni Alta")];
    const d = disponiEtichette(g, {
      ...OPZ,
      vietate: [{ x: 0, y: 0, w: 600, h: 330 }, { x: 0, y: 410, w: 600, h: 390 }, { x: 0, y: 330, w: 220, h: 80 }, { x: 380, y: 330, w: 220, h: 80 }],
    });
    expect(d.riquadri).toEqual([]);
    expect(d.senzaPosto).toEqual([]);
    expect(d.conFilo.map(e => e.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("una stella libera in due zone entra in quella più piccola, anche se l'altra viene prima", () => {
    // A (prima, più alta) e B (più bassa) si toccano col tratteggio; F sta
    // nel mezzo, a più di 24 px da entrambi i centri: non è di nessuno dei due
    const A = [p("A1", 300, 300), p("A2", 303, 300), p("A3", 300, 303), p("A4", 322, 300), p("A5", 300, 318)];
    const B = [p("B1", 350, 300), p("B2", 353, 300), p("B3", 350, 303), p("B4", 328, 300)];
    const d = disponiEtichette([...A, ...B, p("F", 325, 308)], OPZ);
    const rB = d.riquadri.find(r => r.ids.includes("B1"))!;
    expect(rB.ids).toContain("F");
    expect(d.riquadri.find(r => r.ids.includes("A1"))!.ids).not.toContain("F");
  });

  it("nel riquadro, le stelle di ALTRE tappe che ci cadono dentro sono elencate a parte (scelta B)", () => {
    const d = disponiEtichette(CENTRO_ITALIA_TELEFONO, OPZ_TELEFONO);
    for (const r of d.riquadri) {
      const fuori = CENTRO_ITALIA_TELEFONO.filter(q => !r.ids.includes(q.id));
      // ogni stella «altrui» dentro il riquadro è nell'elenco, e nessuna del gruppo
      const attese = fuori
        .map(q => ({ x: r.centroPosto.x + (q.x - r.centroZona.x) * r.scala, y: r.centroPosto.y + (q.y - r.centroZona.y) * r.scala }))
        .filter(q => q.x > r.posto.x && q.x < r.posto.x + r.posto.w && q.y > r.posto.y && q.y < r.posto.y + r.posto.h);
      expect(r.altre).toHaveLength(attese.length);
      for (const s of r.stelle) expect(r.altre.some(a => Math.abs(a.x - s.x) < 0.01 && Math.abs(a.y - s.y) < 0.01)).toBe(false);
    }
    expect(d.riquadri.some(r => r.altre.length > 0), "la prova ha davvero visto stelle altrui").toBe(true);
  });

  it("grandezzaRiquadri (la stampa): stesso gruppo, riquadro più grande e con più margine", () => {
    const umbria = [p("Perugia", 300, 400), p("Assisi", 309, 403), p("Spello", 312, 409), p("Cortona", 293, 393), p("Montepulciano", 287, 401)];
    const base = disponiEtichette(umbria, OPZ).riquadri[0];
    const grande = disponiEtichette(umbria, { ...OPZ, grandezzaRiquadri: 1.42 }).riquadri[0];
    expect(grande.posto.w).toBeGreaterThan(base.posto.w * 1.1);   // cresce soprattutto il margine
    expect(grande.posto.h).toBeGreaterThan(base.posto.h * 1.1);
    expect([...grande.ids].sort()).toEqual([...base.ids].sort());
  });

  it("una stella che si vede nel riquadro e fuori non ha posto per il nome entra nel riquadro (Friburgo)", () => {
    // tre stelle (l'Alsazia) e «Friburgo» lì accanto: fuori dal gruppo e dal
    // tratteggio, ma dentro la finestra del riquadro; attorno a tutti un'area
    // vietata, così sulla mappa grande nessun nome trova posto
    const g = [p("a", 300, 300, "Colmar"), p("b", 315, 300, "Eguisheim"), p("c", 307, 313, "Kientzheim")];
    const F = p("F", 326, 298, "Friburgo");
    const d = disponiEtichette([...g, F], { ...OPZ, vietate: [{ x: 270, y: 270, w: 90, h: 70 }] });
    expect(d.riquadri).toHaveLength(1);
    const r = d.riquadri[0];
    expect(r.ids).toContain("F");                                             // ospite del riquadro
    expect([...r.nomi, ...r.conFilo].map(e => e.id)).toContain("F");         // col nome DENTRO
    expect(d.conFilo.map(e => e.id)).not.toContain("F");                      // non fuori col filo
    // e il tratteggio lo abbraccia
    expect(F.x).toBeGreaterThan(r.zona.x); expect(F.x).toBeLessThan(r.zona.x + r.zona.w);
  });

  it("un filo sulla mappa grande non passa sotto un riquadro, quando c'è un'altra strada", () => {
    // scene da telefono cercate apposta fra 400: in queste, senza la regola,
    // un filo passa sotto un riquadro (come quello di Friburgo)
    const o: Opzioni = { ...OPZ, w: 390, h: 700, altezza: 13, raggioStella: 4, scostamento: 6, margine: 8 };
    let fili = 0;
    for (const scena of [22, 30, 84, 282, 299]) {
      let seme = scena;
      const caso = () => (seme = (seme * 16807) % 2147483647) / 2147483647;
      const punti: Punto[] = [];
      for (let g = 0; g < 7; g++) {
        const cx = 60 + caso() * 270, cy = 80 + caso() * 540;
        for (let i = 0; i < 5; i++) {
          // ⚠️ quest'ordine (nome, poi x, poi y) È la scena: cambiarlo cambia i punti
          const nome = "Nome" + "x".repeat(Math.floor(caso() * 8));
          const x = cx + (caso() - 0.5) * 40, y = cy + (caso() - 0.5) * 40;
          punti.push(p(`g${g}i${i}`, x, y, nome));
        }
      }
      const d = disponiEtichette(punti, o);
      for (const e of d.conFilo) {
        fili++;
        for (let k = 1; k < 20; k++) {
          const x = e.filo.x1 + ((e.filo.x2 - e.filo.x1) * k) / 20, y = e.filo.y1 + ((e.filo.y2 - e.filo.y1) * k) / 20;
          for (const r of d.riquadri) {
            const sotto = x > r.posto.x + 3 && x < r.posto.x + r.posto.w - 3 && y > r.posto.y + 3 && y < r.posto.y + r.posto.h - 3;
            expect(sotto, `scena ${scena}: il filo di ${e.id} passa sotto il riquadro ${r.numero}`).toBe(false);
          }
        }
      }
    }
    expect(fili).toBeGreaterThan(0);   // la prova ha visto dei fili
  });

  it("un nome del gruppo che dentro non entra allarga il riquadro, non finisce fuori (Friburgo, scena vera)", () => {
    const larghezze = new Map(PUNTI_SOFY.map(([, nome, , , w]) => [nome, w]));
    const d = disponiEtichette(PUNTI_SOFY.map(([id, nome, x, y]) => ({ id, nome, x, y })), {
      w: 878, h: 598, misura: n => larghezze.get(n) ?? n.length * 6, altezza: 13, raggioStella: 4, scostamento: 6,
      distanzaGrappolo: 15, margine: 8, linee: LINEE_SOFY.map(l => l.map(([x, y]) => ({ x, y }))),
      vietate: [{ x: 878 - 84, y: 598 - 56, w: 84, h: 56 }],
    });
    const alsazia = d.riquadri.find(r => r.ids.includes("26"))!;   // 26 = Colmar
    expect([...alsazia.nomi, ...alsazia.conFilo].map(e => e.nome)).toContain("Friburgo in Brisgovia");
    expect(d.conFilo.map(e => e.nome)).not.toContain("Friburgo in Brisgovia");
    expect(d.senzaPosto).toEqual([]);
    // nessuna stella piena senza il suo nome dentro un riquadro
    for (const r of d.riquadri) {
      const nominati = new Set([...r.nomi, ...r.conFilo].map(e => e.id));
      for (const s of r.stelle) expect(nominati.has(s.id), `riquadro ${r.numero}: stella ${s.id} senza nome`).toBe(true);
    }
  });

  describe("riquadri regolati a mano (riquadriFissi)", () => {
    const umbria = [p("Perugia", 300, 400), p("Assisi", 309, 403), p("Spello", 312, 409), p("Cortona", 293, 393), p("Montepulciano", 287, 401)];
    const lago = [p("Como", 150, 150), p("Bellagio", 156, 152), p("Lecco", 160, 158), p("Varenna", 154, 147)];
    const base = disponiEtichette([...umbria, ...lago], OPZ);
    const rU = base.riquadri.find(r => r.ids.includes("Perugia"))!;

    it("ogni riquadro ha la chiave del suo gruppo", () => {
      expect(rU.chiave).toBe([...umbria.map(q => q.id)].sort().join(","));
    });

    it("sta dove l'hai messo, grande quanto l'hai fatto, e il contenuto non scivola", () => {
      const posto = { x: 380, y: 520, w: rU.posto.w + 80, h: rU.posto.h + 40 };
      // allargato verso destra e in basso: il centro della zona resta dov'era nel riquadro
      const centro = { x: posto.x + (rU.centroPosto.x - rU.posto.x), y: posto.y + (rU.centroPosto.y - rU.posto.y) };
      const d = disponiEtichette([...umbria, ...lago], { ...OPZ, riquadriFissi: { [rU.chiave]: { posto, centro } } });
      const r = d.riquadri.find(q => q.chiave === rU.chiave)!;
      expect(r.posto).toEqual(posto);
      expect(r.centroPosto).toEqual(centro);
      expect(r.scala).toBeCloseTo(rU.scala, 6);
      for (const s of r.stelle) {
        const q = umbria.find(u => u.id === s.id)!;
        expect(s.x).toBeCloseTo(centro.x + (q.x - r.centroZona.x) * r.scala, 6);
      }
      expect([...r.nomi, ...r.conFilo].map(e => e.id).sort()).toEqual(umbria.map(q => q.id).sort());
      // e gli altri riquadri non gli finiscono sopra
      for (const altro of d.riquadri) if (altro !== r) expect(sovrapposti(altro.posto, r.posto)).toBe(false);
    });

    it("un nome della mappa grande che resta sotto un riquadro spostato va altrove, col filo", () => {
      const sola = p("Sola", 500, 200);
      const d0 = disponiEtichette([...umbria, sola], OPZ);
      const r0 = d0.riquadri[0];
      expect(d0.accanto.map(e => e.id)).toContain("Sola");
      // il riquadro spostato proprio sopra il nome di «Sola»
      const posto = { x: 470, y: 170, w: r0.posto.w, h: r0.posto.h };
      const centro = { x: posto.x + posto.w / 2, y: posto.y + posto.h / 2 };
      const d = disponiEtichette([...umbria, sola], { ...OPZ, riquadriFissi: { [r0.chiave]: { posto, centro } } });
      const e = [...d.accanto, ...d.conFilo].find(x => x.id === "Sola")!;
      expect(e).toBeDefined();
      expect(sovrapposti(e.box, posto)).toBe(false);
    });

    it("un riquadro fisso nel posto che un altro sceglierebbe: l'altro va altrove", () => {
      // il lago (piazzato DOPO l'Umbria, che è più grande) fissato dove l'Umbria andrebbe da sola
      const rL = base.riquadri.find(r => r.ids.includes("Como"))!;
      const posto = { ...rU.posto };
      const centro = { x: posto.x + posto.w / 2, y: posto.y + posto.h / 2 };
      const d = disponiEtichette([...umbria, ...lago], { ...OPZ, riquadriFissi: { [rL.chiave]: { posto, centro } } });
      const u = d.riquadri.find(r => r.chiave === rU.chiave)!;
      expect(u).toBeDefined();
      expect(sovrapposti(u.posto, posto)).toBe(false);
    });

    it("una chiave che non corrisponde a nessun gruppo non cambia niente", () => {
      const d = disponiEtichette([...umbria, ...lago], { ...OPZ, riquadriFissi: { "x,y": { posto: { x: 0, y: 0, w: 50, h: 50 }, centro: { x: 25, y: 25 } } } });
      expect(d.riquadri.map(r => r.posto)).toEqual(base.riquadri.map(r => r.posto));
    });
  });

  it("nessun punto: nessuna scritta", () => {
    expect(disponiEtichette([], OPZ)).toEqual({ accanto: [], conFilo: [], riquadri: [], senzaPosto: [] });
  });
});
