import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { rowsFromOds } from "./odsRows.js";
import { loadUploadTableRows } from "./loadUploadTableRows.js";

const MINIMAL_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">
<office:body><office:spreadsheet><table:table>
<table:table-row>
  <table:table-cell><text:p>Header1</text:p></table:table-cell>
  <table:table-cell><text:p>Header2</text:p></table:table-cell>
</table:table-row>
<table:table-row>
  <table:table-cell office:value-type="float" office:value="99.5"/>
  <table:table-cell office:value-type="string" office:string-value="X"/>
</table:table-row>
<table:table-row>
  <table:table-cell table:number-columns-repeated="2"><text:p>dup</text:p></table:table-cell>
</table:table-row>
</table:table></office:spreadsheet></office:body></office:document-content>`;

async function writeTempOds(): Promise<string> {
  const zip = new JSZip();
  zip.file("content.xml", MINIMAL_CONTENT);
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const p = path.join(os.tmpdir(), `ods-test-${Date.now()}.ods`);
  await fs.writeFile(p, buf);
  return p;
}

test("rowsFromOds: парсит первую таблицу", async () => {
  const p = await writeTempOds();
  try {
    const rows = await rowsFromOds(p);
    assert.deepEqual(rows, [
      ["Header1", "Header2"],
      ["99.5", "X"],
      ["dup", "dup"],
    ]);
  } finally {
    await fs.unlink(p).catch(() => {});
  }
});

test("loadUploadTableRows: расширение .xods использует тот же разбор ODF", async () => {
  const zip = new JSZip();
  zip.file("content.xml", MINIMAL_CONTENT);
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const p = path.join(os.tmpdir(), `xods-test-${Date.now()}.xods`);
  await fs.writeFile(p, buf);
  try {
    const rows = await loadUploadTableRows(p);
    assert.deepEqual(rows[0], ["Header1", "Header2"]);
  } finally {
    await fs.unlink(p).catch(() => {});
  }
});
