import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GlobePlacePicker } from "./GlobePlacePicker";
import type { CityInfo } from "./WorldMap";

// Il globo vero è WebGL: in jsdom si sostituisce con un bottone che simula
// il tocco su un punto, restituendo lo stesso CityInfo del reverse geocoding.
const TOCCATO: CityInfo = {
  name: "Dores", country: "Regno Unito", country_code: "GB",
  latitude: 57.234, longitude: -4.432, tier: 1,
};
vi.mock("./WorldMap", () => ({
  WorldMap: ({ onSelectCity }: { onSelectCity?: (c: CityInfo) => void }) => (
    <button onClick={() => onSelectCity?.({
      name: "Dores", country: "Regno Unito", country_code: "GB",
      latitude: 57.234, longitude: -4.432, tier: 1,
    })}>Simula tocco sul globo</button>
  ),
}));

// StarField disegna su canvas e osserva il contenitore: in jsdom niente
// ResizeObserver, e il cielo non è ciò che stiamo provando qui.
vi.mock("./StarField", () => ({ StarField: () => null }));

const tocca = () => fireEvent.click(screen.getByText("Simula tocco sul globo"));

describe("GlobePlacePicker — scegliere una tappa toccando il globo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prima del tocco non propone nulla: niente aggiunte alla cieca", () => {
    render(<GlobePlacePicker onClose={vi.fn()} onPick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Aggiungi tappa" })).toBeNull();
    expect(screen.getByText(/Ruota il globo e tocca un punto/)).toBeInTheDocument();
  });

  it("il tocco propone il posto trovato, e confermando diventa una tappa", () => {
    const onPick = vi.fn(); const onClose = vi.fn();
    render(<GlobePlacePicker onClose={onClose} onPick={onPick} />);
    tocca();
    expect((screen.getByLabelText("Nome della tappa") as HTMLInputElement).value).toBe("Dores");
    expect(screen.getByText(/Regno Unito/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi tappa" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    const r = onPick.mock.calls[0][0];
    expect(r).toMatchObject({ name: "Dores", country: "Regno Unito", country_code: "GB" });
    expect(r.latitude).toBeCloseTo(TOCCATO.latitude, 3);
    expect(r.longitude).toBeCloseTo(TOCCATO.longitude, 3);
    expect(r.id).toBeLessThan(0);          // non collide con gli id del geocoder
    expect(onClose).toHaveBeenCalled();     // il picker si chiude da solo
  });

  it("il nome si può correggere prima di aggiungere", () => {
    const onPick = vi.fn();
    render(<GlobePlacePicker onClose={vi.fn()} onPick={onPick} />);
    tocca();
    fireEvent.change(screen.getByLabelText("Nome della tappa"), { target: { value: "Loch Ness" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi tappa" }));
    expect(onPick.mock.calls[0][0]).toMatchObject({ name: "Loch Ness", country_code: "GB" });
  });

  it("un nome svuotato non si può confermare", () => {
    render(<GlobePlacePicker onClose={vi.fn()} onPick={vi.fn()} />);
    tocca();
    fireEvent.change(screen.getByLabelText("Nome della tappa"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Aggiungi tappa" })).toBeDisabled();
  });

  it("'Scegli un altro punto' torna al globo senza aggiungere", () => {
    const onPick = vi.fn();
    render(<GlobePlacePicker onClose={vi.fn()} onPick={onPick} />);
    tocca();
    fireEvent.click(screen.getByRole("button", { name: "Scegli un altro punto" }));
    expect(screen.queryByRole("button", { name: "Aggiungi tappa" })).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("Esc: prima annulla la conferma, poi chiude il picker", () => {
    const onClose = vi.fn();
    render(<GlobePlacePicker onClose={onClose} onPick={vi.fn()} />);
    tocca();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Aggiungi tappa" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();      // il primo Esc NON chiude tutto
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("vive in un portale sul body: fixed dentro una card con transform si ancorerebbe alla card", () => {
    const { container } = render(<GlobePlacePicker onClose={vi.fn()} onPick={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
