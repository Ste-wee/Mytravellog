import { describe, it, expect } from "vitest";
import { computeMonthlyTravelDays, daysSinceLastTrip, computeSeasonality, tripsInMonthAnyYear, gitePerMese, TravelHeatmap } from "./TravelHeatmap";
import type { Trip } from "@/lib/storage";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

/** Le righe degli anni sono link al recap: serve un router attorno. */
const monta = (trips: Trip[]) =>
  render(React.createElement(MemoryRouter, null, React.createElement(TravelHeatmap, { trips })));

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "t1", created_at: "2024-01-01T00:00:00.000Z", title: "Test", country: "Italia", city: "Roma",
    country_code: "IT", trip_date: "2024-06-01", date_end: null, rating: null, notes: null,
    transport_mode: null, waypoints: [], latitude: 41.9, longitude: 12.5,
    home_latitude: null, home_longitude: null, home_label: null, route_geometry: null,
    temperature_c: null, altitude_m: null, distance_from_home_km: null,
    max_distance_from_home_km: null, max_distance_city: null, max_altitude_m: null,
    max_altitude_city: null, hottest_temp_c: null, hottest_city: null,
    coldest_temp_c: null, coldest_city: null, region: null, region_details: null,
    ...overrides,
  };
}

function daysAgoISO(n: number): string {
  // Data LOCALE (non toISOString/UTC): daysSinceLastTrip usa parseLocalDate +
  // new Date() locale, quindi nelle prime ore del mattino toISOString darebbe il
  // giorno UTC = ieri, sfasando i test di 1. Formattiamo in locale per coerenza.
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("computeMonthlyTravelDays", () => {
  it("un viaggio di un giorno conta 1 nel suo mese", () => {
    const map = computeMonthlyTravelDays([makeTrip({ trip_date: "2024-06-15", date_end: null })]);
    expect(map.get("2024-5")).toBe(1); // giugno = mese indice 5
  });

  it("un viaggio multi-giorno nello stesso mese conta tutti i giorni inclusi gli estremi", () => {
    const map = computeMonthlyTravelDays([makeTrip({ trip_date: "2024-06-01", date_end: "2024-06-05" })]);
    expect(map.get("2024-5")).toBe(5);
  });

  it("un viaggio a cavallo tra due mesi divide i giorni tra entrambi", () => {
    const map = computeMonthlyTravelDays([makeTrip({ trip_date: "2024-06-28", date_end: "2024-07-03" })]);
    expect(map.get("2024-5")).toBe(3); // 28, 29, 30 giugno
    expect(map.get("2024-6")).toBe(3); // 1, 2, 3 luglio
  });

  it("un viaggio a cavallo tra due anni divide i giorni tra entrambi", () => {
    const map = computeMonthlyTravelDays([makeTrip({ trip_date: "2024-12-30", date_end: "2025-01-02" })]);
    expect(map.get("2024-11")).toBe(2); // 30, 31 dicembre
    expect(map.get("2025-0")).toBe(2); // 1, 2 gennaio
  });

  it("somma i giorni di più viaggi nello stesso mese", () => {
    const map = computeMonthlyTravelDays([
      makeTrip({ trip_date: "2024-06-01", date_end: "2024-06-02" }),
      makeTrip({ trip_date: "2024-06-10", date_end: "2024-06-10" }),
    ]);
    expect(map.get("2024-5")).toBe(3);
  });

  it("ignora un viaggio con date incoerenti (date_end prima di trip_date)", () => {
    const map = computeMonthlyTravelDays([makeTrip({ trip_date: "2024-06-10", date_end: "2024-06-01" })]);
    expect(map.size).toBe(0);
  });

  it("ritorna una mappa vuota senza viaggi", () => {
    expect(computeMonthlyTravelDays([]).size).toBe(0);
  });

  it("non congela su una data corrotta con anno assurdo (span enorme saltato)", () => {
    // Prima il while iterava giorno per giorno per centinaia di migliaia di
    // volte; ora lo span oltre ~30 anni viene saltato.
    const map = computeMonthlyTravelDays([makeTrip({ trip_date: "2024-06-01", date_end: "20250-06-01" })]);
    expect(map.size).toBe(0);
  });
});

describe("daysSinceLastTrip", () => {
  it("ritorna null senza viaggi", () => {
    expect(daysSinceLastTrip([])).toBeNull();
  });

  it("ritorna 0 se l'ultimo viaggio finisce oggi", () => {
    expect(daysSinceLastTrip([makeTrip({ trip_date: daysAgoISO(3), date_end: daysAgoISO(0) })])).toBe(0);
  });

  it("ritorna il numero corretto di giorni trascorsi dalla fine dell'ultimo viaggio", () => {
    expect(daysSinceLastTrip([makeTrip({ trip_date: daysAgoISO(10), date_end: daysAgoISO(7) })])).toBe(7);
  });

  it("usa la data di fine più recente tra più viaggi", () => {
    const trips = [
      makeTrip({ trip_date: daysAgoISO(30), date_end: daysAgoISO(25) }),
      makeTrip({ trip_date: daysAgoISO(10), date_end: daysAgoISO(5) }),
    ];
    expect(daysSinceLastTrip(trips)).toBe(5);
  });

  it("usa trip_date come fine quando date_end è null", () => {
    expect(daysSinceLastTrip([makeTrip({ trip_date: daysAgoISO(4), date_end: null })])).toBe(4);
  });

  it("non ritorna un numero negativo per un viaggio ancora in corso (date_end futura)", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const trip = makeTrip({ trip_date: daysAgoISO(1), date_end: future.toISOString().slice(0, 10) });
    expect(daysSinceLastTrip([trip])).toBe(0);
  });
});

describe("computeSeasonality", () => {
  it("somma i giorni di TUTTI gli anni nello stesso mese", () => {
    const s = computeSeasonality([
      makeTrip({ id: "a", trip_date: "2024-06-01", date_end: "2024-06-05" }),   // 5 giorni a giugno
      makeTrip({ id: "b", trip_date: "2019-06-10", date_end: "2019-06-12" }),   // 3 giorni a giugno
      makeTrip({ id: "c", trip_date: "2020-01-02", date_end: null }),           // 1 a gennaio
    ]);
    expect(s[5]).toBe(8);
    expect(s[0]).toBe(1);
    expect(s.reduce((a, b) => a + b, 0)).toBe(9);
    expect(s).toHaveLength(12);
  });

  it("un viaggio a cavallo di due mesi li riempie entrambi", () => {
    const s = computeSeasonality([makeTrip({ trip_date: "2024-06-29", date_end: "2024-07-02" })]);
    expect(s[5]).toBe(2);
    expect(s[6]).toBe(2);
  });

  it("nessun viaggio: dodici zeri, non una lista vuota", () => {
    expect(computeSeasonality([])).toEqual(new Array(12).fill(0));
  });
});

describe("tripsInMonthAnyYear", () => {
  it("include un viaggio che inizia e finisce nel mese richiesto", () => {
    const trip = makeTrip({ id: "a", trip_date: "2024-06-10", date_end: "2024-06-12" });
    expect(tripsInMonthAnyYear([trip], 5)).toEqual([trip]); // giugno = mese 5
  });

  it("esclude un viaggio in un mese diverso", () => {
    const trip = makeTrip({ id: "a", trip_date: "2024-05-10", date_end: "2024-05-12" });
    expect(tripsInMonthAnyYear([trip], 5)).toEqual([]);
  });

  it("include un viaggio a cavallo che tocca solo parzialmente il mese richiesto", () => {
    const trip = makeTrip({ id: "a", trip_date: "2024-06-28", date_end: "2024-07-03" });
    expect(tripsInMonthAnyYear([trip], 5)).toEqual([trip]); // giugno
    expect(tripsInMonthAnyYear([trip], 6)).toEqual([trip]); // luglio
    expect(tripsInMonthAnyYear([trip], 7)).toEqual([]);     // agosto: non toccato
  });

  it("include lo stesso mese di ANNI diversi: è il senso della striscia", () => {
    const vecchio = makeTrip({ id: "a", trip_date: "2019-06-10", date_end: null });
    const nuovo = makeTrip({ id: "b", trip_date: "2024-06-10", date_end: null });
    // dal più recente: la striscia racconta "tutti i miei giugno"
    expect(tripsInMonthAnyYear([vecchio, nuovo], 5)).toEqual([nuovo, vecchio]);
  });
});

describe("TravelHeatmap — legenda e scroll mobile", () => {
  it("mostra 0 e il massimo di giorni effettivo nella legenda", () => {
    monta([
        makeTrip({ id: "a", trip_date: "2024-06-01", date_end: "2024-06-05" }), // 5 giorni
        makeTrip({ id: "b", trip_date: "2024-08-01", date_end: null }),          // 1 giorno
      ]);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("5 giorni")).toBeInTheDocument();
  });

  it("non mostra la legenda quando non c'è nessun viaggio (nessun massimo da mostrare)", () => {
    monta([]);
    expect(screen.queryByText(/giorni$/)).not.toBeInTheDocument();
  });

  // Il problema che ha fatto nascere la striscia: la griglia anno×mese non
  // teneva i dodici mesi in larghezza (da agosto si vedeva solo scorrendo) e
  // cresceva di una riga all'anno. Ora niente larghezze minime e niente
  // scorrimento: dodici colonne che si adattano.
  it("la striscia non ha larghezze minime né contenitori che scorrono", () => {
    const trip = makeTrip({ id: "a", trip_date: "2024-06-01", date_end: null });
    const { container } = monta([trip]);
    const cell = container.querySelector('[title="Giu: 1 giorno di viaggio in tutto"]')!;
    const grid = cell.parentElement as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(12, 1fr)");
    expect(grid.style.minWidth).toBe("");
    expect([...container.querySelectorAll("div")].some(d => d.style.overflowX === "auto")).toBe(false);
  });

  it("l'altezza non dipende dagli anni: dodici celle con uno o con dieci anni", () => {
    const uno = monta([makeTrip({ id: "a", trip_date: "2024-06-01", date_end: null })]);
    const celleUno = uno.container.querySelectorAll('[title*="di viaggio in tutto"]').length;
    uno.unmount();
    const dieci = monta(Array.from({ length: 10 }, (_, i) =>
      makeTrip({ id: String(i), trip_date: `${2015 + i}-06-01`, date_end: null })));
    expect(dieci.container.querySelectorAll('[title*="di viaggio in tutto"]').length).toBe(celleUno);
  });
});

describe("TravelHeatmap — render", () => {
  it("renderizza senza crash e mostra 0 giorni in viaggio e '—' di astinenza senza viaggi", () => {
    monta([]);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("giorni senza viaggiare")).toBeInTheDocument();
    expect(screen.getByText("giorni in viaggio")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("i giorni condivisi da due viaggi contano UNA volta anche nel totale della heatmap", () => {
    monta([
        makeTrip({ trip_date: "2024-06-15", date_end: "2024-06-21" }), // 7 giorni
        makeTrip({ trip_date: "2024-06-21", date_end: "2024-06-25" }), // 5, il 21 condiviso
      ]);
    expect(screen.getByText("11")).toBeInTheDocument(); // 7 + 5 - 1, non 12
  });

  it("mostra il totale corretto di giorni in viaggio (conteggio inclusivo, non differenza di date)", () => {
    monta([
        makeTrip({ trip_date: "2024-06-01", date_end: "2024-06-05" }), // 5 giorni inclusi gli estremi
        makeTrip({ trip_date: "2024-08-10", date_end: null }),          // 1 giorno
      ]);
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("mostra il numero corretto di giorni di astinenza con un viaggio passato", () => {
    monta([makeTrip({ trip_date: daysAgoISO(9), date_end: daysAgoISO(6) })]);
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("mostra solo l'anno del viaggio, non l'anno corrente se non c'è nessun viaggio quest'anno", () => {
    const oldYear = new Date().getFullYear() - 2;
    monta([makeTrip({ trip_date: `${oldYear}-03-01`, date_end: null })]);
    expect(screen.getByText(String(oldYear))).toBeInTheDocument();
    expect(screen.queryByText(String(new Date().getFullYear()))).not.toBeInTheDocument();
  });

  it("salta un anno senza nessun viaggio anche se è compreso tra due anni con viaggi", () => {
    const gapYear = new Date().getFullYear() - 3;
    monta([
        makeTrip({ trip_date: `${gapYear}-03-01`, date_end: null }),
        makeTrip({ trip_date: `${gapYear + 2}-03-01`, date_end: null }),
      ]);
    expect(screen.getByText(String(gapYear))).toBeInTheDocument();
    expect(screen.getByText(String(gapYear + 2))).toBeInTheDocument();
    expect(screen.queryByText(String(gapYear + 1))).not.toBeInTheDocument();
  });

  it("non mostra nessuna riga anno senza viaggi", () => {
    monta([]);
    expect(screen.queryByText(String(new Date().getFullYear()))).not.toBeInTheDocument();
  });
});

describe("TravelHeatmap — accessibilità delle celle", () => {
  it("una cella con giorni è un <button> reale, raggiungibile da tastiera", () => {
    const trip = makeTrip({ id: "a", trip_date: "2024-06-01", date_end: null });
    monta([trip]);
    const cell = screen.getByRole("button", { name: "Giu: 1 giorno di viaggio in tutto" });
    expect(cell.tagName).toBe("BUTTON");
  });

  it("una cella senza giorni non è un button (resta un div non interattivo)", () => {
    const trip = makeTrip({ id: "a", trip_date: "2024-06-01", date_end: null });
    monta([trip]);
    expect(screen.queryByRole("button", { name: /^Lug/ })).not.toBeInTheDocument();
  });

  it("aria-pressed riflette lo stato selezionato della cella", () => {
    const trip = makeTrip({ id: "a", trip_date: "2024-06-01", date_end: null });
    monta([trip]);
    const cell = screen.getByRole("button", { name: "Giu: 1 giorno di viaggio in tutto" });
    expect(cell).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(cell);
    expect(cell).toHaveAttribute("aria-pressed", "true");
  });

  it("il pulsante di chiusura ha un nome accessibile", () => {
    const trip = makeTrip({ id: "a", trip_date: "2024-06-01", date_end: null });
    monta([trip]);
    fireEvent.click(screen.getByRole("button", { name: "Giu: 1 giorno di viaggio in tutto" }));
    expect(screen.getByRole("button", { name: "Chiudi" })).toBeInTheDocument();
  });
});

describe("TravelHeatmap — riepilogo del mese al click", () => {
  it("il click su una cella con giorni apre il riepilogo con città e date del viaggio", () => {
    const trip = makeTrip({ id: "a", city: "Palermo", trip_date: "2024-06-01", date_end: "2024-06-05" });
    const { container } = monta([trip]);
    const cell = container.querySelector('[title="Giu: 5 giorni di viaggio in tutto"]')!;
    fireEvent.click(cell);
    expect(screen.getByText("Giu — 5 giorni")).toBeInTheDocument();
    expect(screen.getByText("Palermo")).toBeInTheDocument();
  });

  it("usa il singolare '1 giorno' nell'intestazione del riepilogo, non '1 giorni'", () => {
    const trip = makeTrip({ id: "a", city: "Palermo", trip_date: "2024-06-01", date_end: null });
    const { container } = monta([trip]);
    const cell = container.querySelector('[title="Giu: 1 giorno di viaggio in tutto"]')!;
    fireEvent.click(cell);
    expect(screen.getByText("Giu — 1 giorno")).toBeInTheDocument();
  });

  it("un secondo click sulla stessa cella chiude il riepilogo", () => {
    const trip = makeTrip({ id: "a", city: "Palermo", trip_date: "2024-06-01", date_end: null });
    const { container } = monta([trip]);
    const cell = container.querySelector('[title="Giu: 1 giorno di viaggio in tutto"]')!;
    fireEvent.click(cell);
    expect(screen.getByText("Palermo")).toBeInTheDocument();
    fireEvent.click(cell);
    expect(screen.queryByText("Palermo")).not.toBeInTheDocument();
  });

  it("il pulsante × chiude il riepilogo", () => {
    const trip = makeTrip({ id: "a", city: "Palermo", trip_date: "2024-06-01", date_end: null });
    const { container } = monta([trip]);
    const cell = container.querySelector('[title="Giu: 1 giorno di viaggio in tutto"]')!;
    fireEvent.click(cell);
    expect(screen.getByText("Palermo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByText("Palermo")).not.toBeInTheDocument();
  });

  it("una cella senza giorni non apre nessun riepilogo", () => {
    const trip = makeTrip({ id: "a", city: "Palermo", trip_date: "2024-06-01", date_end: null });
    const { container } = monta([trip]);
    const emptyCell = container.querySelector('[title="Lug: 0 giorni di viaggio in tutto"]')!;
    fireEvent.click(emptyCell);
    expect(screen.queryByText("Palermo")).not.toBeInTheDocument();
  });

  it("mostra tutti i viaggi che toccano il mese, anche più di uno", () => {
    const trips = [
      makeTrip({ id: "a", city: "Palermo", trip_date: "2024-06-01", date_end: null }),
      makeTrip({ id: "b", city: "Catania", trip_date: "2024-06-15", date_end: null }),
    ];
    const { container } = monta(trips);
    const cell = container.querySelector('[title="Giu: 2 giorni di viaggio in tutto"]')!;
    fireEvent.click(cell);
    expect(screen.getByText("Palermo")).toBeInTheDocument();
    expect(screen.getByText("Catania")).toBeInTheDocument();
  });
});

// Le gite sul grafico dei mesi sono un livello SEPARATO (scelta di Stefano,
// 2026-08-25): il blu conta i giorni dei viaggi, un puntino ambra dice "qui
// c'era anche una gita". Mescolarle ricreerebbe la mezza-verità che l'aveva
// insospettito — statistiche che dicono "gite escluse" e grafico che le include.
describe("gitePerMese — il secondo livello della striscia", () => {
  const gita = (d: string) => makeTrip({ trip_date: d, date_end: d });

  it("conta le gite nel loro mese, su tutti gli anni insieme", () => {
    const per = gitePerMese([gita("2026-04-29"), gita("2017-08-30"), gita("2023-04-02")]);
    expect(per[3]).toBe(2);   // aprile: 2026 e 2023
    expect(per[7]).toBe(1);   // agosto
    expect(per.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("nessuna gita: dodici zeri, la striscia si comporta come prima", () => {
    expect(gitePerMese([])).toEqual(new Array(12).fill(0));
  });

  it("una data malformata non sposta niente e non fa NaN", () => {
    const per = gitePerMese([gita(""), gita("non-una-data"), gita("2026-13-01")]);
    expect(per).toEqual(new Array(12).fill(0));
  });

  it("⚠️ NON tocca i giorni in viaggio: sono due conti diversi", () => {
    // È l'invariante che tiene onesto il grafico: le gite non entrano nel blu.
    const viaggi = [makeTrip({ trip_date: "2026-04-01", date_end: "2026-04-05" })];
    const giorni = computeSeasonality(viaggi);
    const conGite = computeSeasonality(viaggi);   // le gite NON passano da qui
    expect(conGite[3]).toBe(giorni[3]);
    expect(giorni[3]).toBe(5);
    expect(gitePerMese([gita("2026-04-29")])[3]).toBe(1);
  });
});
