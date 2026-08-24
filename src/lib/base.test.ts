import { describe, it, expect } from "vitest";
import { riconosciBase, inserisciRientri, postoNoto, fermateDiViaggio } from "./base";

// La sequenza è quella del form: indice 0 = casa, l'ultima fermata = destinazione.
const MILANO = { lat: 45.4642, lon: 9.19 };
const FIRENZE = { lat: 43.7696, lon: 11.2558 };
const SIENA = { lat: 43.3188, lon: 11.3308 };
const PISA = { lat: 43.7228, lon: 10.4017 };
const SANGIMIGNANO = { lat: 43.4676, lon: 11.0431 };
const ROMA = { lat: 41.9028, lon: 12.4964 };

describe("riconosciBase — il posto dove si dorme si deduce dalle coordinate", () => {
  it("il viaggio in Toscana: base a Firenze, due gite", () => {
    const r = riconosciBase([MILANO, FIRENZE, SIENA, FIRENZE, PISA, FIRENZE]);
    expect(r).not.toBeNull();
    expect(r!.baseIdx).toBe(1);
    expect(r!.occorrenze).toEqual([1, 3, 5]);
    expect(r!.gite).toEqual([{ tappe: [2] }, { tappe: [4] }]);
    expect(r!.prima).toEqual([]);
    expect(r!.dopo).toEqual([]);
    expect(r!.destinazioneEBase).toBe(true);
  });

  it("un viaggio lineare non ha base", () => {
    expect(riconosciBase([MILANO, FIRENZE, SIENA, ROMA])).toBeNull();
  });

  it("una gita può avere più tappe", () => {
    const r = riconosciBase([MILANO, FIRENZE, SIENA, SANGIMIGNANO, FIRENZE]);
    expect(r!.gite).toEqual([{ tappe: [2, 3] }]);
  });

  it("la stessa città due volte DI FILA non è una base (è un refuso)", () => {
    expect(riconosciBase([MILANO, FIRENZE, FIRENZE, SIENA])).toBeNull();
  });

  it("ripassare da casa a metà viaggio non fa di casa una base", () => {
    // Milano → Torino → Milano → Roma: casa rivisitata, ma resta casa.
    const TORINO = { lat: 45.0703, lon: 7.6869 };
    expect(riconosciBase([MILANO, TORINO, MILANO, ROMA])).toBeNull();
  });

  it("il viaggio che prosegue dopo la base: la coda finisce in `dopo`", () => {
    const r = riconosciBase([MILANO, FIRENZE, SIENA, FIRENZE, ROMA]);
    expect(r!.occorrenze).toEqual([1, 3]);
    expect(r!.dopo).toEqual([4]);
    expect(r!.destinazioneEBase).toBe(false);
  });

  it("le tappe di avvicinamento finiscono in `prima`", () => {
    const BOLOGNA = { lat: 44.4949, lon: 11.3426 };
    const r = riconosciBase([MILANO, BOLOGNA, FIRENZE, SIENA, FIRENZE]);
    expect(r!.prima).toEqual([1]);
    expect(r!.baseIdx).toBe(2);
  });

  it("con due posti ripetuti vince il più rivisitato", () => {
    // Firenze ×3, Siena ×2 → base Firenze.
    const r = riconosciBase([MILANO, FIRENZE, SIENA, FIRENZE, SIENA, FIRENZE]);
    expect(r!.baseIdx).toBe(1);
    expect(r!.occorrenze).toEqual([1, 3, 5]);
  });

  it("la tolleranza è da città, non da via: 200 m sono lo stesso posto", () => {
    const firenzeCentro = { lat: 43.7696, lon: 11.2558 };
    const firenzeStazione = { lat: 43.7710, lon: 11.2540 };   // ~200 m
    const r = riconosciBase([MILANO, firenzeCentro, SIENA, firenzeStazione]);
    expect(r).not.toBeNull();
    expect(r!.occorrenze).toEqual([1, 3]);
  });

  it("fermate senza coordinate non mandano in tilt il riconoscimento", () => {
    const r = riconosciBase([MILANO, FIRENZE, { lat: null, lon: null }, FIRENZE]);
    expect(r).not.toBeNull();                      // la gita è la tappa senza coordinate
    expect(r!.gite).toEqual([{ tappe: [2] }]);
  });

  it("meno di quattro fermate: mai una base", () => {
    expect(riconosciBase([MILANO, FIRENZE, FIRENZE])).toBeNull();
    expect(riconosciBase([MILANO, FIRENZE])).toBeNull();
  });
});

describe("inserisciRientri — il ponte fra un itinerario e la sua base", () => {
  // Il caso vero di Stefano: Milano → Sofia → Rila → Plovdiv, dove Sofia è la
  // base ma non c'è nessun rientro scritto, quindi l'app lo legge come
  // itinerante. Un tocco sulla tenda scrive i rientri.
  type T = { nome: string; lat: number; lon: number; id?: string };
  const SOFIA = { nome: "Sofia", lat: 42.6977, lon: 23.3219 };
  const RILA = { nome: "Rila", lat: 42.1333, lon: 23.34 };
  const PLOVDIV = { nome: "Plovdiv", lat: 42.1354, lon: 24.7453 };
  let seq = 0;
  const copia = (b: T): T => ({ ...b, id: "copia" + (++seq) });
  const nomi = (v: T[]) => v.map(x => x.nome);

  it("appende un rientro dopo ogni tappa successiva alla base", () => {
    seq = 0;
    const v: T[] = [SOFIA, RILA, PLOVDIV];
    expect(nomi(inserisciRientri(v, 0, copia)))
      .toEqual(["Sofia", "Rila", "Sofia", "Plovdiv", "Sofia"]);
  });

  it("ogni rientro è una copia con un id suo (le chiavi del disegno)", () => {
    seq = 0;
    const out = inserisciRientri<T>([SOFIA, RILA, PLOVDIV], 0, copia);
    const ids = out.slice(1).filter(x => x.nome === "Sofia").map(x => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["copia1", "copia2"]);
  });

  it("la base a metà itinerario lascia in pace quello che viene prima", () => {
    seq = 0;
    expect(nomi(inserisciRientri<T>([{ nome: "Belgrado", lat: 44.8, lon: 20.46 }, SOFIA, RILA], 1, copia)))
      .toEqual(["Belgrado", "Sofia", "Rila", "Sofia"]);
  });

  it("l'ultima tappa non può essere base: non c'è niente da appendere", () => {
    seq = 0;
    const v = [SOFIA, RILA, PLOVDIV];
    expect(inserisciRientri(v, 2, copia)).toBe(v);
  });

  it("indice fuori intervallo: itinerario intatto", () => {
    const v = [SOFIA, RILA];
    expect(inserisciRientri(v, -1, copia)).toBe(v);
    expect(inserisciRientri(v, 9, copia)).toBe(v);
  });

  it("una base senza coordinate non si può riconoscere: niente rientri", () => {
    const v = [{ nome: "Ignota" } as T, RILA];
    expect(inserisciRientri(v, 0, copia)).toBe(v);
  });

  // Toccare due volte la tenda non deve raddoppiare i rientri, e un itinerario
  // già scritto a mano non va gonfiato.
  it("i rientri già presenti non si duplicano", () => {
    seq = 0;
    const gia: T[] = [SOFIA, RILA, SOFIA, PLOVDIV, SOFIA];
    expect(nomi(inserisciRientri(gia, 0, copia))).toEqual(nomi(gia));
  });

  it("e il risultato è davvero riconosciuto come base", () => {
    seq = 0;
    const casa = { nome: "Milano", lat: 45.4642, lon: 9.19 };
    const conRientri = inserisciRientri<T>([SOFIA, RILA, PLOVDIV], 0, copia);
    const b = riconosciBase([casa, ...conRientri]);
    expect(b).not.toBeNull();
    expect(b!.gite).toHaveLength(2);            // Rila e Plovdiv
    expect(b!.destinazioneEBase).toBe(true);    // si finisce alla base
  });
});

describe("l'isola nulla: (0,0) non è un posto", () => {
  // Il form scrive `lat: w.lat ?? 0` per una tappa senza coordinate, quindi
  // due tappe sconosciute finiscono entrambe a (0,0) — nel Golfo di Guinea.
  // Prima si riconoscevano come "lo stesso posto" e inventavano una base che
  // non è mai esistita: il viaggio si vestiva da "tappa fissa" e il biglietto
  // collassava fermate vere. Trovato revisionando la tenda.
  it("postoNoto rifiuta (0,0), il nulla e i non-numeri", () => {
    expect(postoNoto({ lat: 45.46, lon: 9.19 })).toBe(true);
    expect(postoNoto({ lat: 0, lon: 0 })).toBe(false);
    expect(postoNoto({ lat: null, lon: null })).toBe(false);
    expect(postoNoto({})).toBe(false);
    expect(postoNoto({ lat: NaN, lon: NaN })).toBe(false);
    // ma una vera coordinata a zero su UN solo asse resta valida
    expect(postoNoto({ lat: 0, lon: 9.19 })).toBe(true);
    expect(postoNoto({ lat: 51.48, lon: 0 })).toBe(true);
  });

  it("due tappe sconosciute NON inventano una base", () => {
    // casa → ignota(0,0) → Rila → ignota(0,0): senza la guardia le due ignote
    // erano "la stessa" e bastavano a far scattare la base.
    expect(riconosciBase([
      { lat: 45.46, lon: 9.19 },
      { lat: 0, lon: 0 },
      { lat: 42.13, lon: 23.34 },
      { lat: 0, lon: 0 },
    ])).toBeNull();
  });

  it("e la tenda su una tappa senza coordinate non fa niente", () => {
    const tappe = [{ lat: 0, lon: 0 }, { lat: 42.13, lon: 23.34 }, { lat: 42.14, lon: 24.75 }];
    expect(inserisciRientri(tappe, 0, b => ({ ...b }))).toBe(tappe);
  });
});

describe("fermateDiViaggio — una sola definizione della sequenza", () => {
  it("casa, tappe, destinazione in quest'ordine", () => {
    expect(fermateDiViaggio({
      home_latitude: 45.46, home_longitude: 9.19,
      waypoints: [{ city: "Rila", country: "BG", transport_mode: "car", lat: 42.13, lon: 23.34 }],
      latitude: 42.14, longitude: 24.75,
    } as never)).toEqual([
      { lat: 45.46, lon: 9.19 },
      { lat: 42.13, lon: 23.34 },
      { lat: 42.14, lon: 24.75 },
    ]);
  });

  it("senza il campo tappe non si inciampa", () => {
    expect(fermateDiViaggio({
      home_latitude: null, home_longitude: null, latitude: 1, longitude: 2,
    } as never)).toHaveLength(2);
  });
});
