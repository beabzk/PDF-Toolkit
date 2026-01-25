const windowsReservedNames = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

export function sanitizeFileName(fileName: string, fallback = "download") {
  const trimmed = fileName.trim();

  const withoutInvalidChars = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/[\s.]+$/g, "")
    .replace(/^\.+/g, "");

  const safe = withoutInvalidChars || fallback;

  const parts = safe.split(".");
  const base = parts[0] ?? safe;

  if (windowsReservedNames.has(base.toLowerCase())) {
    return `${fallback}-${safe}`;
  }

  return safe.slice(0, 180);
}
