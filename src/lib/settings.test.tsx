import { describe, it, expect, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import {
  SettingsProvider,
  useSettings,
  parseStoredSettings,
  fmtNumber,
  fmtDistance,
  fmtAltitude,
  fmtTemp,
  MARKER_SCALE_MIN,
  MARKER_SCALE_MAX,
  type Settings,
} from "./settings";

const KEY = "atlas.settings.v1";

let captured: ReturnType<typeof useSettings> | null = null;
function Probe() {
  captured = useSettings();
  return null;
}
function mount() {
  captured = null;
  render(
    <SettingsProvider>
      <Probe />
    </SettingsProvider>
  );
  return captured!;
}

describe("settings — minMarkerScale / maxMarkerScale", () => {
  beforeEach(() => localStorage.clear());

  it("espone i default corretti", () => {
    const s = mount();
    expect(s.minMarkerScale).toBe(0.3);   // preset "Piccoli"
    expect(s.maxMarkerScale).toBe(0.7);
  });

  it("aggiorna min/max e li persiste in localStorage", () => {
    const s = mount();
    act(() => {
      s.setMinMarkerScale(0.7);
      s.setMaxMarkerScale(1.5);
    });
    expect(captured!.minMarkerScale).toBe(0.7);
    expect(captured!.maxMarkerScale).toBe(1.5);

    const stored = JSON.parse(localStorage.getItem(KEY)!) as Settings;
    expect(stored.minMarkerScale).toBe(0.7);
    expect(stored.maxMarkerScale).toBe(1.5);
  });

  it("clampa i valori fuori range", () => {
    const s = mount();
    act(() => {
      s.setMinMarkerScale(-5);
      s.setMaxMarkerScale(999);
    });
    expect(captured!.minMarkerScale).toBe(MARKER_SCALE_MIN);
    expect(captured!.maxMarkerScale).toBe(MARKER_SCALE_MAX);
  });

  it("clampa NaN a un default sicuro", () => {
    const s = mount();
    act(() => s.setMinMarkerScale(Number.NaN));
    expect(Number.isFinite(captured!.minMarkerScale)).toBe(true);
    expect(captured!.minMarkerScale).toBeGreaterThanOrEqual(MARKER_SCALE_MIN);
  });

  it("reidrata i valori salvati al reload", () => {
    const stored: Settings = {
      distanceUnit: "imperial",
      temperatureUnit: "fahrenheit",
      autoRotate: "off",
      homeCity: null,
      minMarkerScale: 0.8,
      maxMarkerScale: 1.6,
    };
    localStorage.setItem(KEY, JSON.stringify(stored));
    const s = mount();
    expect(s.minMarkerScale).toBe(0.8);
    expect(s.maxMarkerScale).toBe(1.6);
    expect(s.distanceUnit).toBe("imperial");
  });
});

describe("parseStoredSettings — compatibilità retroattiva", () => {
  it("ritorna i default con raw null", () => {
    const s = parseStoredSettings(null);
    expect(s.minMarkerScale).toBe(0.3);
    expect(s.maxMarkerScale).toBe(0.7);
  });

  it("fonde payload legacy senza campi marker con i default", () => {
    const legacy = JSON.stringify({ distanceUnit: "imperial", temperatureUnit: "celsius" });
    const s = parseStoredSettings(legacy);
    expect(s.distanceUnit).toBe("imperial");
    expect(s.minMarkerScale).toBe(0.3);
    expect(s.maxMarkerScale).toBe(0.7);
  });

  it("preserva i valori marker scale quando presenti", () => {
    const raw = JSON.stringify({ minMarkerScale: 0.9, maxMarkerScale: 1.4 });
    const s = parseStoredSettings(raw);
    expect(s.minMarkerScale).toBe(0.9);
    expect(s.maxMarkerScale).toBe(1.4);
  });

  it("ritorna i default su JSON malformato", () => {
    const s = parseStoredSettings("{not json");
    expect(s.minMarkerScale).toBe(0.3);
    expect(s.maxMarkerScale).toBe(0.7);
  });
});

// Il separatore delle migliaia SEMPRE, anche a 4 cifre: l'it-IT di CLDR non
// raggruppa i numeri a 4 cifre (toLocaleString("it-IT") dà "4419"), e i totali
// dell'app stanno quasi sempre lì — sembrava che il separatore non ci fosse.
describe("fmtNumber / fmtDistance / fmtAltitude — separatore delle migliaia", () => {
  it("raggruppa anche i numeri a 4 cifre (dove toLocaleString it-IT non lo fa)", () => {
    expect(fmtNumber(4419)).toBe("4.419");
    expect(fmtNumber(787)).toBe("787");
    expect(fmtNumber(10193)).toBe("10.193");
  });

  it("fmtDistance e fmtAltitude lo ereditano, in entrambe le unità", () => {
    expect(fmtDistance(4419, "metric")).toBe("4.419 km");
    expect(fmtDistance(10000, "imperial")).toBe("6.214 mi");
    expect(fmtAltitude(8848, "metric")).toBe("8.848 m");
    expect(fmtAltitude(3466, "imperial")).toBe("11.371 ft");
  });
});

// Temperature: niente ".0" di rumore, e il decimale vero si scrive con la
// VIRGOLA (il vecchio toFixed(1) dava "24.0°C" col punto, sempre).
describe("fmtTemp — decimale solo quando esiste, virgola all'italiana", () => {
  it("intero → senza decimale", () => {
    expect(fmtTemp(24, "celsius")).toBe("24°C");
    expect(fmtTemp(0, "celsius")).toBe("0°C");
    expect(fmtTemp(-5, "celsius")).toBe("-5°C");
  });
  it("decimale vero → con la virgola", () => {
    expect(fmtTemp(18.5, "celsius")).toBe("18,5°C");
    expect(fmtTemp(24, "fahrenheit")).toBe("75,2°F"); // 75.2 esatti
  });
  it("il fahrenheit intero resta senza decimale", () => {
    expect(fmtTemp(25, "fahrenheit")).toBe("77°F");
  });
  it("null → em dash come le altre fmt", () => {
    expect(fmtTemp(null, "celsius")).toBe("—");
  });
});
