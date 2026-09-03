import assert from "node:assert/strict";
import test from "node:test";
import { mobileDrawerShouldClose } from "./mobile-navigation-state.ts";

test("mobile drawer closes from overlay, close button, and navigation", () => {
  assert.equal(mobileDrawerShouldClose("overlay"), true);
  assert.equal(mobileDrawerShouldClose("close-button"), true);
  assert.equal(mobileDrawerShouldClose("navigation"), true);
});

test("mobile drawer closes on Escape only", () => {
  assert.equal(mobileDrawerShouldClose("keydown", "Escape"), true);
  assert.equal(mobileDrawerShouldClose("keydown", "Enter"), false);
});

test("mobile drawer remains open when its panel is clicked", () => {
  assert.equal(mobileDrawerShouldClose("panel"), false);
});
