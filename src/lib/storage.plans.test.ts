import { describe, it, expect, beforeEach } from "vitest";
import {
  addPlan, loadPlans, updatePlan, deletePlan, promotePlanToTrip,
  loadTrips, saveTrips, savePlans, dropBudgetData, type Trip,
} from "./storage";

function basePlan(over: Partial<Omit<Trip, "id" | "created_at" | "status">> = {}): Omit<Trip, "id" | "created_at" | "status"> {
  return {
    title: "Islanda", country: "Islanda", city: "Reykjavík", country_code: "IS",
    trip_date: "2099-09-12", date_end: "2099-09-19", rating: null, notes: null,
    transport_mode: "plane", waypoints: [],
    latitude: 64.1, longitude: -21.9, home_latitude: null, home_longitude: null, home_label: null,
    route_geometry: null, temperature_c: null, altitude_m: null, max_altitude_m: null, max_altitude_city: null,
    distance_from_home_km: null, max_distance_from_home_km: null, max_distance_city: null,
    hottest_temp_c: null, hottest_city: null, coldest_temp_c: null, coldest_city: null,
    region: null, region_details: null,
    ...over,
  };
}

describe("plans bucket (viaggi in programma)", () => {
  beforeEach(() => localStorage.clear());

  it("addPlan salva con status 'planned' e NON nel bucket del diario", () => {
    addPlan(basePlan());
    const plans = loadPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0].status).toBe("planned");
    expect(loadTrips()).toHaveLength(0); // niente leak nel diario
  });

  it("loadPlans ordina per data di partenza crescente (i più imminenti prima)", () => {
    addPlan(basePlan({ title: "Tardi", trip_date: "2099-12-01" }));
    addPlan(basePlan({ title: "Presto", trip_date: "2099-01-01" }));
    expect(loadPlans().map(p => p.title)).toEqual(["Presto", "Tardi"]);
  });

  it("updatePlan applica il patch (checklist/prenotato)", () => {
    const p = addPlan(basePlan());
    updatePlan(p.id, { checklist: [{ text: "Prenota", done: true }], booked: true });
    const updated = loadPlans()[0];
    expect(updated.checklist).toEqual([{ text: "Prenota", done: true }]);
    expect(updated.booked).toBe(true);
  });

  it("deletePlan rimuove solo il piano indicato", () => {
    const a = addPlan(basePlan({ title: "A" }));
    addPlan(basePlan({ title: "B" }));
    deletePlan(a.id);
    expect(loadPlans().map(p => p.title)).toEqual(["B"]);
  });

  it("promotePlanToTrip sposta il piano nel diario come 'done', conservando la checklist", () => {
    const p = addPlan(basePlan({ checklist: [{ text: "x", done: false }] }));
    const done = promotePlanToTrip(p.id);
    expect(done?.status).toBe("done");
    expect(loadPlans()).toHaveLength(0);      // rimosso dai piani
    const trips = loadTrips();
    expect(trips).toHaveLength(1);            // aggiunto al diario
    expect(trips[0].id).toBe(p.id);
    expect(trips[0].status).toBe("done");
    expect(trips[0].checklist).toEqual([{ text: "x", done: false }]);
  });

  it("promotePlanToTrip NON si porta dietro la spunta prenotato", () => {
    // "prenotato" ha senso su un viaggio da fare; su un ricordo è un fossile
    // che resterebbe per sempre nel dato e nel backup.
    const p = addPlan(basePlan({ booked: true }));
    const done = promotePlanToTrip(p.id);
    expect(done && "booked" in done).toBe(false);
    expect("booked" in loadTrips()[0]).toBe(false);
  });

  it("promotePlanToTrip ritorna null se l'id non esiste", () => {
    expect(promotePlanToTrip("inesistente")).toBeNull();
  });

  it("promotePlanToTrip conserva l'itinerario multi-tappa (waypoints coi mezzi)", () => {
    const wps = [
      { id: "w1", city: "Reykjavík", country: "Islanda", country_code: "IS", transport_mode: "plane" as const, lat: 64.1, lon: -21.9, route_geometry: null },
      { id: "w2", city: "Vík", country: "Islanda", country_code: "IS", transport_mode: "car" as const, lat: 63.4, lon: -19.0, route_geometry: null },
    ];
    const p = addPlan(basePlan({ city: "Höfn", latitude: 64.25, longitude: -15.2, transport_mode: "car", waypoints: wps }));
    const done = promotePlanToTrip(p.id);
    expect(done?.waypoints).toEqual(wps);          // tappe intermedie intatte
    expect(done?.city).toBe("Höfn");                // meta finale intatta
    expect(done?.transport_mode).toBe("car");       // mezzo dell'ultima tratta intatto
  });
});

// I budget sono stati rimossi dall'app (2026-08-16): i dati già salvati non
// vanno solo nascosti, vanno cancellati — e la cancellazione deve propagarsi
// al backup Drive, che confronta gli `updated_at`.
describe("dropBudgetData — i budget spariscono per davvero", () => {
  beforeEach(() => localStorage.clear());

  it("toglie il campo budget da viaggi e piani già salvati", () => {
    localStorage.setItem("atlas.trips.v1", JSON.stringify([
      { id: "t1", title: "Roma", budget: [{ label: "Volo", amount: 400, paid: 240 }], updated_at: "2020-01-01T00:00:00.000Z" },
      { id: "t2", title: "Vienna" },
    ]));
    localStorage.setItem("atlas.plans.v1", JSON.stringify([
      { id: "p1", title: "Barcellona", status: "planned", budget: [{ label: "Hotel", amount: 500 }] },
    ]));

    expect(dropBudgetData()).toBe(2); // un viaggio + un piano

    const trips = JSON.parse(localStorage.getItem("atlas.trips.v1")!);
    const plans = JSON.parse(localStorage.getItem("atlas.plans.v1")!);
    expect("budget" in trips.find((t: Trip) => t.id === "t1")).toBe(false);
    expect("budget" in plans[0]).toBe(false);
    // il viaggio senza budget non viene toccato: niente updated_at inventato
    expect(trips.find((t: Trip) => t.id === "t2").updated_at).toBeUndefined();
  });

  // La prima versione timbrava `updated_at` "per far propagare la
  // cancellazione". Era un'arma carica: nel merge di Drive vince il record
  // INTERO più recente, quindi una copia locale vecchia dichiarata appena
  // modificata riportava indietro titoli/note/diario cambiati altrove, e
  // batteva perfino la lapide di un viaggio cancellato (che resuscitava).
  it("NON tocca updated_at: nessuna data falsificata", () => {
    localStorage.setItem("atlas.trips.v1", JSON.stringify([
      { id: "t1", title: "Roma", budget: [{ label: "Volo", amount: 400 }], updated_at: "2020-01-01T00:00:00.000Z" },
    ]));
    dropBudgetData();
    const t = JSON.parse(localStorage.getItem("atlas.trips.v1")!)[0];
    expect(t.updated_at).toBe("2020-01-01T00:00:00.000Z");
    expect("budget" in t).toBe(false);
  });

  it("saveTrips e savePlans tolgono il budget da sole, a ogni scrittura", () => {
    saveTrips([{ id: "t1", title: "Roma", budget: [{ label: "Volo", amount: 9 }] } as unknown as Trip]);
    savePlans([{ id: "p1", title: "Barcellona", status: "planned", budget: [{ label: "Hotel", amount: 9 }] } as unknown as Trip]);
    expect(localStorage.getItem("atlas.trips.v1")).not.toContain("budget");
    expect(localStorage.getItem("atlas.plans.v1")).not.toContain("budget");
  });

  it("è idempotente: al secondo giro non trova più nulla", () => {
    localStorage.setItem("atlas.trips.v1", JSON.stringify([{ id: "t1", budget: [{ label: "x", amount: 1 }] }]));
    expect(dropBudgetData()).toBe(1);
    expect(dropBudgetData()).toBe(0);
  });
});
