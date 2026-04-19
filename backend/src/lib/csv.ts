/**
 * Упрощённый разбор CSV: строки по \n, поля по запятой, trim ячеек.
 * Поля с внутренними запятыми в кавычках не поддерживаются (прототип).
 */
export function parseSimpleCsv(content: string): string[][] {
  const text = content.replace(/^\uFEFF/, "").trimEnd();
  if (!text.trim()) return [];
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(",").map((c) => c.trim()));
}
