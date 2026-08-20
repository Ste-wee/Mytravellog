import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaceSearch } from "./usePlaceSearch";
import { searchPlaces, searchAnyPlace, GeoResult } from "./geo";

vi.mock("./geo", () => ({
  searchPlaces: vi.fn(async () => []),
  searchAnyPlace: vi.fn(async () => []),
}));

const posto = (name: string): GeoResult =>
  ({ id: 1, name, country: "Italia", country_code: "IT", latitude: 45, longitude: 9 });

describe("usePlaceSearch — l'unica ricerca dell'app", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(searchPlaces).mockReset().mockResolvedValue([]);
    vi.mocked(searchAnyPlace).mockReset().mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it("aspetta il debounce prima di interrogare la rete", async () => {
    vi.mocked(searchPlaces).mockResolvedValue([posto("Milano")]);
    const { result, rerender } = renderHook(({ q }) => usePlaceSearch(q), { initialProps: { q: "Mil" } });
    expect(searchPlaces).not.toHaveBeenCalled();      // il timer non è scaduto
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(searchPlaces).toHaveBeenCalledTimes(1);
    expect(result.current.results.map(r => r.name)).toEqual(["Milano"]);
    // digitare di nuovo riparte da capo, una chiamata sola
    rerender({ q: "Mila" });
    rerender({ q: "Milan" });
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(searchPlaces).toHaveBeenCalledTimes(2);
    expect(searchPlaces).toHaveBeenLastCalledWith("Milan");
  });

  it("sotto i 2 caratteri niente rete e lista vuota", async () => {
    const { result } = renderHook(({ q }) => usePlaceSearch(q), { initialProps: { q: "M" } });
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(searchPlaces).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("la risposta VECCHIA arrivata in ritardo non sovrascrive quella nuova", async () => {
    // È la ragione d'essere della guardia: due risposte fuori ordine.
    const inVolo = new Map<string, (r: GeoResult[]) => void>();
    vi.mocked(searchPlaces).mockImplementation((q: string) =>
      new Promise(res => inVolo.set(q, res)));
    const { result, rerender } = renderHook(({ q }) => usePlaceSearch(q), { initialProps: { q: "Roma" } });
    await act(() => vi.advanceTimersByTimeAsync(310)); // parte la fetch "Roma"
    rerender({ q: "Rovigo" });
    await act(() => vi.advanceTimersByTimeAsync(310)); // parte la fetch "Rovigo"
    // arriva PRIMA la nuova, POI la vecchia
    await act(async () => { inVolo.get("Rovigo")!([posto("Rovigo")]); });
    await act(async () => { inVolo.get("Roma")!([posto("Roma")]); });
    expect(result.current.results.map(r => r.name)).toEqual(["Rovigo"]);
  });

  it("luoghi:true passa dalla ricerca a due fonti, e il limite taglia", async () => {
    vi.mocked(searchAnyPlace).mockResolvedValue([posto("A"), posto("B"), posto("C")]);
    const { result } = renderHook(() => usePlaceSearch("Garda", { luoghi: true, limite: 2 }));
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(searchAnyPlace).toHaveBeenCalledWith("Garda", 6, expect.any(Function));
    expect(searchPlaces).not.toHaveBeenCalled();
    expect(result.current.results).toHaveLength(2);
  });

  it("la query uguale a `ignora` (etichetta già scelta) non riapre la lista", async () => {
    const { result } = renderHook(() => usePlaceSearch("Milano, Italia", { ignora: "Milano, Italia" }));
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(searchPlaces).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  it("clear() chiude la lista senza toccare la query", async () => {
    vi.mocked(searchPlaces).mockResolvedValue([posto("Milano")]);
    const { result } = renderHook(() => usePlaceSearch("Milano"));
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(result.current.results).toHaveLength(1);
    act(() => result.current.clear());
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("lo spinner si accende subito e si spegne alla risposta", async () => {
    vi.mocked(searchPlaces).mockResolvedValue([posto("Milano")]);
    const { result } = renderHook(() => usePlaceSearch("Milano"));
    expect(result.current.loading).toBe(true);        // già durante il debounce
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(result.current.loading).toBe(false);
  });
});

describe("usePlaceSearch — città subito, luoghi quando arrivano", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(searchAnyPlace).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("i parziali (città) compaiono mentre i luoghi sono ancora in volo", async () => {
    let liberaTotale: (r: GeoResult[]) => void = () => {};
    vi.mocked(searchAnyPlace).mockImplementation(async (q, count, onParziale) => {
      onParziale?.([posto("Trevi")]);                       // le città, subito
      return new Promise(res => { liberaTotale = res; });   // il totale, dopo
    });
    const { result } = renderHook(() => usePlaceSearch("Trevi", { luoghi: true }));
    await act(() => vi.advanceTimersByTimeAsync(350));
    // città visibili, spinner ancora acceso: la lista si completerà da sola
    expect(result.current.results.map(r => r.name)).toEqual(["Trevi"]);
    expect(result.current.loading).toBe(true);
    await act(async () => { liberaTotale([posto("Trevi"), posto("Fontana di Trevi")]); });
    expect(result.current.results.map(r => r.name)).toEqual(["Trevi", "Fontana di Trevi"]);
    expect(result.current.loading).toBe(false);
  });
});
