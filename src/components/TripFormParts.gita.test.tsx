import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TripFormFields, TripFormActions } from "./TripFormParts";
import { eGitaInGiornata } from "@/lib/gite";

/**
 * Il modo GITA del form (2026-08-26). Stefano: le gite «non credo vadano
 * trattate come veri e propri viaggi… non sono convinto vadano creati uguali».
 *
 * ⚠️ Il punto di questi test è che la scorciatoia cambia il FORM e NON il
 * modello: la gita resta un viaggio con partenza uguale al ritorno, e
 * `eGitaInGiornata` continua a dedurlo dalle date. Se un domani qualcuno
 * aggiungesse un campo "tipo: gita" nel dato, avremmo due fonti che possono
 * contraddirsi — l'ultimo test qui sotto è la sentinella di quella scelta.
 */
const campi = (unGiornoSolo: boolean, dateEnd: string) => (
  <MemoryRouter>
    <TripFormFields
      title="" setTitle={() => {}}
      dateStart="2026-11-14" setDateStart={() => {}}
      dateEnd={dateEnd} setDateEnd={() => {}}
      rating={0} setRating={() => {}}
      unGiornoSolo={unGiornoSolo}
    />
  </MemoryRouter>
);

describe("TripFormFields — modo gita: una data sola", () => {
  it("in modo gita c'è UN campo data e nessun ritorno da compilare", () => {
    render(campi(true, "2026-11-14"));
    expect(document.querySelectorAll('input[type="date"]').length).toBe(1);
    expect(screen.queryByText("Ritorno")).toBeNull();
    expect(screen.getByText("Giorno")).toBeInTheDocument();
    expect(screen.queryByText("Periodo")).toBeNull();
  });

  it("in modo gita non c'è la sottoetichetta «Partenza»: il riquadro dice già Giorno", () => {
    render(campi(true, "2026-11-14"));
    expect(screen.queryByText("Partenza")).toBeNull();
  });

  it("in modo gita spiega perché non chiede il ritorno", () => {
    render(campi(true, "2026-11-14"));
    expect(screen.getByText("Parti e torni lo stesso giorno.")).toBeInTheDocument();
  });

  it("il form normale resta con DUE date, partenza e ritorno", () => {
    render(campi(false, ""));
    expect(document.querySelectorAll('input[type="date"]').length).toBe(2);
    expect(screen.getByText("Partenza")).toBeInTheDocument();
    expect(screen.getByText("Ritorno")).toBeInTheDocument();
    expect(screen.getByText("Periodo")).toBeInTheDocument();
  });

  it("in modo gita la durata non si mostra: un giorno è la definizione, non un dato", () => {
    render(campi(true, "2026-11-14"));
    expect(screen.queryByText("Durata")).toBeNull();
  });

  it("il bottone di salvataggio dice «Salva gita»", () => {
    render(
      <MemoryRouter>
        <TripFormActions saving={false} confirmDiscard={() => {}} onSave={() => {}} unGiornoSolo />
      </MemoryRouter>
    );
    expect(screen.getByText("Salva gita")).toBeInTheDocument();
  });

  it("SENTINELLA: la gita la dicono le DATE, non un campo nel dato", () => {
    // È l'unico contratto che conta fra il form e il resto dell'app: la
    // scorciatoia deve produrre partenza = ritorno, e da lì in poi nessuno ha
    // bisogno di sapere da quale bottone è nato il viaggio.
    expect(eGitaInGiornata({ trip_date: "2026-11-14", date_end: "2026-11-14" })).toBe(true);
    expect(eGitaInGiornata({ trip_date: "2026-11-14", date_end: "2026-11-16" })).toBe(false);
    // Ritorno non compilato = durata sconosciuta, non gita: se il modo gita
    // dimenticasse di scrivere il ritorno, la gita non risulterebbe tale.
    expect(eGitaInGiornata({ trip_date: "2026-11-14", date_end: null })).toBe(false);
  });
});
