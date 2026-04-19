import fs from "node:fs/promises";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

function asArray<T>(x: T | T[] | undefined): T[] {
  if (x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

function extractPText(p: unknown): string {
  if (p == null) return "";
  if (typeof p === "string" || typeof p === "number" || typeof p === "boolean") return String(p);
  if (Array.isArray(p)) return p.map(extractPText).join("\n");
  if (typeof p === "object") {
    const o = p as Record<string, unknown>;
    if ("#text" in o) return String(o["#text"]);
    if ("span" in o) return extractPText(o.span);
    if ("a" in o) return extractPText(o.a);
    if ("p" in o) return extractPText(o.p);
  }
  return "";
}

function odsCellText(cell: Record<string, unknown>): string {
  const fromP = extractPText(cell.p ?? cell["text:p"]);
  if (fromP !== "") return fromP;
  const strVal = cell["@_string-value"] ?? cell["@_office:string-value"];
  if (strVal != null && String(strVal).length) return String(strVal);
  const val = cell["@_value"] ?? cell["@_office:value"];
  if (val != null && String(val).length) return String(val);
  return "";
}

function repeatCount(cell: Record<string, unknown>): number {
  const raw = cell["@_number-columns-repeated"] ?? cell["@_table:number-columns-repeated"];
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1024);
}

/** Первая таблица на первом листе: стандартный .ods или .xods (МойОфис), если внутри ODF — content.xml. */
export async function rowsFromOds(absPath: string): Promise<string[][]> {
  const buf = await fs.readFile(absPath);
  const zip = await JSZip.loadAsync(buf);
  const contentFile = zip.file("content.xml");
  if (!contentFile) throw new Error("Файл не похож на ODS (нет content.xml)");
  const xmlString = await contentFile.async("string");

  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    trimValues: true,
  });
  const doc = parser.parse(xmlString) as Record<string, unknown>;

  const content =
    (doc["document-content"] as Record<string, unknown> | undefined) ??
    (doc["office:document-content"] as Record<string, unknown> | undefined);
  if (!content) throw new Error("Некорректный content.xml в ODS");

  const body = (content.body ?? content["office:body"]) as Record<string, unknown> | undefined;
  const spreadsheet = (body?.spreadsheet ?? body?.["office:spreadsheet"]) as
    | Record<string, unknown>
    | undefined;
  if (!spreadsheet) throw new Error("В ODS не найден раздел таблицы");

  const tables = asArray(spreadsheet.table ?? spreadsheet["table:table"]);
  if (!tables.length) throw new Error("В ODS нет таблиц на первом листе");

  const firstTable = tables[0] as Record<string, unknown>;
  const rowNodes = asArray(firstTable["table-row"] ?? firstTable["table:table-row"]);

  const out: string[][] = [];
  for (const row of rowNodes) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const cells = asArray(r["table-cell"] ?? r["table:table-cell"]);
    const texts: string[] = [];
    for (const cell of cells) {
      if (!cell || typeof cell !== "object") continue;
      const c = cell as Record<string, unknown>;
      const t = odsCellText(c);
      const rep = repeatCount(c);
      for (let i = 0; i < rep; i++) texts.push(t);
    }
    out.push(texts);
  }

  if (!out.length) throw new Error("Таблица ODS пуста");
  return out;
}
