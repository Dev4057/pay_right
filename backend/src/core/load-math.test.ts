import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLoadClass, mismatchFlags } from "./load-math.js";

test("pilot audience with quiet rollout -> XS", () => {
  const r = computeLoadClass({
    Q_USERS: "<100 (pilot)",
    Q_ACTIVITY: "Business hours",
    Q_LAUNCH: "Quiet rollout",
  });
  assert.equal(r.load_class, "XS");
  assert.ok(r.avg_rps < 1);
});

test("early launch audience -> S", () => {
  const r = computeLoadClass({
    Q_USERS: "100-1K",
    Q_ACTIVITY: "All day",
    Q_LAUNCH: "Quiet rollout",
  });
  assert.equal(r.load_class, "S");
});

test("launch-day spike bumps one class", () => {
  const r = computeLoadClass({
    Q_USERS: "100-1K",
    Q_ACTIVITY: "All day",
    Q_LAUNCH: "Launch-day spike",
  });
  assert.equal(r.load_class, "M");
  assert.equal(r.peak_rps, r.avg_rps * 10);
});

test("spiky events also bump, but never past L", () => {
  const r = computeLoadClass({
    Q_USERS: "10K+",
    Q_ACTIVITY: "Spiky events",
    Q_LAUNCH: "Quiet rollout",
  });
  assert.equal(r.load_class, "L");
});

test("unknown answer values are rejected", () => {
  assert.throws(() =>
    computeLoadClass({
      Q_USERS: "a billion users",
      Q_ACTIVITY: "All day",
      Q_LAUNCH: "Quiet rollout",
    })
  );
});

test("M-class expectation on SQLite raises a mismatch flag", () => {
  const flags = mismatchFlags("M", "sqlite", "F2", "F6");
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.severity, "warning");
  assert.deepEqual(flags[0]!.related_finding_ids, ["F2", "F6"]);
});

test("S-class on postgres raises no flags", () => {
  assert.equal(mismatchFlags("S", "postgres", "F2", "F6").length, 0);
});
