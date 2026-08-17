import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React from "react";

// Il modulo googleDrive è mockato per intero: qui si testa la MACCHINA A
// STATI del contesto (guest → connecting → connected/expired/error), non
// l'I/O col Drive (che ha i suoi test in googleDrive.io.test.ts).
const mocks = vi.hoisted(() => ({
  requestAccessToken: vi.fn(),
  revokeAccessToken: vi.fn(),
  fetchUserEmail: vi.fn(async () => "ste@example.com"),
  readBackup: vi.fn(async () => null),
  writeBackup: vi.fn(async () => {}),
  mergeTrips: vi.fn((locali: unknown[]) => locali),
  clearDriveCache: vi.fn(),
}));
vi.mock("@/lib/googleDrive", () => ({ BACKUP_VERSION: 1, ...mocks }));

import { GoogleDriveProvider, useGoogleDrive } from "./googleDriveContext";

function Sonda() {
  const { status, email, connect, disconnect, errorMsg } = useGoogleDrive();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="email">{email ?? "—"}</div>
      <div data-testid="err">{errorMsg ?? "—"}</div>
      <button onClick={connect}>collega</button>
      <button onClick={disconnect}>scollega</button>
    </div>
  );
}

const renderCtx = () => render(<GoogleDriveProvider><Sonda /></GoogleDriveProvider>);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.fetchUserEmail.mockResolvedValue("ste@example.com");
  mocks.readBackup.mockResolvedValue(null);
});

describe("GoogleDriveProvider — macchina a stati", () => {
  it("senza flag salvato parte da guest", () => {
    renderCtx();
    expect(screen.getByTestId("status").textContent).toBe("guest");
  });

  it("connect ANNULLATO (nessun token): resta guest e lo dice, senza flag salvato", async () => {
    mocks.requestAccessToken.mockRejectedValue(new Error("popup chiuso"));
    renderCtx();
    await act(async () => { screen.getByText("collega").click(); });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("guest"));
    expect(screen.getByTestId("err").textContent).toMatch(/annullata|non riuscita/i);
    expect(localStorage.getItem("navta.drive.connected")).toBeNull();
  });

  it("connect riuscito: flag scritto, email mostrata, primo sync fatto", async () => {
    mocks.requestAccessToken.mockResolvedValue({ token: "tok", expiresIn: 3600 });
    renderCtx();
    await act(async () => { screen.getByText("collega").click(); });
    await waitFor(() => expect(screen.getByTestId("email").textContent).toBe("ste@example.com"));
    expect(localStorage.getItem("navta.drive.connected")).toBe("1");
    expect(mocks.readBackup).toHaveBeenCalled();
    expect(mocks.writeBackup).toHaveBeenCalled(); // niente remoto → push del locale
  });

  it("token scaduto durante il primo sync (unauthorized) → stato 'expired'", async () => {
    mocks.requestAccessToken.mockResolvedValue({ token: "tok", expiresIn: 3600 });
    mocks.readBackup.mockRejectedValue(new Error("unauthorized"));
    renderCtx();
    await act(async () => { screen.getByText("collega").click(); });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("expired"));
  });

  it("sync fallito per altro (rete) → stato 'error' col messaggio", async () => {
    mocks.requestAccessToken.mockResolvedValue({ token: "tok", expiresIn: 3600 });
    mocks.readBackup.mockRejectedValue(new Error("drive_list_failed"));
    renderCtx();
    await act(async () => { screen.getByText("collega").click(); });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
  });

  it("disconnect: revoca il token, svuota cache e flag, torna guest", async () => {
    mocks.requestAccessToken.mockResolvedValue({ token: "tok", expiresIn: 3600 });
    renderCtx();
    await act(async () => { screen.getByText("collega").click(); });
    await waitFor(() => expect(localStorage.getItem("navta.drive.connected")).toBe("1"));
    await act(async () => { screen.getByText("scollega").click(); });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("guest"));
    expect(mocks.revokeAccessToken).toHaveBeenCalledWith("tok");
    expect(mocks.clearDriveCache).toHaveBeenCalled();
    expect(localStorage.getItem("navta.drive.connected")).toBeNull();
    expect(screen.getByTestId("email").textContent).toBe("—");
  });
});
