/**
 * true solo se il browser supporta davvero la condivisione di un file (Web
 * Share API con `files`, tipicamente mobile) — su desktop `navigator.share`
 * spesso manca o non accetta file, quindi si ricade sul download.
 *
 * Fonte unica: prima viveva in due copie identiche (Recap e TripFlyover) e
 * ogni correzione andava fatta due volte.
 */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== "undefined"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}
