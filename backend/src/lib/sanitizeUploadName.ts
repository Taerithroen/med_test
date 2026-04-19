import path from "node:path";

const ALLOWED_EXT = new Set([".csv", ".txt", ".xlsx", ".ods", ".xods"]);

/** Безопасное имя файла для сохранения в uploads (только basename, без путей). */
export function sanitizeUploadFileName(original: string): string {
  const base = path.basename(String(original).replace(/\0/g, ""));
  let s = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_");
  const ext = path.extname(s).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) s = "data.csv";
  const e = path.extname(s);
  const maxStem = Math.max(1, 120 - e.length);
  if (s.length > 120) {
    const stem = (e ? s.slice(0, -e.length) : s).slice(0, maxStem);
    s = `${stem || "data"}${ALLOWED_EXT.has(e.toLowerCase()) ? e : ".csv"}`;
  }
  return s || "data.csv";
}
