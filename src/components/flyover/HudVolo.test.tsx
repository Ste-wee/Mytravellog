import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { HudVolo } from "./HudVolo";
import type { StatoVolo } from "./tipi";

/**
 * Pausa e Riprendi si scambiano lo stesso posto. Quando il bottone è stato
 * spostato in questo componente, `"pausa"` è diventato `"onPausa"` per una
 * sostituzione di nomi andata troppo in là: in pausa restava «Pausa» e il volo
 * non ripartiva più (solo Salta lo sbloccava).
 */
const hud = (volo: StatoVolo) => {
  const fatti = { onPausa: vi.fn(), onRiprendi: vi.fn(), onSalta: vi.fn() };
  render(<HudVolo contatoreRef={createRef<HTMLSpanElement>()} contatore="12 / 340 km" titoloVisibile={false}
    posterTitle="Prova" dateRangeLabel={null} volo={volo} {...fatti} />);
  return fatti;
};

describe("HudVolo — Pausa e Riprendi", () => {
  it("in volo c'è «Pausa», e mette in pausa", () => {
    const f = hud("inVolo");
    expect(screen.queryByRole("button", { name: /Riprendi/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Pausa/ }));
    expect(f.onPausa).toHaveBeenCalledTimes(1);
    expect(f.onRiprendi).not.toHaveBeenCalled();
  });

  it("in pausa c'è «Riprendi», e riprende", () => {
    const f = hud("pausa");
    expect(screen.queryByRole("button", { name: /Pausa/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Riprendi/ }));
    expect(f.onRiprendi).toHaveBeenCalledTimes(1);
    expect(f.onPausa).not.toHaveBeenCalled();
  });

  it("Salta c'è sempre, in volo e in pausa", () => {
    for (const v of ["inVolo", "pausa"] as const) {
      const f = hud(v);
      fireEvent.click(screen.getAllByRole("button", { name: /Salta/ }).at(-1)!);
      expect(f.onSalta).toHaveBeenCalledTimes(1);
    }
  });
});
