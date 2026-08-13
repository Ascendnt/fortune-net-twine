import type { Role } from "./types";

/**
 * Who sees what on the dashboard.
 *
 * A note on why this exists, because it is a deliberate departure. Everywhere else in this system
 * every screen is open to every role. See `permissions.ts`, which gates *actions* and hides no
 * page. The dashboard is the one place that rule produces a bad screen rather than a generous one.
 *
 * The reason is what a dashboard is for. It is not a report; it is the answer to "what should I be
 * doing". A packer opening it needs the four loads waiting on them, not the company's order book,
 * and putting total revenue at the top of their screen does two unhelpful things at once: it buries
 * their work under numbers they cannot act on, and it publishes the company's commercials to
 * everyone who can open a laptop. Neither is a security claim, since anyone can still switch role
 * in the demo and the Reports screen is still reachable. It is an editorial one: show each person
 * the dashboard that helps them.
 *
 * So the split is by what the figure is FOR, not by seniority:
 *
 *  - `executive`:   the whole book. Values, trend, conversion, customer concentration, collection.
 *                    Management and admin, who are accountable for all of it.
 *  - `commercial`:  money, but their own slice of it. Sales sees the funnel it works; Finance sees
 *                    what is owed and collected. Neither needs the other's headline.
 *  - `operational`: counts, dates, weights, queues. Everything except amounts. This is not a
 *                    demotion: it is the version of the screen with the noise taken out.
 *
 * Amounts are the discriminator because they are the thing that is both sensitive and useless to
 * someone whose job is to get a container onto a ship. Weights are not, because a packer needs
 * those, and they are on every tier.
 */
export type DashboardTier = "executive" | "commercial" | "operational";

const TIER_BY_ROLE: Record<Role, DashboardTier> = {
  admin: "executive",
  management: "executive",
  sales_manager: "commercial",
  finance: "commercial",
  sales_rep: "commercial",
  logistics: "operational",
  factory_technical: "operational",
};

export function dashboardTier(role: Role): DashboardTier {
  return TIER_BY_ROLE[role] ?? "operational";
}

export interface DashboardScope {
  tier: DashboardTier;
  /** Whether money appears anywhere on the screen. */
  showAmounts: boolean;
  /** The company-wide roll-up: total order book, collection rate, customer concentration. */
  showCompanyTotals: boolean;
  /** Order value trend and the year-on-year comparison. */
  showValueTrend: boolean;
  /** The funnel: PI issued against SO converted, and the rate between them. */
  showConversion: boolean;
  /** Receivables and the collection rate. */
  showCollections: boolean;
  /**
   * Volume in pieces and kilos rather than money.
   *
   * On the operational tier this replaces the value trend rather than sitting beside it. The shape
   * of the month is genuinely useful to a plant; it is just denominated in the wrong unit.
   */
  showVolumeTrend: boolean;
  /** A one-line explanation of the view, shown under the page title. */
  description: string;
}

export function dashboardScope(role: Role): DashboardScope {
  const tier = dashboardTier(role);
  if (tier === "executive") {
    return {
      tier,
      showAmounts: true,
      showCompanyTotals: true,
      showValueTrend: true,
      showConversion: true,
      showCollections: true,
      showVolumeTrend: false,
      description: "Order book, conversion and collection across every active export order.",
    };
  }
  if (tier === "commercial") {
    return {
      tier,
      showAmounts: true,
      // The company roll-up is the one figure that belongs to whoever is accountable for all of it.
      showCompanyTotals: false,
      showValueTrend: true,
      showConversion: role !== "finance",
      showCollections: role === "finance" || role === "sales_manager",
      showVolumeTrend: false,
      description:
        role === "finance"
          ? "Receivables, collection and the orders waiting on money."
          : "The quotation-to-order funnel and what is moving through it.",
    };
  }
  return {
    tier,
    showAmounts: false,
    showCompanyTotals: false,
    showValueTrend: false,
    showConversion: false,
    showCollections: false,
    showVolumeTrend: true,
    description: "What is packed, what is due out, and what is holding a container up.",
  };
}

/**
 * Whether a role may pull the report pack out as a workbook or a deck.
 *
 * Tied to seeing amounts rather than to a separate permission: the pack is the commercial numbers,
 * so anyone who cannot see them on screen has nothing to export. Operational users still export
 * their own operational lists from the screens that own them.
 */
export function canExportReports(role: Role): boolean {
  return dashboardScope(role).showAmounts;
}
