import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CloudSection } from "./CloudSection";
import type { CloudStatus } from "@/lib/cloudContext";

const stato = {
  status: "guest" as CloudStatus, email: null as string | null,
  lastSyncAt: null as number | null, errorMsg: null as string | null,
  configurato: true, connect: vi.fn(), disconnect: vi.fn(),
};
vi.mock("@/lib/cloudContext", () => ({ useCloud: () => stato }));

describe("CloudSection — gli stati che si devono vedere", () => {
  beforeEach(() => {
    Object.assign(stato, { status: "guest", email: null, lastSyncAt: null, errorMsg: null, configurato: true });
  });

  it("non configurato: lo dice, senza bottone", () => {
    stato.configurato = false;
    render(<CloudSection/>);
    expect(screen.getByText(/non è ancora configurato/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  // Il difetto trovato dal vivo chiudendo il popup: l'annullamento torna a
  // guest col suo messaggio, e la sezione lo mostrava solo in stato "error" —
  // il messaggio esisteva ma non si vedeva mai.
  it("accesso annullato (guest + messaggio): il messaggio SI VEDE", () => {
    stato.errorMsg = "Accesso annullato.";
    render(<CloudSection/>);
    expect(screen.getByRole("alert").textContent).toContain("Accesso annullato.");
    expect(screen.getByRole("button", { name: /Accedi con Google/ })).toBeTruthy();
  });

  it("backup corrotto: avviso e NESSUN bottone che possa scriverci sopra", () => {
    stato.status = "corrotto";
    stato.errorMsg = "Il backup nel cloud è illeggibile.";
    render(<CloudSection/>);
    expect(screen.getByRole("alert").textContent).toContain("illeggibile");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("connesso: email, ultima sincronizzazione e Disconnetti", () => {
    stato.status = "connected";
    stato.email = "s@x.it";
    stato.lastSyncAt = Date.now() - 5000;
    render(<CloudSection/>);
    expect(screen.getByText("s@x.it")).toBeTruthy();
    expect(screen.getByText(/pochi secondi fa/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Disconnetti/ })).toBeTruthy();
  });
});
