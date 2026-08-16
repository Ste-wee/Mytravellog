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

/**
 * Scarica un blob come file. I 10s prima della revoke non sono a caso: il
 * click programmatico avvia il download in modo asincrono e revocare troppo
 * presto (specie su mobile lenti) tronca il file.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Condivide il file dove si può (Web Share con `files`, tipicamente mobile),
 * altrimenti lo scarica. Il catch sulla share è VOLUTO e muto: "l'utente ha
 * annullato il foglio di condivisione" non è un errore e non deve degradare
 * in un download indesiderato.
 */
export async function shareOrDownload(file: File, title: string): Promise<void> {
  if (canShareFile(file)) {
    try { await navigator.share({ files: [file], title }); } catch { /* annullato */ }
  } else {
    downloadBlob(file, file.name);
  }
}
