import { test } from "node:test";
import assert from "node:assert/strict";
import { getOrderHelpEligibility } from "../src/features/refunds/refund-eligibility";
const start = Date.parse("2026-10-02T12:00:00Z");
const paid = {
  status: "PAID",
  paidAt: new Date(start).toISOString(),
  buyerContactPingAt: null,
};
test("vendor acceptance becomes eligible exactly at five minutes without changed props", () => {
  assert.equal(
    getOrderHelpEligibility(paid, start + 299999).vendorNotAccepted,
    false,
  );
  assert.equal(
    getOrderHelpEligibility(paid, start + 300000).vendorNotAccepted,
    true,
  );
});
test("accepted order does not qualify for vendor-not-accepted refund", () => {
  assert.equal(
    getOrderHelpEligibility({ ...paid, status: "COOKING" }, start + 400000)
      .vendorNotAccepted,
    false,
  );
});
test("overdue preparation exposes contact action", () => {
  assert.equal(
    getOrderHelpEligibility(
      {
        ...paid,
        status: "COOKING",
        estimatedReadyAt: new Date(start + 600000).toISOString(),
      },
      start + 600000,
    ).contactAvailable,
    true,
  );
});
test("unresponsive refund becomes eligible two minutes after contact", () => {
  const contacted = {
    ...paid,
    buyerContactPingAt: new Date(start).toISOString(),
  };
  assert.equal(
    getOrderHelpEligibility(contacted, start + 119999).vendorUnresponsive,
    false,
  );
  assert.equal(
    getOrderHelpEligibility(contacted, start + 120000).vendorUnresponsive,
    true,
  );
});
test("terminal and unpaid orders do not expose overdue contact", () => {
  for (const status of ["COMPLETED", "CANCELLED"])
    assert.equal(
      getOrderHelpEligibility(
        { ...paid, status, estimatedReadyAt: paid.paidAt },
        start + 400000,
      ).contactAvailable,
      false,
    );
  assert.equal(
    getOrderHelpEligibility(
      { ...paid, paidAt: null, estimatedReadyAt: paid.paidAt },
      start + 400000,
    ).contactAvailable,
    false,
  );
});
test("invalid timestamps cannot unlock timeouts", () => {
  assert.equal(
    getOrderHelpEligibility(
      { ...paid, paidAt: "invalid", buyerContactPingAt: "invalid" },
      start,
    ).vendorNotAccepted,
    false,
  );
  assert.equal(
    getOrderHelpEligibility({ ...paid, buyerContactPingAt: "invalid" }, start)
      .vendorUnresponsive,
    false,
  );
});
