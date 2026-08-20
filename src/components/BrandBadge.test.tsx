import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BrandBadge, BrandBadgeSlot } from "./BrandBadge";

/**
 * La firma "By 🐻" c'è ovunque TRANNE in Home: lì costava esattamente lo
 * scroll della pagina (916px di contenuto su 844 di schermo) e il marchio è
 * già nell'header, quindi era la seconda firma della stessa schermata.
 */
const logo = (c: HTMLElement) => c.querySelector('img[src*="logo-orsi"]');

describe("BrandBadgeSlot — dove compare la firma", () => {
  it("in Home non rende nulla", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}><BrandBadgeSlot /></MemoryRouter>
    );
    expect(logo(container)).toBeNull();
  });

  it.each(["/statistiche", "/miei-viaggi", "/impostazioni", "/in-programma"])(
    "in %s la firma c'è", (rotta) => {
      const { container } = render(
        <MemoryRouter initialEntries={[rotta]}><BrandBadgeSlot /></MemoryRouter>
      );
      expect(logo(container)).not.toBeNull();
    });

  // Lo slot conosce le rotte, la firma no: BrandBadge resta montabile da solo
  // (lo usano gli export/snapshot, che non vivono dentro un Router).
  it("BrandBadge da solo non ha bisogno di un Router", () => {
    const { container } = render(<BrandBadge />);
    expect(logo(container)).not.toBeNull();
  });
});
