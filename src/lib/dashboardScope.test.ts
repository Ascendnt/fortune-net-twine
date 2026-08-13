import { describe, it, expect } from "vitest";
import { canExportReports, dashboardScope, dashboardTier } from "./dashboardScope";
import type { Role } from "./types";

const ALL_ROLES: Role[] = [
  "admin",
  "management",
  "sales_manager",
  "finance",
  "sales_rep",
  "logistics",
  "factory_technical",
];

describe("dashboardTier", () => {
  it("puts the roles accountable for the whole book on the executive view", () => {
    expect(dashboardTier("management")).toBe("executive");
    expect(dashboardTier("admin")).toBe("executive");
  });

  it("puts the plant and the yard on the operational view", () => {
    expect(dashboardTier("logistics")).toBe("operational");
    expect(dashboardTier("factory_technical")).toBe("operational");
  });

  it("covers every role, so nobody falls through to a blank screen", () => {
    for (const role of ALL_ROLES) expect(["executive", "commercial", "operational"]).toContain(dashboardTier(role));
  });
});

describe("dashboardScope", () => {
  it("keeps money off the operational view entirely", () => {
    for (const role of ["logistics", "factory_technical"] as Role[]) {
      const scope = dashboardScope(role);
      expect(scope.showAmounts, role).toBe(false);
      expect(scope.showCompanyTotals, role).toBe(false);
      expect(scope.showValueTrend, role).toBe(false);
      expect(scope.showCollections, role).toBe(false);
    }
  });

  it("gives the operational view a volume trend in place of the value one", () => {
    // Not a demotion. The shape of the month is useful to a plant, in the unit it plans in.
    const scope = dashboardScope("logistics");
    expect(scope.showVolumeTrend).toBe(true);
    expect(scope.showValueTrend).toBe(false);
  });

  it("never shows both trends at once, whichever role is asking", () => {
    for (const role of ALL_ROLES) {
      const scope = dashboardScope(role);
      expect(scope.showValueTrend && scope.showVolumeTrend, role).toBe(false);
    }
  });

  it("reserves the company roll-up for the roles accountable for it", () => {
    expect(dashboardScope("management").showCompanyTotals).toBe(true);
    expect(dashboardScope("sales_manager").showCompanyTotals).toBe(false);
    expect(dashboardScope("finance").showCompanyTotals).toBe(false);
  });

  it("gives finance collections and sales the funnel, not the other way round", () => {
    expect(dashboardScope("finance").showCollections).toBe(true);
    expect(dashboardScope("finance").showConversion).toBe(false);
    expect(dashboardScope("sales_rep").showConversion).toBe(true);
    expect(dashboardScope("sales_rep").showCollections).toBe(false);
  });

  it("describes every view, so no page header is left blank", () => {
    for (const role of ALL_ROLES) expect(dashboardScope(role).description.length).toBeGreaterThan(10);
  });
});

describe("canExportReports", () => {
  it("follows what a role can already see rather than inventing a second rule", () => {
    for (const role of ALL_ROLES) {
      expect(canExportReports(role), role).toBe(dashboardScope(role).showAmounts);
    }
  });

  it("stops the report pack leaving with somebody who cannot read it on screen", () => {
    expect(canExportReports("logistics")).toBe(false);
    expect(canExportReports("management")).toBe(true);
  });
});
