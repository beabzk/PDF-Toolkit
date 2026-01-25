import { PDFDocument } from "pdf-lib";

export function toFriendlyPdfLibError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (typeof message === "string" && message.toLowerCase().includes("encrypted")) {
    return new Error("This PDF appears to be encrypted and cannot be processed.");
  }

  return error instanceof Error ? error : new Error("Failed to process the PDF.");
}

export async function loadPdfDocument(bytes: ArrayBuffer | Uint8Array) {
  try {
    return await PDFDocument.load(bytes);
  } catch (e) {
    throw toFriendlyPdfLibError(e);
  }
}
