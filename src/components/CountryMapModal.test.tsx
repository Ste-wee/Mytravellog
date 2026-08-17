import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, configure, fireEvent } from "@testing-library/react";
import { CountryMapModal, __clearGeoCache, __clearMemoryCache, __clearElencoLocale, parseGithubRawUrl, isGitLfsPointer } from "./CountryMapModal";
import type { Trip } from "@/lib/storage";
import React from "react";

// Default 1000ms is troppo stretto sotto carico (suite in parallelo).
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => { __clearGeoCache(); __clearElencoLocale(); });

// ── GeoJSON fixture helpers ──────────────────────────────────────────────────
// geoBoundaries usa sempre "shapeName" (nome) e "shapeISO" (codice ISO 3166-2).

function makePolygon(name: string, code?: string) {
  return {
    type: "Feature",
    properties: { shapeName: name, shapeISO: code ?? null },
    geometry: {
      type: "Polygon",
      // Simple square around centre of Italy for projection
      coordinates: [[[10, 43], [14, 43], [14, 47], [10, 47], [10, 43]]],
    },
  };
}

// Minimal Italy: 5 regioni, con codici ISO 3166-2 reali
const ITALY_FEATURES = [
  makePolygon("Lazio", "IT-62"),
  makePolygon("Toscana", "IT-52"),
  makePolygon("Puglia", "IT-75"),
  makePolygon("Sicilia", "IT-82"),
  makePolygon("Sardegna", "IT-88"),
];

// Le 9 regioni austriache nel loro nome tedesco (come nel dataset reale)
const AUSTRIA_FEATURES = [
  makePolygon("Wien", "AT-9"),
  makePolygon("Tirol", "AT-7"),
  makePolygon("Steiermark", "AT-6"),
  makePolygon("Oberösterreich", "AT-4"),
  makePolygon("Niederösterreich", "AT-3"),
  makePolygon("Kärnten", "AT-2"),
  makePolygon("Burgenland", "AT-1"),
  makePolygon("Salzburg", "AT-5"),
  makePolygon("Vorarlberg", "AT-8"),
];

/** Simula le due chiamate di fetchCountryRegions: metadata geoBoundaries -> GeoJSON (testo, non LFS). */
function mockGeoBoundaries(features: any[]) {
  const body = JSON.stringify({ type: "FeatureCollection", features });
  // Risposte per INDIRIZZO e non per ordine: l'app prova prima i confini che
  // ospitiamo noi (public/confini/<ISO2>.json) e solo dopo va in rete. Coi
  // mock ordinati bastava aggiungere un passo perché 36 test cadessero.
  global.fetch = vi.fn((input: any) => {
    const u = String(input);
    if (u.includes("/confini/")) return Promise.resolve({ ok: false, status: 404 } as any); // paese non nel pacchetto
    if (u.includes("geoboundaries.org")) return Promise.resolve({ ok: true, json: async () => ({ simplifiedGeometryGeoJSON: "https://fake/geo.json" }) } as any);
    return Promise.resolve({ ok: true, text: async () => body } as any);
  }) as any;
}

/** Le chiamate DI RETE: esclude il tentativo sui confini che ospitiamo noi,
 *  che è sempre il primo e nei test risponde 404. */
const chiamateDiRete = () => (fetch as any).mock.calls.filter((c: any[]) => !String(c[0]).includes("/confini/"));

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: new Date().toISOString(),
    title: "Test",
    country: "Italia",
    city: "Roma",
    country_code: "IT",
    trip_date: "2024-01-01",
    date_end: null,
    rating: null,
    notes: null,
    transport_mode: null,
    waypoints: [],
    latitude: 41.9,
    longitude: 12.5,
    home_latitude: null,
    home_longitude: null,
    home_label: null,
    route_geometry: null,
    temperature_c: null,
    altitude_m: null,
    distance_from_home_km: null,
    max_distance_from_home_km: null,
    max_distance_city: null,
    max_altitude_m: null,
    max_altitude_city: null,
    hottest_temp_c: null,
    hottest_city: null,
    coldest_temp_c: null,
    coldest_city: null,
    region: null,
    region_details: null,
    ...overrides,
  };
}

function renderModal(props: Partial<{
  countryCode: string;
  countryName: string;
  trips: Trip[];
  onClose: () => void;
}> = {}) {
  return render(
    <CountryMapModal
      countryCode={props.countryCode ?? "IT"}
      countryName={props.countryName ?? "Italia"}
      trips={props.trips ?? []}
      onClose={props.onClose ?? vi.fn()}
    />
  );
}

describe("CountryMapModal — render base", () => {
  afterEach(() => vi.restoreAllMocks());

  it("mostra il nome del paese nell'header", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ countryName: "Italia" });
    expect(await screen.findByText("Italia")).toBeInTheDocument();
  });

  it("mostra 'Caricamento mappa…' durante il fetch", () => {
    // fetch non si risolve mai → stato loading
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    renderModal();
    expect(screen.getByText(/caricamento mappa/i)).toBeInTheDocument();
  });
});

describe("CountryMapModal — paese non supportato", () => {
  afterEach(() => vi.restoreAllMocks());

  it("mostra errore per un codice paese senza mapping ISO2→ISO3", async () => {
    // "XX" non è un vero codice ISO 3166-1: fetchCountryRegions ritorna null
    // senza nemmeno chiamare fetch.
    renderModal({ countryCode: "XX", countryName: "Sconosciuto" });
    await waitFor(() => expect(screen.getByText(/mappa non disponibile/i)).toBeInTheDocument());
  });

  it("mostra errore se geoBoundaries non ha suddivisioni per il paese (es. micro-stato)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as any); // nessun gjDownloadURL
    renderModal({ countryCode: "VA", countryName: "Vaticano" });
    await waitFor(() => expect(screen.getByText(/mappa non disponibile/i)).toBeInTheDocument());
  });

  it("mostra le regioni visitate nell'error state se ci sono", async () => {
    // NB: il viaggio deve essere DI QUEL paese. Prima questo test passava un
    // viaggio italiano e si aspettava "Bavaria" nel pannello della Germania:
    // era il difetto segnalato da Stefano (regioni di altri stati in elenco).
    global.fetch = vi.fn().mockRejectedValue(new Error("boom"));
    renderModal({
      countryCode: "DE", countryName: "Germania",
      trips: [makeTrip({ country: "Germania", country_code: "DE", region: "Bavaria" })],
    });
    await waitFor(() => expect(screen.getByText(/Bavaria/)).toBeInTheDocument());
  });
});

describe("CountryMapModal — fetch fallisce", () => {
  afterEach(() => vi.restoreAllMocks());

  it("mostra errore se il fetch dei metadati fallisce", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    renderModal({ countryCode: "IT" });
    await waitFor(() =>
      expect(screen.getByText(/mappa non disponibile/i)).toBeInTheDocument()
    );
  });

  it("mostra errore se il fetch del GeoJSON ritorna ok=false", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ simplifiedGeometryGeoJSON: "https://fake/geo.json" }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    renderModal({ countryCode: "IT" });
    await waitFor(() =>
      expect(screen.getByText(/mappa non disponibile/i)).toBeInTheDocument()
    );
  });
});

describe("CountryMapModal — pct e regioni visitate", () => {
  afterEach(() => vi.restoreAllMocks());

  it("mostra 0% con trips senza region", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ trips: [makeTrip({ region: null })] });
    await waitFor(() => expect(screen.getByText(/regioni? su 5/)).toBeInTheDocument());
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("mostra 1 regione su 5 con region='Lazio'", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ trips: [makeTrip({ region: "Lazio" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("conta 2 regioni su 5 con due trip che hanno regioni diverse", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({
      trips: [
        makeTrip({ region: "Lazio" }),
        makeTrip({ region: "Toscana" }),
      ],
    });
    await waitFor(() => expect(screen.getByText("2 regioni su 5")).toBeInTheDocument());
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("non duplica la stessa regione visitata due volte", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({
      trips: [
        makeTrip({ region: "Lazio" }),
        makeTrip({ region: "Lazio" }),
      ],
    });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
    expect(screen.getByText("20%")).toBeInTheDocument();
  });
});

describe("CountryMapModal — matching per codice ISO 3166-2 (region_details)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("abbina per codice anche se il nome salvato è in inglese", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ trips: [makeTrip({ region: "Tuscany", region_details: [{ name: "Tuscany", code: "IT-52" }] })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
  });

  it("il codice ha la priorità: nome non corrispondente ma codice giusto trova comunque la regione", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ trips: [makeTrip({ region: "Nome qualsiasi", region_details: [{ name: "Nome qualsiasi", code: "IT-82" }] })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
  });

  it("due region_details con lo stesso codice ma nomi diversi contano una sola volta", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({
      trips: [makeTrip({
        region: "Vienna, Wien",
        region_details: [{ name: "Vienna", code: "IT-62" }, { name: "Wien", code: "IT-62" }],
      })],
    });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
  });
});

describe("CountryMapModal — codici ISO 3166-2 presenti ma diversi (Nominatim vs geoBoundaries)", () => {
  afterEach(() => vi.restoreAllMocks());

  // Kyiv (città, UA-30) e Kyiv Oblast (UA-32) hanno codici diversi ma nomi
  // l'uno sottostringa dell'altro: il fallback per sottostringa, se applicato
  // anche quando entrambi i lati hanno un codice, li confonderebbe.
  const UKRAINE_FEATURES = [
    makePolygon("Kyiv", "UA-30"),
    makePolygon("Kyiv Oblast", "UA-32"),
  ];

  it("un viaggio a Kyiv (codice UA-30) conta solo 1 regione, non anche Kyiv Oblast", async () => {
    mockGeoBoundaries(UKRAINE_FEATURES);
    renderModal({
      countryCode: "UA", countryName: "Ucraina",
      trips: [makeTrip({ country: "Ucraina", country_code: "UA", region: "Kyiv", region_details: [{ name: "Kyiv", code: "UA-30" }] })],
    });
    await waitFor(() => expect(screen.getByText("1 regione su 2")).toBeInTheDocument());
  });

  // Nominatim e geoBoundaries usano a volte numerazioni ISO 3166-2 diverse
  // per la stessa regione (es. Polonia: "PL-12" da Nominatim vs "PL-MA" da
  // geoBoundaries per "Lesser Poland Voivodeship"): il mismatch di codice non
  // deve, da solo, escludere un match quando il nome coincide esattamente.
  const POLAND_FEATURES = [
    makePolygon("Lesser Poland Voivodeship", "PL-MA"),
    makePolygon("Masovian Voivodeship", "PL-MZ"),
  ];

  it("nome identico ma codice diverso tra le fonti trova comunque la regione", async () => {
    mockGeoBoundaries(POLAND_FEATURES);
    renderModal({
      countryCode: "PL", countryName: "Polonia",
      trips: [makeTrip({ country: "Polonia", country_code: "PL", region: "Lesser Poland Voivodeship", region_details: [{ name: "Lesser Poland Voivodeship", code: "PL-12" }] })],
    });
    await waitFor(() => expect(screen.getByText("1 regione su 2")).toBeInTheDocument());
  });
});

describe("CountryMapModal — regionMatches per nome (fallback senza codice, viaggi vecchi)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("match esatto case-insensitive: 'lazio' trova 'Lazio'", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ trips: [makeTrip({ region: "lazio" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
  });

  it("alias EN→IT: 'Tuscany' trova 'Toscana'", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ trips: [makeTrip({ region: "Tuscany" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
  });

  it("alias EN→IT: 'Sicily' trova 'Sicilia'", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ trips: [makeTrip({ region: "Sicily" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
  });

  it("alias EN→IT: 'Apulia' trova 'Puglia'", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ trips: [makeTrip({ region: "Apulia" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
  });

  it("substring match: 'Tosc' trova 'Toscana' (4 chars è il minimo)", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ trips: [makeTrip({ region: "Tosc" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
  });

  it("regione non riconosciuta: 'XYZ' non trova nessuna regione", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ trips: [makeTrip({ region: "XYZ" })] });
    await waitFor(() => expect(screen.getByText(/regioni? su 5/)).toBeInTheDocument());
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});

describe("CountryMapModal — alias EN→DE per l'Austria (fallback senza codice)", () => {
  afterEach(() => vi.restoreAllMocks());

  function renderAustria(region: string) {
    mockGeoBoundaries(AUSTRIA_FEATURES);
    return renderModal({
      countryCode: "AT", countryName: "Austria",
      trips: [makeTrip({ region, country: "Austria", country_code: "AT" })],
    });
  }

  it("'Vienna' (Nominatim EN) trova 'Wien' (GeoJSON DE)", async () => {
    renderAustria("Vienna");
    await waitFor(() => expect(screen.getByText("1 regione su 9")).toBeInTheDocument());
  });

  it("'Tyrol' trova 'Tirol'", async () => {
    renderAustria("Tyrol");
    await waitFor(() => expect(screen.getByText("1 regione su 9")).toBeInTheDocument());
  });

  it("'Styria' trova 'Steiermark'", async () => {
    renderAustria("Styria");
    await waitFor(() => expect(screen.getByText("1 regione su 9")).toBeInTheDocument());
  });

  it("'Upper Austria' trova 'Oberösterreich'", async () => {
    renderAustria("Upper Austria");
    await waitFor(() => expect(screen.getByText("1 regione su 9")).toBeInTheDocument());
  });

  it("'Lower Austria' trova 'Niederösterreich'", async () => {
    renderAustria("Lower Austria");
    await waitFor(() => expect(screen.getByText("1 regione su 9")).toBeInTheDocument());
  });

  it("'Carinthia' trova 'Kärnten'", async () => {
    renderAustria("Carinthia");
    await waitFor(() => expect(screen.getByText("1 regione su 9")).toBeInTheDocument());
  });

  it("'Salzburg', 'Burgenland', 'Vorarlberg' (stesso nome in EN e DE) continuano a funzionare", async () => {
    mockGeoBoundaries(AUSTRIA_FEATURES);
    renderModal({
      countryCode: "AT", countryName: "Austria",
      trips: [makeTrip({ region: "Salzburg, Burgenland, Vorarlberg", country: "Austria", country_code: "AT" })],
    });
    await waitFor(() => expect(screen.getByText("3 regioni su 9")).toBeInTheDocument());
  });
});

describe("CountryMapModal — regioni multiple (comma-separated, viaggi senza region_details)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("esplode 'Lazio, Toscana' in due regioni separate", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ trips: [makeTrip({ region: "Lazio, Toscana" })] });
    await waitFor(() => expect(screen.getByText("2 regioni su 5")).toBeInTheDocument());
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("combina regioni da trip diversi e deduplica", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({
      trips: [
        makeTrip({ region: "Lazio, Toscana" }),
        makeTrip({ region: "Toscana, Puglia" }),
      ],
    });
    // Lazio + Toscana + Puglia = 3 uniche
    await waitFor(() => expect(screen.getByText("3 regioni su 5")).toBeInTheDocument());
  });
});

describe("parseGithubRawUrl", () => {
  it("estrae owner/repo/ref/path da un URL github.com/.../raw/...", () => {
    const url = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/DEU/ADM1/geoBoundaries-DEU-ADM1_simplified.geojson";
    expect(parseGithubRawUrl(url)).toEqual({
      owner: "wmgeolab", repo: "geoBoundaries", ref: "9469f09",
      path: "releaseData/gbOpen/DEU/ADM1/geoBoundaries-DEU-ADM1_simplified.geojson",
    });
  });

  it("ritorna null per un URL che non è nel formato github.com/.../raw/...", () => {
    expect(parseGithubRawUrl("https://raw.githubusercontent.com/openpolis/geojson-italy/master/x.geojson")).toBeNull();
    expect(parseGithubRawUrl("https://example.com/data.geojson")).toBeNull();
  });
});

describe("isGitLfsPointer", () => {
  it("riconosce un puntatore Git LFS", () => {
    const pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:abc123\nsize 1209873\n";
    expect(isGitLfsPointer(pointer)).toBe(true);
  });

  it("non scambia un GeoJSON reale per un puntatore LFS", () => {
    expect(isGitLfsPointer('{"type":"FeatureCollection","features":[]}')).toBe(false);
  });
});

describe("CountryMapModal — file tracciati con Git LFS (paesi con confini più grandi/complessi)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("risolve il contenuto reale da media.githubusercontent.com quando raw.githubusercontent.com ritorna solo il puntatore LFS", async () => {
    const lfsPointer = "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 123\n";
    const realBody = JSON.stringify({ type: "FeatureCollection", features: ITALY_FEATURES });
    global.fetch = vi.fn((input: any) => {
      const u = String(input);
      if (u.includes("/confini/")) return Promise.resolve({ ok: false, status: 404 } as any);
      if (u.includes("geoboundaries.org")) return Promise.resolve({ ok: true, json: async () => ({ gjDownloadURL: "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/DEU/ADM1/geoBoundaries-DEU-ADM1.geojson" }) } as any);
      if (u.includes("raw.githubusercontent.com")) return Promise.resolve({ ok: true, text: async () => lfsPointer } as any);
      if (u.includes("api.github.com")) return Promise.resolve({ ok: true, json: async () => ({ sha: "9469f09592ced973a3448cf66b6100b741b64c0d" }) } as any);
      return Promise.resolve({ ok: true, json: async () => JSON.parse(realBody) } as any); // media.githubusercontent.com
    }) as any;

    renderModal({ countryCode: "DE", countryName: "Germania" });
    await waitFor(() => expect(screen.getByText(/regioni? su 5/)).toBeInTheDocument());
    expect(chiamateDiRete()).toHaveLength(4);
    const mediaCall = chiamateDiRete()[3][0];
    expect(mediaCall).toContain("media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09592ced973a3448cf66b6100b741b64c0d/");
  });

  it("mostra errore se anche la risoluzione dell'hash completo fallisce", async () => {
    // Anche qui per indirizzo: con i mock ordinati il test passava ancora, ma
    // per la ragione sbagliata (il primo mock finiva al tentativo locale).
    global.fetch = vi.fn((input: any) => {
      const u = String(input);
      if (u.includes("/confini/")) return Promise.resolve({ ok: false, status: 404 } as any);
      if (u.includes("geoboundaries.org")) return Promise.resolve({ ok: true, json: async () => ({ gjDownloadURL: "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/x.geojson" }) } as any);
      if (u.includes("raw.githubusercontent.com")) return Promise.resolve({ ok: true, text: async () => "version https://git-lfs.github.com/spec/v1\n" } as any);
      return Promise.resolve({ ok: false, json: async () => ({}) } as any); // api.github.com fallisce
    }) as any;
    renderModal({ countryCode: "DE", countryName: "Germania" });
    await waitFor(() => expect(screen.getByText(/mappa non disponibile/i)).toBeInTheDocument());
  });
});

describe("CountryMapModal — cache persistita in localStorage tra le sessioni", () => {
  afterEach(() => vi.restoreAllMocks());

  it("dopo un fetch riuscito, una nuova sessione (cache in memoria vuota) non richiama la rete", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    const first = renderModal({ trips: [makeTrip({ region: "Lazio" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
    expect(chiamateDiRete()).toHaveLength(2);
    first.unmount();

    // Simula un nuovo caricamento di pagina: la cache in memoria si azzera,
    // ma i dati restano in localStorage dalla sessione precedente.
    __clearMemoryCache();
    global.fetch = vi.fn().mockRejectedValue(new Error("non dovrebbe essere chiamato"));

    renderModal({ trips: [makeTrip({ region: "Toscana" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
    expect(chiamateDiRete()).toHaveLength(0);
  });

  it("__clearGeoCache azzera anche i dati persistiti, non solo la cache in memoria", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    const first = renderModal({ trips: [makeTrip({ region: "Lazio" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
    first.unmount();

    __clearGeoCache();
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ trips: [makeTrip({ region: "Lazio" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
    expect(chiamateDiRete()).toHaveLength(2);
  });

  it("una cache localStorage corrotta viene ignorata e si ricade sul fetch di rete", async () => {
    localStorage.setItem("geoBoundariesCache:v2:IT", "{non è json valido");
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ trips: [makeTrip({ region: "Lazio" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
    expect(chiamateDiRete()).toHaveLength(2);
  });
});

describe("CountryMapModal — livello ADM per paese", () => {
  afterEach(() => vi.restoreAllMocks());

  it("per l'Italia scarica ADM2 (20 regioni vere), non ADM1 (5 macro-aree NUTS-1)", async () => {
    // geoBoundaries per l'Italia ha come ADM1 le 5 macro-aree statistiche
    // (Nord-Ovest, Centro, …); le 20 regioni amministrative stanno in ADM2.
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ countryCode: "IT", countryName: "Italia", trips: [] });
    await waitFor(() => expect(chiamateDiRete().length).toBeGreaterThan(0));
    const metaUrl = chiamateDiRete()[0][0];
    expect(metaUrl).toContain("/ITA/ADM2/");
    expect(metaUrl).not.toContain("/ADM1/");
  });

  it("anche la Grecia scarica ADM2 (13 periferie + Athos), non ADM1 (8 macro-gruppi)", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ countryCode: "GR", countryName: "Grecia", trips: [] });
    await waitFor(() => expect(chiamateDiRete().length).toBeGreaterThan(0));
    const metaUrl = chiamateDiRete()[0][0];
    expect(metaUrl).toContain("/GRC/ADM2/");
    expect(metaUrl).not.toContain("/ADM1/");
  });

  it("per gli altri paesi resta ADM1 (default)", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ countryCode: "DE", countryName: "Germania", trips: [] });
    await waitFor(() => expect(chiamateDiRete().length).toBeGreaterThan(0));
    const metaUrl = chiamateDiRete()[0][0];
    expect(metaUrl).toContain("/DEU/ADM1/");
  });
});

describe("CountryMapModal — abbinamento regioni greche (nome greco → traslitterazione)", () => {
  afterEach(() => vi.restoreAllMocks());

  // Nominatim restituisce le periferie greche in greco e senza codice ISO
  // ("Περιφέρεια Αττικής"); geoBoundaries ADM2 le ha traslitterate e senza ISO
  // ("Attikis"). L'abbinamento è possibile solo via l'alias table GR.
  const GREECE_FEATURES = [
    makePolygon("Attikis", ""),
    makePolygon("Kritis", ""),
    makePolygon("Kentrikis Makedonias", ""),
  ];

  it("evidenzia la periferia visitata abbinando il nome greco alla traslitterazione", async () => {
    mockGeoBoundaries(GREECE_FEATURES);
    renderModal({
      countryCode: "GR",
      countryName: "Grecia",
      trips: [makeTrip({
        country: "Grecia", country_code: "GR",
        region_details: [{ name: "Περιφέρεια Αττικής", code: null }],
      })],
    });
    await waitFor(() => expect(screen.getByText("1 regione su 3")).toBeInTheDocument());
  });

  it("non evidenzia nulla per una periferia non visitata", async () => {
    mockGeoBoundaries(GREECE_FEATURES);
    renderModal({
      countryCode: "GR",
      countryName: "Grecia",
      trips: [makeTrip({
        country: "Grecia", country_code: "GR",
        region_details: [{ name: "Περιφέρεια Κρήτης", code: null }],
      })],
    });
    // Creta è tra le 3 feature → 1 su 3 (verifica che l'alias di Creta funzioni)
    await waitFor(() => expect(screen.getByText("1 regione su 3")).toBeInTheDocument());
  });
});

// IL CASO SEGNALATO DA STEFANO: un viaggio multi-tappa che passa da Trieste
// dava "0 regioni su 20" per l'Italia. Il dato di regione (region_details)
// l'app lo calcola SOLO per la destinazione finale (Vienna), quindi le tappe
// intermedie non contavano nulla — pur facendo comparire l'Italia nell'elenco
// dei paesi, che invece usa le coordinate. Ora una regione conta come visitata
// anche se una tappa cade dentro i suoi confini.
describe("CountryMapModal — regioni riconosciute dalle TAPPE (coordinate)", () => {
  afterEach(() => vi.restoreAllMocks());

  /** Regione quadrata attorno a un punto, per distinguerle nello spazio. */
  function regioneAttorno(name: string, code: string, lon: number, lat: number) {
    return {
      type: "Feature",
      properties: { shapeName: name, shapeISO: code },
      geometry: { type: "Polygon", coordinates: [[
        [lon - 1, lat - 1], [lon + 1, lat - 1], [lon + 1, lat + 1], [lon - 1, lat + 1], [lon - 1, lat - 1],
      ]] },
    };
  }
  // Friuli attorno a Trieste (13.77, 45.65), Lazio attorno a Roma (12.5, 41.9)
  const DUE_REGIONI = [
    regioneAttorno("Friuli-Venezia Giulia", "IT-36", 13.77, 45.65),
    regioneAttorno("Lazio", "IT-62", 12.5, 41.9),
  ];

  it("una TAPPA a Trieste fa risultare visitato il Friuli", async () => {
    mockGeoBoundaries(DUE_REGIONI);
    renderModal({
      trips: [makeTrip({
        city: "Vienna", country: "Austria", country_code: "AT",
        latitude: 48.21, longitude: 16.37,          // destinazione FUORI dall'Italia
        region: null, region_details: null,          // nessun dato di regione italiano
        waypoints: [{ id: "w1", city: "Trieste", country: "Italia", country_code: "IT",
          transport_mode: "car", lat: 45.65, lon: 13.77 }],
      })],
    });
    // NB: nel caso normale i nomi delle regioni non sono scritti (si vedono
    // colorate sulla mappa); l'elenco testuale esiste solo nello stato d'errore.
    expect(await screen.findByText(/1 regione su 2/i)).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it("le regioni non toccate restano fuori dal conteggio", async () => {
    mockGeoBoundaries(DUE_REGIONI);
    renderModal({
      trips: [makeTrip({
        latitude: 45.65, longitude: 13.77, region: null, region_details: null, // Trieste come destinazione
      })],
    });
    expect(await screen.findByText(/1 regione su 2/i)).toBeInTheDocument();
    expect(screen.queryByText(/Lazio/)).not.toBeInTheDocument();
  });

  it("una tappa senza coordinate non inventa regioni", async () => {
    mockGeoBoundaries(DUE_REGIONI);
    renderModal({
      trips: [makeTrip({
        latitude: 48.21, longitude: 16.37, region: null, region_details: null,
        waypoints: [{ id: "w1", city: "Trieste", country: "Italia", country_code: "IT", transport_mode: "car" }],
      })],
    });
    expect(await screen.findByText(/0 regioni su 2/i)).toBeInTheDocument();
  });
});

// Segnalato da Stefano con la console aperta: per l'AUSTRIA il pannello
// elencava anche "Slovenia" e "Friuli-Venezia Giulia" (regioni di altri
// stati, arrivate dalle region_details di altri viaggi che toccano l'Austria),
// e diceva "Mappa non disponibile per questo paese" mentre il vero motivo era
// un 429 del servizio dei confini.
describe("CountryMapModal — quando i confini non arrivano", () => {
  afterEach(() => vi.restoreAllMocks());

  const viaggioAustria = () => makeTrip({
    country: "Austria", country_code: "AT", city: "Vienna",
    region: null, region_details: [{ name: "Vienna", code: "AT-9" }],
  });
  const viaggioItalia = () => makeTrip({
    country: "Italia", country_code: "IT", city: "Trieste",
    region: null, region_details: [{ name: "Friuli-Venezia Giulia", code: "IT-36" }],
  });

  it("elenca solo le regioni DI QUEL paese", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("boom"));
    renderModal({ countryCode: "AT", countryName: "Austria", trips: [viaggioAustria(), viaggioItalia()] });
    expect(await screen.findByText(/Regioni visitate/)).toBeInTheDocument();
    expect(screen.getByText(/Vienna/)).toBeInTheDocument();
    expect(screen.queryByText(/Friuli/)).not.toBeInTheDocument();
  });

  it("con un 429 dice che sono troppe richieste, non che il paese non è supportato", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}), text: async () => "" });
    renderModal({ countryCode: "AT", countryName: "Austria", trips: [viaggioAustria()] });
    expect(await screen.findByText(/troppe richieste/i)).toBeInTheDocument();
    expect(screen.queryByText(/non disponibile per questo paese/i)).not.toBeInTheDocument();
  });

  it("senza rete lo dice, invece di dare la colpa al paese", async () => {
    const onLine = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    renderModal({ countryCode: "AT", countryName: "Austria", trips: [viaggioAustria()] });
    expect(await screen.findByText(/senza connessione/i)).toBeInTheDocument();
    if (onLine) Object.defineProperty(window.navigator, "onLine", onLine);
  });

  it("un paese davvero non supportato mantiene il messaggio di prima", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}), text: async () => "" });
    renderModal({ countryCode: "XX", countryName: "Paese Ignoto", trips: [] });
    expect(await screen.findByText(/non disponibile per questo paese/i)).toBeInTheDocument();
  });

  // "Riprova tra qualche minuto" senza un pulsante per riprovare: la sola
  // strada era chiudere e riaprire il pannello.
  it("il pulsante Riprova ricarica davvero, e al secondo giro la mappa compare", async () => {
    let primoGiro = true;
    global.fetch = vi.fn((input: any) => {
      const u = String(input);
      if (u.includes("/confini/")) return Promise.resolve({ ok: false, status: 404 } as any);
      if (primoGiro) return Promise.resolve({ ok: false, status: 429, json: async () => ({}), text: async () => "" } as any);
      if (u.includes("geoboundaries.org")) return Promise.resolve({ ok: true, json: async () => ({ simplifiedGeometryGeoJSON: "https://fake/geo.json" }) } as any);
      return Promise.resolve({ ok: true, text: async () => JSON.stringify({ type: "FeatureCollection", features: AUSTRIA_FEATURES }) } as any);
    }) as any;
    renderModal({ countryCode: "AT", countryName: "Austria", trips: [viaggioAustria()] });
    const bottone = await screen.findByRole("button", { name: "Riprova" });
    primoGiro = false;
    fireEvent.click(bottone);
    await waitFor(() => expect(screen.getByText("1 regione su 9")).toBeInTheDocument());
    expect(screen.queryByText(/troppe richieste/i)).not.toBeInTheDocument();
  });

  it("su un paese senza suddivisioni il pulsante non compare: insistere non cambia nulla", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}), text: async () => "" });
    renderModal({ countryCode: "XX", countryName: "Paese Ignoto", trips: [] });
    expect(await screen.findByText(/non disponibile per questo paese/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Riprova" })).not.toBeInTheDocument();
  });

  // Il filtro per paese non deve mangiarsi le regioni dei viaggi più vecchi:
  // senza codice ISO E senza country_code non c'è nulla che dica che siano di
  // un altro stato, e prima venivano scartate.
  it("una regione senza codice, su un viaggio senza paese, resta nell'elenco", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("boom"));
    const vecchio = makeTrip({ country: "", country_code: "", city: "Vienna", region: "Wien", region_details: null });
    renderModal({ countryCode: "AT", countryName: "Austria", trips: [vecchio] });
    expect(await screen.findByText(/Regioni visitate/)).toBeInTheDocument();
    expect(screen.getByText(/Wien/)).toBeInTheDocument();
  });
});

// I confini che ospitiamo noi (public/confini/<ISO2>.json, generati con
// `npm run confini`): servono a togliere di mezzo i limiti di richieste dei
// servizi di terzi, che oggi bloccano la mappa dopo una decina di aperture.
describe("CountryMapModal — confini ospitati da noi", () => {
  afterEach(() => vi.restoreAllMocks());

  /** Il pacchetto locale con dentro i paesi indicati nel manifest. */
  function mockPacchettoLocale(paesi: string[], features: any[] = ITALY_FEATURES) {
    global.fetch = vi.fn((input: any) => {
      const u = String(input);
      if (u.includes("/confini/index.json")) return Promise.resolve({ ok: true, json: async () => ({ paesi }) } as any);
      if (/\/confini\/[A-Z]{2}\.json/.test(u)) return Promise.resolve({ ok: true, json: async () => ({ type: "FeatureCollection", features }) } as any);
      return Promise.reject(new Error("la rete non doveva servire"));
    }) as any;
  }

  it("se il paese è nel pacchetto locale, NON tocca la rete", async () => {
    mockPacchettoLocale(["IT"]);
    renderModal({ countryCode: "IT", trips: [makeTrip({ region: "Lazio" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
    expect(chiamateDiRete()).toHaveLength(0);
  });

  // I confini locali NON vanno duplicati in localStorage: sono già serviti dal
  // nostro dominio e cacheati dal service worker, e quello spazio (5 MB in
  // tutto) è lo stesso in cui vivono i viaggi. Bastavano pochi paesi pesanti
  // per riempirlo e non poter più salvare un viaggio.
  it("i confini del pacchetto locale non finiscono in localStorage", async () => {
    mockPacchettoLocale(["IT"]);
    renderModal({ countryCode: "IT", trips: [makeTrip({ region: "Lazio" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
    expect(localStorage.getItem("geoBoundariesCache:v2:IT")).toBeNull();
  });

  // La copia di rete PREGRESSA: chi aveva già scaricato un paese prima che
  // entrasse nel pacchetto locale se la teneva per sempre (la copia persistita
  // veniva letta prima del pacchetto). Ora il locale vince e libera i KB nello
  // spazio condiviso coi viaggi.
  it("quando il paese entra nel pacchetto, la copia pregressa in localStorage viene liberata", async () => {
    localStorage.setItem("geoBoundariesCache:v2:IT", JSON.stringify(ITALY_FEATURES));
    mockPacchettoLocale(["IT"]);
    renderModal({ countryCode: "IT", trips: [makeTrip({ region: "Lazio" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
    expect(localStorage.getItem("geoBoundariesCache:v2:IT")).toBeNull();
    // e i confini usati sono quelli del pacchetto, non la copia vecchia
    const locale = (fetch as any).mock.calls.some((c: any[]) => /\/confini\/IT\.json/.test(String(c[0])));
    expect(locale).toBe(true);
  });

  it("i confini presi dalla rete invece sì: risparmiano un fetch limitato", async () => {
    mockGeoBoundaries(ITALY_FEATURES);
    renderModal({ countryCode: "IT", trips: [makeTrip({ region: "Lazio" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
    expect(localStorage.getItem("geoBoundariesCache:v2:IT")).not.toBeNull();
  });

  // Senza manifest ogni apertura di un paese non incluso sparava un 404.
  it("un paese fuori dal manifest non viene nemmeno chiesto al pacchetto locale", async () => {
    global.fetch = vi.fn((input: any) => {
      const u = String(input);
      if (u.includes("/confini/index.json")) return Promise.resolve({ ok: true, json: async () => ({ paesi: ["IT"] }) } as any);
      if (u.includes("geoboundaries.org")) return Promise.resolve({ ok: true, json: async () => ({ simplifiedGeometryGeoJSON: "https://fake/geo.json" }) } as any);
      return Promise.resolve({ ok: true, text: async () => JSON.stringify({ type: "FeatureCollection", features: AUSTRIA_FEATURES }) } as any);
    }) as any;
    renderModal({ countryCode: "AT", countryName: "Austria", trips: [] });
    await waitFor(() => expect(screen.getByText(/regioni? su 9/)).toBeInTheDocument());
    const chiamate = (fetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(chiamate.some((u: string) => /\/confini\/AT\.json/.test(u))).toBe(false);
  });

  it("il manifest si legge una volta sola, non a ogni apertura", async () => {
    mockPacchettoLocale(["IT"]);
    const primo = renderModal({ countryCode: "IT", trips: [] });
    await waitFor(() => expect(screen.getByText(/su 5/)).toBeInTheDocument());
    primo.unmount();
    __clearMemoryCache();
    renderModal({ countryCode: "IT", trips: [] });
    await waitFor(() => expect(screen.getByText(/su 5/)).toBeInTheDocument());
    const manifest = (fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes("index.json"));
    expect(manifest).toHaveLength(1);
  });

  it("se il paese NON è nel pacchetto, ricade sulla rete come prima", async () => {
    mockGeoBoundaries(AUSTRIA_FEATURES);   // il finto /confini/ risponde 404
    renderModal({ countryCode: "AT", countryName: "Austria", trips: [] });
    await waitFor(() => expect(screen.getByText(/regioni? su 9/)).toBeInTheDocument());
    expect(chiamateDiRete().length).toBeGreaterThan(0);
  });

  // Stessa trappola di loadGis: un fallimento in cache resta per sempre. Se
  // l'app parte offline il manifest non arriva, e cachearne il fallimento
  // vorrebbe dire ignorare per tutta la sessione un pacchetto locale che il
  // service worker avrebbe in cache.
  it("un manifest caduto per errore di rete viene richiesto di nuovo alla prossima apertura", async () => {
    let manifestRotto = true;
    global.fetch = vi.fn((input: any) => {
      const u = String(input);
      if (u.includes("/confini/index.json")) {
        return manifestRotto
          ? Promise.reject(new Error("offline"))
          : Promise.resolve({ ok: true, json: async () => ({ paesi: ["IT"] }) } as any);
      }
      if (/\/confini\/IT\.json/.test(u)) return Promise.resolve({ ok: true, json: async () => ({ type: "FeatureCollection", features: ITALY_FEATURES }) } as any);
      if (u.includes("geoboundaries.org")) return Promise.resolve({ ok: true, json: async () => ({ simplifiedGeometryGeoJSON: "https://fake/geo.json" }) } as any);
      return Promise.resolve({ ok: true, text: async () => JSON.stringify({ type: "FeatureCollection", features: ITALY_FEATURES }) } as any);
    }) as any;

    const primo = renderModal({ countryCode: "IT", trips: [] });
    await waitFor(() => expect(screen.getByText(/su 5/)).toBeInTheDocument());
    primo.unmount();

    manifestRotto = false;
    __clearMemoryCache();
    __clearGeoCache();
    renderModal({ countryCode: "IT", trips: [makeTrip({ region: "Lazio" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
    const chiamate = (fetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(chiamate.filter((u: string) => u.includes("index.json"))).toHaveLength(2);
    // e al secondo giro il pacchetto locale è tornato utilizzabile
    expect(chiamate.some((u: string) => /\/confini\/IT\.json/.test(u))).toBe(true);
  });

  it("un manifest assente (404) invece non si richiede più: è una risposta definitiva", async () => {
    global.fetch = vi.fn((input: any) => {
      const u = String(input);
      if (u.includes("/confini/")) return Promise.resolve({ ok: false, status: 404 } as any);
      if (u.includes("geoboundaries.org")) return Promise.resolve({ ok: true, json: async () => ({ simplifiedGeometryGeoJSON: "https://fake/geo.json" }) } as any);
      return Promise.resolve({ ok: true, text: async () => JSON.stringify({ type: "FeatureCollection", features: ITALY_FEATURES }) } as any);
    }) as any;
    const primo = renderModal({ countryCode: "IT", trips: [] });
    await waitFor(() => expect(screen.getByText(/su 5/)).toBeInTheDocument());
    primo.unmount();
    __clearMemoryCache();
    __clearGeoCache();
    renderModal({ countryCode: "IT", trips: [] });
    await waitFor(() => expect(screen.getByText(/su 5/)).toBeInTheDocument());
    const manifest = (fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes("index.json"));
    expect(manifest).toHaveLength(1);
  });

  it("un file locale corrotto non blocca nulla: si va in rete", async () => {
    global.fetch = vi.fn((input: any) => {
      const u = String(input);
      if (u.includes("/confini/index.json")) return Promise.resolve({ ok: true, json: async () => ({ paesi: ["IT"] }) } as any);
      if (u.includes("/confini/")) return Promise.resolve({ ok: true, json: async () => { throw new Error("json rotto"); } } as any);
      if (u.includes("geoboundaries.org")) return Promise.resolve({ ok: true, json: async () => ({ simplifiedGeometryGeoJSON: "https://fake/geo.json" }) } as any);
      return Promise.resolve({ ok: true, text: async () => JSON.stringify({ type: "FeatureCollection", features: ITALY_FEATURES }) } as any);
    }) as any;
    renderModal({ countryCode: "IT", trips: [makeTrip({ region: "Lazio" })] });
    await waitFor(() => expect(screen.getByText("1 regione su 5")).toBeInTheDocument());
  });
});
