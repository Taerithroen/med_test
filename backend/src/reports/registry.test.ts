import test from "node:test";
import assert from "node:assert/strict";
import { REPORTS, getReportById } from "./registry.js";

test("REPORTS: id уникальные и не пустые", () => {
  assert.ok(Array.isArray(REPORTS));
  assert.ok(REPORTS.length > 0);

  const ids = REPORTS.map((r) => r.id);
  assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
  assert.equal(new Set(ids).size, ids.length);
});

test("REPORTS: defaultFormat входит в supportedFormats", () => {
  for (const r of REPORTS) {
    assert.ok(r.supportedFormats.includes(r.defaultFormat));
  }
});

test("getReportById: находит существующий и возвращает null для несуществующего", () => {
  const first = REPORTS[0]!;
  assert.deepEqual(getReportById(first.id), first);
  assert.equal(getReportById("does-not-exist"), null);
});

