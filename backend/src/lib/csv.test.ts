import test from "node:test";
import assert from "node:assert/strict";
import { parseSimpleCsv } from "./csv.js";

test("parseSimpleCsv: пусто и пробелы", () => {
  assert.deepEqual(parseSimpleCsv(""), []);
  assert.deepEqual(parseSimpleCsv("   \n  "), []);
});

test("parseSimpleCsv: BOM и одна строка", () => {
  assert.deepEqual(parseSimpleCsv("\uFEFFa,b,c"), [["a", "b", "c"]]);
});

test("parseSimpleCsv: несколько строк", () => {
  assert.deepEqual(parseSimpleCsv("h1,h2\n1,2\n3,4"), [
    ["h1", "h2"],
    ["1", "2"],
    ["3", "4"],
  ]);
});

test("parseSimpleCsv: CRLF", () => {
  assert.deepEqual(parseSimpleCsv("x,y\r\np,q"), [
    ["x", "y"],
    ["p", "q"],
  ]);
});
