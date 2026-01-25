import { sanitizeFileName } from "@/lib/filename";

export function downloadBlob(blob: Blob, fileName: string) {
  const safeName = sanitizeFileName(fileName);
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export function downloadBytes(
  bytes: Uint8Array,
  fileName: string,
  mimeType = "application/octet-stream",
) {
  const safeBytes = new Uint8Array(bytes);
  const blob = new Blob([safeBytes], { type: mimeType });
  downloadBlob(blob, fileName);
}
