import { describe, it, expect } from "vitest";
import { paesiVisitati, centroPaese, bboxDiPoligoni, paeseDelPunto, paeseVisibile, paeseVisibileDiViaggio, paeseVisibileDiTappa, type PaeseMondo } from "./paesi";
import type { Trip } from "./storage";

/** Quadrato [minLon,minLat]-[maxLon,maxLat] come paese finto. */
const quadrato = (id: string, name: string, a: number, b: number, c: number, d: number): PaeseMondo => {
  const anello = [[a, b], [c, b], [c, d], [a, d], [a, b]];
  const polygons = [[anello]];
  return { id, name, polygons, bbox: bboxDiPoligoni(polygons), geometry: { type: "Polygon", coordinates: [anello] } };
};

// Gli id sono quelli VERI del world-atlas: il codice ISO 3166-1 numerico.
// Con id inventati ("it") l'indice per codice non troverebbe niente e i test
// passerebbero senza provare nulla.
const ITALIA = quadrato("380", "Italy", 6, 36, 19, 47);
const AUSTRIA = quadrato("040", "Austria", 9, 46, 17, 49);
const SVEZIA = quadrato("752", "Sweden", 11, 55, 24, 69);

const viaggio = (over: Partial<Trip>): Trip => ({
  id: "t", created_at: "2026-01-01T00:00:00.000Z", title: "T", city: "C",
  country: "Paese", country_code: "IT", trip_date: "2026-01-01", date_end: null,
  latitude: 41.9, longitude: 12.5, home_latitude: 45.46, home_longitude: 9.19,
  home_label: "Milano", notes: null, transport_mode: "car", waypoints: [],
  ...over,
} as Trip);

describe("paesiVisitati — il paese lo dice il VIAGGIO, la geometria lo disegna", () => {
  it("conta anche i paesi delle TAPPE, non solo la destinazione", () => {
    // Milano → Vienna passando per Trieste: l'Austria è l'arrivo, ma l'Italia
    // è stata attraversata e va contata.
    const t = viaggio({
      latitude: 48.2, longitude: 16.37, country: "Austria", country_code: "AT",
      waypoints: [{ id: "w", city: "Trieste", country: "Italia", country_code: "IT", lat: 45.65, lon: 13.78, transport_mode: "car" }],
    } as Partial<Trip>);
    const visitati = paesiVisitati([t], [ITALIA, AUSTRIA, SVEZIA]);
    expect([...visitati.keys()].sort()).toEqual(["AT", "IT"]);
  });

  it("ogni paese porta la propria bandiera, non quella della destinazione", () => {
    const t = viaggio({
      latitude: 48.2, longitude: 16.37, country: "Austria", country_code: "AT",
      waypoints: [{ id: "w", city: "Roma", country: "Italia", country_code: "IT", lat: 41.9, lon: 12.5, transport_mode: "car" }],
    } as Partial<Trip>);
    const visitati = paesiVisitati([t], [ITALIA, AUSTRIA]);
    expect(visitati.get("IT")?.code).toBe("IT");
    expect(visitati.get("AT")?.code).toBe("AT");
  });

  it("il confine si cerca per CODICE: niente più deduzioni dalla posizione", () => {
    // Coordinate palesemente sbagliate (in mezzo all'Atlantico) ma paese
    // dichiarato: il viaggio in Italia resta un viaggio in Italia, e il
    // confine italiano viene colorato lo stesso. Prima spariva.
    const t = viaggio({ country: "Italia", country_code: "IT", latitude: 0, longitude: -30 });
    const v = paesiVisitati([t], [ITALIA]);
    expect(v.get("IT")?.paese?.id).toBe("380");
  });

  it("senza codice paese si torna a chiedere alla geometria (dati vecchi)", () => {
    const t = viaggio({ country: "", country_code: "", latitude: 41.9, longitude: 12.5 });
    expect([...paesiVisitati([t], [ITALIA]).keys()]).toEqual(["IT"]);
  });

  it("senza codice E fuori da ogni confine non inventa nulla", () => {
    const t = viaggio({ country: "", country_code: "", latitude: 0, longitude: -30 });
    expect(paesiVisitati([t], [ITALIA]).size).toBe(0);
  });

  it("senza paesi caricati non esplode", () => {
    expect(paesiVisitati([viaggio({})], []).size).toBe(0);
  });

  it("lo stesso paese visitato due volte compare una volta sola", () => {
    const a = viaggio({ id: "a", country_code: "IT", latitude: 41.9, longitude: 12.5 });
    const b = viaggio({ id: "b", country_code: "IT", latitude: 45.4, longitude: 9.2 });
    expect(paesiVisitati([a, b], [ITALIA]).size).toBe(1);
  });
});

describe("centroPaese", () => {
  it("usa il poligono PIÙ GRANDE, non la media di tutti", () => {
    // Francia + un'isola lontana: il centro deve restare sulla terraferma,
    // non finire a metà strada in mezzo all'oceano.
    const grande = [[0, 44], [1, 44], [1, 45], [0.5, 45.5], [0, 45], [0, 44]];
    const isola = [[-60, 3], [-59, 3], [-59, 4], [-60, 3]];
    const polygons = [[grande], [isola]];
    const p: PaeseMondo = {
      id: "fr", name: "France", polygons, bbox: bboxDiPoligoni(polygons),
      geometry: { type: "MultiPolygon", coordinates: [[grande], [isola]] },
    };
    const c = centroPaese(p)!;
    expect(c[0]).toBeGreaterThan(0);
    expect(c[0]).toBeLessThan(1);
    expect(c[1]).toBeGreaterThan(43);
  });

  it("un paese senza geometria utile non dà un centro finto", () => {
    expect(centroPaese({ id: "x", name: "X", polygons: [], bbox: [0, 0, 0, 0] })).toBeNull();
  });
});

describe("paeseDelPunto — la regola del poligono più piccolo, condivisa", () => {
  it("fra due paesi sovrapposti vince il più piccolo (caso Russia/Lapponia)", () => {
    // il "gigante" simula il poligono russo che avvolge il mondo
    const gigante = quadrato("ru", "Russia", -180, 30, 180, 80);
    expect(paeseDelPunto(18.8, 68.3, [gigante, SVEZIA])?.id).toBe("752");
    // ...e l'ordine dell'elenco non deve contare
    expect(paeseDelPunto(18.8, 68.3, [SVEZIA, gigante])?.id).toBe("752");
  });
});

/**
 * Le quattro nazioni del Regno Unito contano come paesi a sé (richiesta di
 * Stefano, 2026-08-21: "la Scozia dovrebbe essere a parte"). Il suo viaggio
 * "Scozia" ha davvero country "Regno Unito" + region_details [GB-SCT].
 */
describe("paeseVisibile — Scozia, Galles e le altre nazioni UK", () => {
  it("il viaggio con region GB-SCT diventa Scozia, con la sua bandiera", () => {
    expect(paeseVisibileDiViaggio({
      country: "Regno Unito", country_code: "GB",
      region: "Scozia", region_details: [{ name: "Scozia", code: "GB-SCT" }],
    })).toEqual({ nome: "Scozia", codice: "GB-SCT" });
  });

  it("riconosce anche le altre tre", () => {
    const naz = (code: string) => paeseVisibileDiViaggio({
      country: "Regno Unito", country_code: "GB", region_details: [{ name: "x", code }],
    }).nome;
    expect(naz("GB-WLS")).toBe("Galles");
    expect(naz("GB-ENG")).toBe("Inghilterra");
    expect(naz("GB-NIR")).toBe("Irlanda del Nord");
  });

  it("senza codice ISO ricade sul NOME della regione (viaggi vecchi)", () => {
    expect(paeseVisibile("Regno Unito", "GB", "Scozia", null).nome).toBe("Scozia");
    expect(paeseVisibile("Regno Unito", "GB", "Scotland", null).nome).toBe("Scozia");
  });

  it("un viaggio britannico senza regione resta Regno Unito: niente invenzioni", () => {
    expect(paeseVisibileDiViaggio({ country: "Regno Unito", country_code: "GB" }))
      .toEqual({ nome: "Regno Unito", codice: "GB" });
  });

  it("gli altri paesi non vengono toccati", () => {
    expect(paeseVisibileDiViaggio({
      country: "Italia", country_code: "IT",
      region_details: [{ name: "Toscana", code: "IT-52" }],
    })).toEqual({ nome: "Italia", codice: "IT" });
  });
});

describe("paeseVisibileDiTappa — le tappe non gonfiano il conteggio", () => {
  const SCOZIA = { nome: "Scozia", codice: "GB-SCT" };

  it("una tappa britannica di un viaggio scozzese conta come Scozia", () => {
    // Il caso vero: viaggio "Scozia" (Pitlochry) con tappe Edimburgo e Fort
    // Augustus, entrambe con country_code GB e senza regione salvata.
    expect(paeseVisibileDiTappa({ country: "Regno Unito", country_code: "GB" }, SCOZIA)).toEqual(SCOZIA);
  });

  it("una tappa in un ALTRO paese resta sé stessa", () => {
    expect(paeseVisibileDiTappa({ country: "Francia", country_code: "FR" }, SCOZIA))
      .toEqual({ nome: "Francia", codice: "FR" });
  });

  it("se il viaggio non è in una nazione UK non eredita niente", () => {
    expect(paeseVisibileDiTappa({ country: "Regno Unito", country_code: "GB" }, { nome: "Italia", codice: "IT" }))
      .toEqual({ nome: "Regno Unito", codice: "GB" });
  });
});

describe("centroPaese — l'antimeridiano non sposta la bandiera", () => {
  it("un paese a cavallo di ±180° tiene il centro nel Pacifico, non in Africa", () => {
    // Le Figi nel world-atlas hanno un anello che va da -180 a +180: la media
    // aritmetica delle longitudini dava ~16° E, cioè l'Angola.
    const anello = [[179.5, -16], [-179.5, -16], [-179.6, -17], [179.4, -17], [179.5, -16]];
    const polygons = [[anello]];
    const c = centroPaese({ id: "fj", name: "Fiji", polygons, bbox: bboxDiPoligoni(polygons) })!;
    expect(Math.abs(c[0])).toBeGreaterThan(170);   // vicino al 180°, da una parte o dall'altra
    expect(c[1]).toBeCloseTo(-16.4, 1);
  });

  it("i paesi normali non cambiano di una virgola", () => {
    const anello = [[6, 36], [19, 36], [19, 47], [6, 47], [6, 36]];
    const polygons = [[anello]];
    const c = centroPaese({ id: "it", name: "Italy", polygons, bbox: bboxDiPoligoni(polygons) })!;
    expect(c[0]).toBeCloseTo(11.2, 1);   // come la media aritmetica: sui paesi normali le due coincidono
    expect(c[1]).toBeCloseTo(40.6, 0);
  });
});

describe("paesiVisitati — il nome da mostrare è in ITALIANO", () => {
  it("usa il nome del viaggio, non quello inglese del world-atlas", () => {
    // il quadrato si chiama "Italy" (world-atlas), il viaggio dice "Italia"
    const t = viaggio({ country: "Italia", country_code: "IT" });
    const v = paesiVisitati([t], [ITALIA]);
    expect(v.get("IT")?.nome).toBe("Italia");
  });

  it("le nazioni UK tengono il NOSTRO nome anche se il viaggio dice Regno Unito", () => {
    const scozia: PaeseMondo = { ...quadrato("GB-SCT", "Scozia", -8, 54.6, 0, 61) };
    // il viaggio dichiara GB, ma la REGIONE dice Scozia: vince la nazione
    const t = viaggio({
      country: "Regno Unito", country_code: "GB", latitude: 56.7, longitude: -3.7,
      region: "Scozia", region_details: [{ name: "Scozia", code: "GB-SCT" }],
    } as Partial<Trip>);
    const v = paesiVisitati([t], [scozia]);
    expect(v.get("GB-SCT")?.nome).toBe("Scozia");
    expect(v.get("GB-SCT")?.code).toBe("GB-SCT");
  });

  it("senza nome nel viaggio ricade su quello dell'atlante", () => {
    const t = viaggio({ country: "", country_code: "IT" });
    const v = paesiVisitati([t], [ITALIA]);
    expect(v.get("IT")?.nome).toBe("Italy");
  });
});

/**
 * Il caso Vaticano (2026-08-21, "è un bug! deve disegnarli tutti"): nel
 * world-atlas il poligono del Vaticano è nel posto sbagliato — 12,43° invece
 * di 12,45° — e nemmeno il suo centro ufficiale ci cade dentro. Il viaggio
 * finiva quindi attribuito all'Italia e il paese spariva dal globo.
 */
describe("paesiVisitati — i micro-stati hanno comunque la loro bandiera", () => {
  // Il caso VERO di Stefano: tre viaggi in Italia più uno in Vaticano. Il
  // punto vaticano cade dentro il poligono italiano (il poligono del Vaticano
  // nel world-atlas è nel posto sbagliato), e prima si portava via nome e
  // bandiera dell'Italia — o spariva del tutto.
  it("Vaticano e Italia convivono: l'Italia resta italiana, il Vaticano ha la sua bandiera", () => {
    const trips = [
      viaggio({ id: "a", city: "Trieste", country: "Italia", country_code: "IT", latitude: 45.65, longitude: 13.78 }),
      viaggio({ id: "b", city: "Ascoli", country: "Italia", country_code: "IT", latitude: 42.85, longitude: 13.57 }),
      viaggio({ id: "c", city: "Città del Vaticano", country: "Città del Vaticano", country_code: "VA",
        latitude: 41.90, longitude: 12.45 }),
    ];
    const v = [...paesiVisitati(trips, [ITALIA]).values()];
    const italia = v.find(x => x.paese);
    const vaticano = v.find(x => x.code === "VA");

    expect(italia!.code).toBe("IT");                  // la maggioranza vince
    expect(italia!.nome).toBe("Italia");
    expect(vaticano).toBeDefined();
    expect(vaticano!.paese).toBeNull();               // nessun poligono: giusto così
    expect(vaticano!.nome).toBe("Città del Vaticano");
    expect(vaticano!.posizione).toEqual([12.45, 41.90]);   // bandiera sul punto
    expect(v.length).toBe(2);
  });

  it("l'ordine dei viaggi non cambia chi dà nome e bandiera al paese", () => {
    const vat = viaggio({ id: "c", country: "Città del Vaticano", country_code: "VA", latitude: 41.90, longitude: 12.45 });
    const it1 = viaggio({ id: "a", country: "Italia", country_code: "IT", latitude: 45.65, longitude: 13.78 });
    const it2 = viaggio({ id: "b", country: "Italia", country_code: "IT", latitude: 42.85, longitude: 13.57 });
    for (const ordine of [[vat, it1, it2], [it1, vat, it2], [it1, it2, vat]]) {
      const v = [...paesiVisitati(ordine, [ITALIA]).values()];
      expect(v.find(x => x.paese)!.code).toBe("IT");
    }
  });

  it("il paese già colorato non riceve una seconda bandiera", () => {
    const roma = viaggio({ id: "a", country: "Italia", country_code: "IT", latitude: 41.9, longitude: 12.5 });
    const v = [...paesiVisitati([roma], [ITALIA]).values()];
    expect(v.length).toBe(1);
  });

  it("coordinate sbagliate non cancellano il paese dichiarato", () => {
    // Prima un punto fuori dai confini spariva dal globo. Ora il paese lo dice
    // il viaggio: l'Italia resta, e il suo confine viene colorato.
    const t = viaggio({ country: "Italia", country_code: "IT", latitude: 0, longitude: -30 });
    const v = paesiVisitati([t], [ITALIA]);
    expect(v.size).toBe(1);
    expect(v.get("IT")?.paese?.id).toBe("380");
  });
});

describe("paesiVisitati — niente doppioni di bandiera dentro il Regno Unito", () => {
  it("un viaggio in Scozia mostra la bandiera scozzese, NON anche l'union jack", () => {
    // Il viaggio dichiara country_code "GB", ma il poligono è quello scozzese:
    // senza guardia comparivano due bandiere per lo stesso viaggio.
    const scozia = quadrato("GB-SCT", "Scozia", -8, 54.6, 0, 61);
    const t = viaggio({
      country: "Regno Unito", country_code: "GB", latitude: 56.7, longitude: -3.7,
      region: "Scozia", region_details: [{ name: "Scozia", code: "GB-SCT" }],
    } as Partial<Trip>);
    const v = [...paesiVisitati([t], [scozia]).values()];
    expect(v.map(x => x.code)).toEqual(["GB-SCT"]);
  });
});

/**
 * Verificato sul dataset vero, punto per punto: il Vaticano cade dentro
 * l'ITALIA (il suo poligono è spostato) e Monaco non cade da NESSUNA parte
 * (poligono impreciso, e la Francia ha il buco al posto giusto). Sono gli
 * unici due così: San Marino, Liechtenstein, Andorra, Malta e Singapore col
 * dataset 50m si trovano da soli.
 */
describe("paesiVisitati — i due casi che la geometria non sa gestire", () => {
  it("Monaco compare anche se il suo punto non cade in nessun paese", () => {
    const t = viaggio({ city: "Monaco", country: "Monaco", country_code: "MC", latitude: 43.7384, longitude: 7.4246 });
    const v = [...paesiVisitati([t], [ITALIA, AUSTRIA]).values()];
    const mc = v.find(x => x.code === "MC");
    expect(mc).toBeDefined();
    expect(mc!.paese).toBeNull();
    expect(mc!.posizione).toEqual([7.4246, 43.7384]);
  });

  it("un viaggio SOLO in Vaticano non colora l'Italia", () => {
    // prima lo faceva: il punto cade nel poligono italiano
    const t = viaggio({ country: "Città del Vaticano", country_code: "VA", latitude: 41.9029, longitude: 12.4534 });
    const v = [...paesiVisitati([t], [ITALIA]).values()];
    expect(v.length).toBe(1);
    expect(v[0].code).toBe("VA");
    expect(v[0].paese).toBeNull();     // nessun poligono, solo la bandiera
  });

  it("Vaticano e Italia insieme: l'Italia resta italiana e colorata", () => {
    const trips = [
      viaggio({ id: "a", country: "Italia", country_code: "IT", latitude: 41.9028, longitude: 12.4964 }),
      viaggio({ id: "b", country: "Città del Vaticano", country_code: "VA", latitude: 41.9029, longitude: 12.4534 }),
    ];
    const v = [...paesiVisitati(trips, [ITALIA]).values()];
    const italia = v.find(x => x.paese);
    expect(italia!.code).toBe("IT");
    expect(italia!.nome).toBe("Italia");
    expect(v.find(x => x.code === "VA")).toBeDefined();
    expect(v.length).toBe(2);
  });
});
