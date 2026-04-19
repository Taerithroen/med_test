import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeUploadFileName } from "./sanitizeUploadName.js";

test("sanitizeUploadFileName: basename и убирание пути", () => {
  assert.equal(sanitizeUploadFileName("../../../etc/passwd"), "data.csv");
});

test("sanitizeUploadFileName: сохраняет csv", () => {
  assert.equal(sanitizeUploadFileName("my-data.csv"), "my-data.csv");
});

test("sanitizeUploadFileName: сохраняет txt", () => {
  assert.equal(sanitizeUploadFileName("table.txt"), "table.txt");
});

test("sanitizeUploadFileName: сохраняет xlsx", () => {
  assert.equal(sanitizeUploadFileName("report.xlsx"), "report.xlsx");
});

test("sanitizeUploadFileName: сохраняет ods", () => {
  assert.equal(sanitizeUploadFileName("sheet.ods"), "sheet.ods");
});

test("sanitizeUploadFileName: сохраняет xods", () => {
  assert.equal(sanitizeUploadFileName("table.xods"), "table.xods");
});

test("sanitizeUploadFileName: неизвестное расширение -> data.csv", () => {
  assert.equal(sanitizeUploadFileName("file.doc"), "data.csv");
});

test("sanitizeUploadFileName: спецсимволы", () => {
  assert.equal(sanitizeUploadFileName("отчёт 1.csv"), "_1.csv");
});
