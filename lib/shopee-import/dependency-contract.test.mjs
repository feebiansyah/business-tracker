import assert from "node:assert/strict";
import test from "node:test";

test("CSV and decimal libraries are direct project dependencies", async () => {
  const [{ parse }, { default: Decimal }] = await Promise.all([
    import("csv-parse/sync"),
    import("decimal.js"),
  ]);
  assert.deepEqual(parse('a,b\n"x,y",2', { columns: true }), [{ a: "x,y", b: "2" }]);
  assert.equal(new Decimal("0.1").plus("0.2").toFixed(2), "0.30");
});
