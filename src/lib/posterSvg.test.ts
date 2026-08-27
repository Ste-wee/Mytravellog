import { describe, it, expect } from "vitest";
import { buildPosterSvg, routeBounds, unwrapNear, unwrapPath, unwrapSegments, mercY, CONFINI } from "./posterSvg";

const INPUT = {
  routeCoords: [[9.19, 45.46], [11.39, 47.27], [13.78, 45.65]] as [number, number][],
  stops: [
    { lon: 9.19, lat: 45.46, label: "Milano" },
    { lon: 11.39, lat: 47.27, label: "Innsbruck" },
    { lon: 13.78, lat: 45.65, label: "Trieste" },
  ],
  borders: [[[8, 44], [14, 44], [14, 48], [8, 48], [8, 44]]] as [number, number][][],
  title: "Primo viaggio insieme",
  dateLabel: "23 lug 2026 → 30 lug 2026",
  stats: "1315 km · 6 tappe",
};

describe("buildPosterSvg — master di stampa SVG", () => {
  const svg = buildPosterSvg(INPUT);

  it("è un SVG con fondo nero", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('fill="#000000"');
  });

  it("ha i livelli separati confini/tracciato/stelle/etichette/titolo", () => {
    for (const id of ["confini", "tracciato", "stelle", "etichette", "titolo"]) {
      expect(svg).toContain(`id="${id}"`);
    }
  });

  it("porta la firma 'By' col logo incorporato (xlink) in basso a destra", () => {
    expect(svg).toContain('id="firma"');
    expect(svg).toContain(">By<");
    expect(svg).toContain('xlink:href="data:image/png;base64,');
    expect(svg).toContain('xmlns:xlink=');
  });

  it("marca i nodi-stella come punti-LED (data-led) — uno per tappa", () => {
    const matches = svg.match(/data-led="1"/g) ?? [];
    expect(matches.length).toBe(INPUT.stops.length);
  });

  it("include i nomi delle tappe e il titolo", () => {
    expect(svg).toContain("Milano");
    expect(svg).toContain("Trieste");
    expect(svg).toContain("Primo viaggio insieme");
  });

  it("disegna il tracciato come un solo path (M…L…)", () => {
    expect(svg).toMatch(/<g id="tracciato"[^>]*><path d="M[\d.,L-]+"\/><\/g>/);
  });

  it("esce dai confini se non forniti (rotta+stelle comunque presenti)", () => {
    const noBorders = buildPosterSvg({ ...INPUT, borders: [] });
    expect(noBorders).toContain('id="tracciato"');
    expect(noBorders).toContain('id="confini"'); // gruppo presente ma vuoto
  });

  it("la didascalia sta SOTTO l'area mappa: nessuna stella la oltrepassa", () => {
    // titolo (grande, grassetto) centrato a x=W/2=800
    const m = svg.match(/<text x="800" y="([\d.]+)"[^>]*font-weight="bold"[^>]*>/);
    expect(m).toBeTruthy();
    const titleY = parseFloat(m![1]);
    const cys = Array.from(svg.matchAll(/data-led="1" cx="[\d.]+" cy="([\d.]+)"/g)).map(x => parseFloat(x[1]));
    expect(cys.length).toBe(INPUT.stops.length);
    for (const cy of cys) expect(cy).toBeLessThan(titleY);
  });

  it("escapa i caratteri XML pericolosi nei testi", () => {
    const s = buildPosterSvg({ ...INPUT, title: 'A & <B> "C"' });
    expect(s).toContain("A &amp; &lt;B&gt;");
    expect(s).not.toContain("<B>");
  });

  it("con hideLabels non disegna i nomi delle tappe (Mappa della vita)", () => {
    const s = buildPosterSvg({ ...INPUT, hideLabels: true });
    expect(s).not.toContain("Milano");
    expect(s).not.toContain("Trieste");
    // le stelle-LED restano (una per tappa)
    expect((s.match(/data-led="1"/g) ?? []).length).toBe(INPUT.stops.length);
  });

  it("la casa ripetuta (Mappa della vita) produce UNA sola stella-LED", () => {
    // buildFlightPath reinserisce la casa per ogni viaggio: senza dedup l'hub
    // aveva N aloni sovrapposti e N marcatori data-led identici nel master.
    const s = buildPosterSvg({
      routeSegments: [
        [[9.19, 45.46], [2.35, 48.86]],
        [[9.19, 45.46], [12.5, 41.9]],
      ],
      stops: [
        { lon: 9.19, lat: 45.46, label: "Milano" },
        { lon: 2.35, lat: 48.86, label: "Parigi" },
        { lon: 9.19, lat: 45.46, label: "Milano" }, // casa ripetuta dal 2° viaggio
        { lon: 12.5, lat: 41.9, label: "Roma" },
      ],
      title: "Vita",
      hideLabels: true,
    });
    expect((s.match(/data-led="1"/g) ?? []).length).toBe(3); // Milano UNA volta
  });

  it("con routeSegments disegna un path per viaggio (Mappa della vita)", () => {
    const s = buildPosterSvg({
      routeSegments: [
        [[9.19, 45.46], [2.35, 48.86]],
        [[9.19, 45.46], [2.17, 41.39]],
      ],
      stops: [
        { lon: 9.19, lat: 45.46, label: "Milano" },
        { lon: 2.35, lat: 48.86, label: "Parigi" },
        { lon: 2.17, lat: 41.39, label: "Barcellona" },
      ],
      title: "La mappa della mia vita",
    });
    const g = s.match(/<g id="tracciato"[^>]*>(.*?)<\/g>/)?.[1] ?? "";
    expect((g.match(/<path /g) ?? []).length).toBe(2);
    expect(s).toContain("La mappa della mia vita");
  });
});




describe("antimeridiano — unwrapNear / unwrapPath", () => {
  it("porta la longitudine entro ±180° dall'ancora (Tokyo→Los Angeles)", () => {
    expect(unwrapNear(-118, 139)).toBe(242); // via Pacifico, non via Europa
    expect(unwrapNear(139, 139)).toBe(139);  // già vicina: intatta
    expect(unwrapNear(12, 9)).toBe(12);      // caso normale europeo: intatto
    expect(unwrapNear(170, -170)).toBe(-190);
  });

  it("non cicla né sporca su valori non finiti", () => {
    expect(unwrapNear(Infinity, 0)).toBe(Infinity);
    expect(unwrapNear(NaN, 0)).toBeNaN();
    expect(unwrapNear(10, NaN)).toBe(10);
  });

  it("srotola il percorso: ogni punto prende l'arco più corto dal precedente", () => {
    const p = unwrapPath([[139, 35], [-157, 21], [-118, 34]]); // Tokyo→Honolulu→LA
    expect(p.map(c => c[0])).toEqual([139, 203, 242]);          // monotono verso est
    expect(p.map(c => c[1])).toEqual([35, 21, 34]);             // latitudini intatte
  });

  it("lascia intatto un percorso che non scavalca l'antimeridiano", () => {
    const pts: [number, number][] = [[9.19, 45.46], [11.39, 47.27], [13.78, 45.65]];
    expect(unwrapPath(pts)).toEqual(pts);
    expect(unwrapPath([[9, 45]])).toEqual([[9, 45]]); // percorso di un punto
  });

  it("unwrapSegments: più segmenti restano in un'unica finestra (lifeMap)", () => {
    // Auckland→Samoa (srotola a 188) e poi LA→Hawaii: il secondo segmento deve
    // ripartire vicino a 188 (242, 205), non nella sua finestra raw (-118, -155).
    const out = unwrapSegments([
      [[174, -37], [-172, -13]],
      [[-118, 34], [-155, 20]],
    ]);
    expect(out[0].map(c => c[0])).toEqual([174, 188]);
    expect(out[1].map(c => c[0])).toEqual([242, 205]);
    // idempotente: ri-applicata non cambia nulla
    expect(unwrapSegments(out)).toEqual(out);
  });
});

describe("buildPosterSvg — antimeridiano", () => {
  // Tokyo → Honolulu → Los Angeles: la tappa INTERMEDIA è il giudice. Srotolando
  // finisce in mezzo (x crescente); col vecchio min/max su [-180,180] Honolulu
  // (-157) finiva all'estremo sinistro e la rotta attraversava tutta la mappa.
  const pacifico = {
    routeCoords: [[139, 35], [-157, 21], [-118, 34]] as [number, number][],
    stops: [
      { lon: 139, lat: 35, label: "Tokyo" },
      { lon: -157, lat: 21, label: "Honolulu" },
      { lon: -118, lat: 34, label: "Los Angeles" },
    ],
    title: "Trans-Pacifico",
  };

  it("le tappe restano nell'ordine del viaggio (x crescente), non ai due capi", () => {
    const svg = buildPosterSvg(pacifico);
    const xs = Array.from(svg.matchAll(/data-led="1" cx="([\d.]+)"/g)).map(m => parseFloat(m[1]));
    expect(xs).toHaveLength(3);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });

  it("multi-tappa OLTRE 180° cumulativi dall'Europa: stelle in catena con la linea", () => {
    // Il caso che l'ancora unica NON reggeva: Roma→Tokyo→Honolulu→LA supera i
    // 180° dal primo punto, e Honolulu (raw -157, a soli 170° da Roma) restava
    // nella finestra sbagliata → stella a 360° dalla linea, poster schiacciato.
    const svg = buildPosterSvg({
      routeCoords: [[12.5, 42], [139, 35], [-157, 21], [-118, 34]],
      stops: [
        { lon: 12.5, lat: 42, label: "Roma" },
        { lon: 139, lat: 35, label: "Tokyo" },
        { lon: -157, lat: 21, label: "Honolulu" },
        { lon: -118, lat: 34, label: "Los Angeles" },
      ],
      title: "Giro lungo",
    });
    const xs = Array.from(svg.matchAll(/data-led="1" cx="([\d.]+)"/g)).map(m => parseFloat(m[1]));
    expect(xs).toHaveLength(4);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]); // ordine del viaggio
    for (const x of xs) { expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(1600); } // tutte in tela
    // e i confini USA finiscono sul lato americano (destro), non un giro a ovest
    const usa: [number, number][] = [[-125, 32], [-115, 32], [-115, 42], [-125, 42], [-125, 32]];
    const withBorders = buildPosterSvg({
      routeCoords: [[12.5, 42], [139, 35], [-157, 21], [-118, 34]],
      stops: [{ lon: 12.5, lat: 42, label: "Roma" }, { lon: -118, lat: 34, label: "LA" }],
      borders: [usa], title: "Giro lungo",
    });
    const m = withBorders.match(/<g id="confini"[^>]*><path d="M([-\d.]+),/);
    expect(m).toBeTruthy();
    expect(parseFloat(m![1])).toBeGreaterThan(800); // metà destra della tela
  });

  it("Antartide (lat -90) non invalida il path dei confini con -Infinity", () => {
    const antartide: [number, number][] = [[-60, -60], [60, -60], [0, -90], [-60, -60]];
    const svg = buildPosterSvg({
      routeCoords: [[-68.3, -54.8], [-58, -62]], // Ushuaia → penisola antartica
      stops: [{ lon: -68.3, lat: -54.8, label: "Ushuaia" }],
      borders: [antartide], title: "Sud",
    });
    expect(svg).not.toContain("Infinity");
    expect(svg).not.toContain("NaN");
    expect(mercY(-90)).toBe(mercY(-85.051129)); // clamp esplicito
  });

  it("i confini oltre l'antimeridiano vengono traslati dentro l'inquadratura", () => {
    // Anello finto "USA" a lon -120: l'inquadratura ora vive a 139..242, quindi
    // senza traslazione di +360 l'anello cadrebbe a x molto negativa (invisibile).
    const usa: [number, number][] = [[-125, 32], [-115, 32], [-115, 42], [-125, 42], [-125, 32]];
    const svg = buildPosterSvg({ ...pacifico, borders: [usa] });
    const first = svg.match(/<g id="confini"[^>]*><path d="M([-\d.]+),/);
    expect(first).toBeTruthy();
    const x = parseFloat(first![1]);
    const xs = Array.from(svg.matchAll(/data-led="1" cx="([\d.]+)"/g)).map(m => parseFloat(m[1]));
    expect(x).toBeGreaterThan(xs[1]); // sul lato americano (oltre Honolulu), non fuori tela
    expect(x).toBeLessThan(1600);
  });
});

describe("routeBounds", () => {
  it("racchiude i punti con un margine in gradi", () => {
    const b = routeBounds([[9, 45], [13, 47]], 1);
    expect(b.lonMin).toBe(8);
    expect(b.lonMax).toBe(14);
    expect(b.latMin).toBe(44);
    expect(b.latMax).toBe(48);
  });
});

/**
 * ⚠️ SCHERMO E STAMPA LEGGONO LA STESSA COSTANTE (2026-08-26).
 *
 * L'opacità dei confini era scritta a mano in DUE file — la costellazione su
 * MapLibre e questo master SVG — con l'idea che restassero uguali. Un
 * accoppiamento per buona volontà va alla deriva al primo ritocco: si cambia lo
 * schermo, si dimentica la stampa, e il poster smette di somigliare a quello che
 * hai guardato. Questi test tengono il legame.
 */
describe("CONFINI — una sola fonte per schermo e stampa", () => {
  it("il master SVG disegna i confini coi valori della costante", () => {
    const svg = buildPosterSvg({
      stops: [{ lon: 9.19, lat: 45.46, label: "Milano" }, { lon: 8.54, lat: 47.37, label: "Zurigo" }],
      borders: [[[8, 45], [10, 45], [10, 47], [8, 45]]],
      title: "prova",
    });
    expect(svg).toContain(`stroke-opacity="${CONFINI.opacita}"`);
    expect(svg).toContain(`stroke-width="${CONFINI.spessore}"`);
    expect(svg).toContain(`stroke="${CONFINI.colore}"`);
  });

  it("l'opacità è quella scelta guardando la mappa, non un numero a caso", () => {
    // 0.32 lasciava svanire i confini interni (Austria, Ungheria); 0.60 li
    // faceva competere con le rotte. Se un domani qualcuno la cambia, che sia
    // dopo aver guardato — non per sbaglio.
    expect(CONFINI.opacita).toBe(0.45);
  });
});
