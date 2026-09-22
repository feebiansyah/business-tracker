import assert from "node:assert/strict";
import test from "node:test";
import {
  ADSTERRA_SCHEDULE,
  ADSTERRA_SCHEDULE_TIME_ZONE,
  getJakartaDateParts,
  getNextJakartaCalendarDate,
  shouldSkipScheduledOff,
} from "./schedule.ts";

const wib = (value) => new Date(`${value}+07:00`);

test("Adsterra schedule constants use the fixed Jakarta business schedule", () => {
  assert.equal(ADSTERRA_SCHEDULE_TIME_ZONE, "Asia/Jakarta");
  assert.deepEqual(ADSTERRA_SCHEDULE, { on: { hour: 8, minute: 5 }, off: { hour: 21, minute: 50 } });
});

test("Jakarta calendar parts do not depend on the server timezone", () => {
  assert.deepEqual(getJakartaDateParts(new Date("2026-09-08T17:30:00.000Z")), { year: 2026, month: 9, day: 9 });
});

test("scheduled OFF is skipped for tomorrow's double date and the 25th", () => {
  for (const value of ["2026-09-08T21:50:00", "2026-09-24T21:50:00", "2026-10-09T21:50:00", "2026-11-10T21:50:00", "2026-12-11T21:50:00"]) {
    assert.equal(shouldSkipScheduledOff(wib(value)), true, value);
  }
});

test("scheduled OFF runs normally outside special tomorrow dates", () => {
  for (const value of ["2026-09-09T21:50:00", "2026-09-25T21:50:00", "2026-09-23T21:50:00"]) {
    assert.equal(shouldSkipScheduledOff(wib(value)), false, value);
  }
});

test("next Jakarta calendar date handles month, leap-year, and year boundaries", () => {
  assert.deepEqual(getNextJakartaCalendarDate(wib("2026-04-30T21:50:00")), { year: 2026, month: 5, day: 1 });
  assert.deepEqual(getNextJakartaCalendarDate(wib("2027-02-28T21:50:00")), { year: 2027, month: 3, day: 1 });
  assert.deepEqual(getNextJakartaCalendarDate(wib("2028-02-28T21:50:00")), { year: 2028, month: 2, day: 29 });
  assert.deepEqual(getNextJakartaCalendarDate(wib("2026-12-31T21:50:00")), { year: 2027, month: 1, day: 1 });
});
