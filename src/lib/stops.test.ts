import { describe, it, expect } from "vitest";
import { stopChain, fermateDelBiglietto } from "./stops";
import type { Trip } from "@/lib/storage";

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: "1", created_at: "2024-01-01", title: "Giro", country: "Austria", city: "Vienna",
  country_code: "AT", trip_date: "2024-06-15", date_end: "2024-06-21", rating: null, notes: null,
  transport_mode: "train", waypoints: [],
  latitude: 48.21, longitude: 16.37,
  home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano, Italia",
  route_geometry: null, temperature_c: null, altitude_m: null,
  max_altitude_m: null, max_altitude_city: null,
  distance_from_home_km: null, max_distance_from_home_km: null, max_distance_city: null,
  hottest_temp_c: null, hottest_city: null, coldest_temp_c: null, coldest_city: null,
  region: null, region_details: null,
  ...over,
} as Trip);

const tappa = (city: string, lat?: number, lon?: number) =>
  ({ city, country: "X", transport_mode: "train" as const, lat, lon });

// Il viaggio napoletano vero di Stefano: base a Napoli, quattro gite, e un
// doppione consecutivo (Napoli → Napoli) rimasto nei dati.
const NAP = { lat: 40.8518, lon: 14.2681 };
const napoletano = () => trip({
  city: "Napoli", latitude: NAP.lat, longitude: NAP.lon,
  waypoints: [
    tappa("Napoli", NAP.lat, NAP.lon), tappa("Pompei", 40.7497, 14.5007),
    tappa("Napoli", NAP.lat, NAP.lon), tappa("Napoli", NAP.lat, NAP.lon),
    tappa("Caserta", 41.0722, 14.3327), tappa("Napoli", NAP.lat, NAP.lon),
    tappa("Sorrento", 40.6263, 14.3757), tappa("Napoli", NAP.lat, NAP.lon),
    tappa("Capri", 40.5532, 14.2222),
  ],
});

describe("stopChain", () => {
  it("mette in fila partenza, tappe e destinazione", () => {
    expect(stopChain(trip({ waypoints: [tappa("Trieste"), tappa("Ljubljana")] })))
      .toBe("Milano → Trieste → Ljubljana → Vienna");
  });

  it("della città di partenza usa solo il nome, non «Milano, Italia»", () => {
    expect(stopChain(trip({ home_label: "Reggio nell'Emilia, Italia", waypoints: [tappa("Bologna")] })))
      .toBe("Reggio nell'Emilia → Bologna → Vienna");
  });

  it("senza tappe intermedie non c'è percorso da raccontare: null", () => {
    expect(stopChain(trip())).toBeNull();
    expect(stopChain(trip({ waypoints: [] }))).toBeNull();
  });

  it("senza città di partenza salvata ricade su «Casa»", () => {
    expect(stopChain(trip({ home_label: null, waypoints: [tappa("Trieste")] })))
      .toBe("Casa → Trieste → Vienna");
  });
});

describe("fermateDelBiglietto — la base si nomina una volta", () => {
  it("undici fermate diventano i sei posti che hai visto", () => {
    expect(fermateDelBiglietto(napoletano()).nomi)
      .toEqual(["Milano", "Napoli", "Pompei", "Caserta", "Sorrento", "Capri"]);
  });

  it("dice DOVE sta la base, per poterla marcare", () => {
    // indice 1: subito dopo la casa. Serve al pallino verde del biglietto —
    // senza, finirebbe sull'ultima fermata, che è una gita (Capri).
    expect(fermateDelBiglietto(napoletano()).baseIdx).toBe(1);
  });

  it("anche il doppione consecutivo (Napoli → Napoli) se ne va", () => {
    expect(fermateDelBiglietto(napoletano()).nomi.filter(n => n === "Napoli")).toHaveLength(1);
  });

  // Il paletto: un viaggio senza base non si tocca. Niente ripetizioni,
  // niente da collassare.
  it("in un viaggio ITINERANTE la fila resta intera", () => {
    const itinerante = trip({
      city: "Zurigo", latitude: 47.3769, longitude: 8.5417,
      waypoints: [tappa("Lugano", 46.0, 8.95), tappa("Lucerna", 47.05, 8.31),
        tappa("Basilea", 47.56, 7.59)],
    });
    const f = fermateDelBiglietto(itinerante);
    expect(f.nomi).toEqual(["Milano", "Lugano", "Lucerna", "Basilea", "Zurigo"]);
    expect(f.baseIdx).toBeNull();
  });

  // Scoperto scrivendo questi test, e vale la pena saperlo: un posto ripassato
  // CON qualcosa in mezzo È una base per definizione dell'app (dormi a Roma,
  // vai a Napoli, torni, poi riparti per Firenze). Quindi si collassa anche
  // qui, e il viaggio "prosegue" dopo la base — non è un caso a parte.
  it("un posto ripassato con una gita in mezzo È una base, e si collassa", () => {
    const conRitorno = trip({
      city: "Firenze", latitude: 43.7696, longitude: 11.2558,
      waypoints: [tappa("Roma", 41.9028, 12.4964), tappa("Napoli", NAP.lat, NAP.lon),
        tappa("Roma", 41.9028, 12.4964)],
    });
    const f = fermateDelBiglietto(conRitorno);
    expect(f.nomi).toEqual(["Milano", "Roma", "Napoli", "Firenze"]);
    expect(f.baseIdx).toBe(1);
  });

  // Due volte lo stesso posto di FILA non è una base (è un refuso), quindi
  // resta come sta: l'app non riscrive i dati per far bella figura.
  it("un doppione di fila senza base resta visibile", () => {
    const refuso = trip({
      city: "Firenze", latitude: 43.7696, longitude: 11.2558,
      waypoints: [tappa("Roma", 41.9028, 12.4964), tappa("Roma", 41.9028, 12.4964)],
    });
    expect(fermateDelBiglietto(refuso).nomi).toEqual(["Milano", "Roma", "Roma", "Firenze"]);
  });

  it("un viaggio senza tappe è solo casa e meta", () => {
    const f = fermateDelBiglietto(trip());
    expect(f.nomi).toEqual(["Milano", "Vienna"]);
    expect(f.baseIdx).toBeNull();
  });
});

describe("stopChain e i pallini raccontano lo STESSO itinerario", () => {
  it("la catena di un viaggio a base non ripete la base", () => {
    expect(stopChain(napoletano())).toBe("Milano → Napoli → Pompei → Caserta → Sorrento → Capri");
  });

  it("e combacia sempre con le fermate del biglietto", () => {
    for (const t of [napoletano(), trip({ waypoints: [tappa("Trieste"), tappa("Ljubljana")] })]) {
      expect(stopChain(t)).toBe(fermateDelBiglietto(t).nomi.join(" → "));
    }
  });
});
