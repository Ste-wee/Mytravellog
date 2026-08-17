import { describe, it, expect, vi, afterEach } from "vitest";
import { canShareFile, downloadBlob, shareOrDownload } from "./share";

const file = () => new File(["ciao"], "poster.svg", { type: "image/svg+xml" });

afterEach(() => vi.restoreAllMocks());

describe("canShareFile", () => {
  it("false quando navigator.canShare non esiste (desktop)", () => {
    expect(canShareFile(file())).toBe(false); // jsdom non ha canShare
  });

  it("true quando canShare accetta il file", () => {
    (navigator as unknown as { canShare?: (d: unknown) => boolean }).canShare = () => true;
    expect(canShareFile(file())).toBe(true);
    delete (navigator as unknown as { canShare?: unknown }).canShare;
  });

  it("false (non crash) se canShare LANCIA — alcuni browser lo fanno su input inattesi", () => {
    (navigator as unknown as { canShare?: () => boolean }).canShare = () => { throw new Error("no"); };
    expect(canShareFile(file())).toBe(false);
    delete (navigator as unknown as { canShare?: unknown }).canShare;
  });
});

describe("downloadBlob", () => {
  it("crea l'anchor, avvia il click e revoca l'URL solo DOPO 10 secondi", () => {
    vi.useFakeTimers();
    // jsdom non implementa createObjectURL/revokeObjectURL: si DEFINISCONO
    // (spiarle fallisce con "does not exist").
    const creato = vi.fn(() => "blob:finto");
    const revocato = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = creato;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revocato;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadBlob(new Blob(["x"]), "file.txt");

    expect(creato).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revocato).not.toHaveBeenCalled(); // revocare subito tronca il file sui mobile lenti
    vi.advanceTimersByTime(10_000);
    expect(revocato).toHaveBeenCalledWith("blob:finto");
    vi.useRealTimers();
  });
});

describe("shareOrDownload", () => {
  it("dove si può condividere usa navigator.share col titolo", async () => {
    (navigator as unknown as { canShare?: () => boolean }).canShare = () => true;
    const share = vi.fn(async () => {});
    (navigator as unknown as { share?: typeof share }).share = share;
    await shareOrDownload(file(), "Il mio poster");
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)], title: "Il mio poster" });
    delete (navigator as unknown as { canShare?: unknown }).canShare;
    delete (navigator as unknown as { share?: unknown }).share;
  });

  it("l'annullamento del foglio di condivisione è MUTO: niente crash, niente download", async () => {
    (navigator as unknown as { canShare?: () => boolean }).canShare = () => true;
    (navigator as unknown as { share?: () => Promise<never> }).share = () => Promise.reject(new Error("AbortError"));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await expect(shareOrDownload(file(), "t")).resolves.toBeUndefined();
    expect(click).not.toHaveBeenCalled(); // annullare NON deve degradare in download
    delete (navigator as unknown as { canShare?: unknown }).canShare;
    delete (navigator as unknown as { share?: unknown }).share;
  });

  it("senza Web Share ricade sul download", async () => {
    const creato = vi.fn(() => "blob:finto");
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = creato;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await shareOrDownload(file(), "t");
    expect(creato).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });
});
