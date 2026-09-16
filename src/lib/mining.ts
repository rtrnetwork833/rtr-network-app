export const FREE_TIER = "Free Node Booster";
export const FREE_CYCLE_SECONDS = 24 * 60 * 60;
export const PREMIUM_CYCLE_SECONDS = 30 * 24 * 60 * 60;

export const premiumTiers = new Set([
  "Starter Utility Boost",
  "Silver Protocol License",
  "Gold Protocol License",
  "Premium Platform Booster",
  "Advanced Network Tier",
  "Master Infrastructure Pass",
  "Regional Allocation Access",
  "Continental System License",
  "Global System Core",
  "Sovereign Genesis License",
]);

export function cycleSecondsForTier(tier: string) {
  if (tier === FREE_TIER) return FREE_CYCLE_SECONDS;
  if (premiumTiers.has(tier)) return PREMIUM_CYCLE_SECONDS;
  return null;
}