const SUFFIX_MULTIPLIERS: Record<string, number> = {
  K: 1e3,
  M: 1e6,
  B: 1e9,
  T: 1e12,
  QA: 1e15,
  QI: 1e18,
  SX: 1e21,
};

const FORMAT_TIERS: Array<{ threshold: number; divisor: number; suffix: string }> = [
  { threshold: 1e21, divisor: 1e21, suffix: 'Sx' },
  { threshold: 1e18, divisor: 1e18, suffix: 'Qi' },
  { threshold: 1e15, divisor: 1e15, suffix: 'Qa' },
  { threshold: 1e12, divisor: 1e12, suffix: 'T' },
  { threshold: 1e9, divisor: 1e9, suffix: 'B' },
  { threshold: 1e6, divisor: 1e6, suffix: 'M' },
  { threshold: 1e4, divisor: 1e3, suffix: 'K' },
];

/**
 * Formats numeric values into compact gaming notation:
 * - < 10,000: "1,500"
 * - >= 10,000: "25K", "3.5M", "2.4B", "1.2T"
 */
export function formatCompactValue(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }

  for (const tier of FORMAT_TIERS) {
    if (value >= tier.threshold) {
      const scaled = value / tier.divisor;
      const rounded = scaled >= 100 ? Math.round(scaled * 10) / 10 : Math.round(scaled * 100) / 100;
      const formatted = Number.isInteger(rounded)
        ? String(rounded)
        : rounded.toFixed(2).replace(/\.?0+$/, '');
      return `${formatted}${tier.suffix}`;
    }
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(Math.round(value * 100) / 100);
}

/**
 * Parses either raw numbers ("1500", "1,500", "100000000")
 * or compact suffixes ("25K", "3.5M", "100M", "2.4B", "1.2T").
 * Returns null if invalid or non-positive.
 */
export function parseValueInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/[\s,_]/g, '');
  if (!cleaned) {
    return null;
  }

  const match = cleaned.match(/^([+-]?\d+(?:\.\d+)?)(Sx|Qi|Qa|K|M|B|T)?$/i);
  if (!match) {
    return null;
  }

  const baseNumber = Number(match[1]);
  if (!Number.isFinite(baseNumber) || baseNumber <= 0) {
    return null;
  }

  const suffix = match[2]?.toUpperCase();
  const multiplier = suffix ? SUFFIX_MULTIPLIERS[suffix] : 1;
  if (!multiplier) {
    return null;
  }

  const total = baseNumber * multiplier;
  if (!Number.isFinite(total) || total <= 0 || total > 1e24) {
    return null;
  }

  return total;
}

export function computeVariantValues(
  normalValue: number,
  goldenMultiplier: number,
  rainbowMultiplier: number
) {
  return {
    normal: normalValue,
    golden: normalValue * goldenMultiplier,
    rainbow: normalValue * rainbowMultiplier,
  };
}

export function isSafeHttpUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return true;
  }
  if (trimmed.length > 2048) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
