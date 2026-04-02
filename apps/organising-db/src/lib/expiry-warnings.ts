/**
 * Expiry Warning System
 *
 * Thresholds:
 * - 12+ months: No warning
 * - 6-12 months: Low-level warning (yellow/info)
 * - <6 months: Prominent warning (red/warning)
 * - Greenfields: Excluded from all warnings
 */

export type WarningLevel = 'none' | 'low' | 'prominent';

export interface ExpiryWarning {
  level: WarningLevel;
  message: string;
  monthsRemaining: number | null;
}

/**
 * Calculate warning level based on agreement expiry date
 */
export function getExpiryWarning(
  expiryDate: string | null | undefined,
  isGreenfields: boolean = false
): ExpiryWarning {
  // Greenfields are excluded from warnings
  if (isGreenfields) {
    return {
      level: 'none',
      message: 'Greenfields agreement',
      monthsRemaining: null,
    };
  }

  // No expiry date set
  if (!expiryDate) {
    return {
      level: 'none',
      message: 'No expiry date set',
      monthsRemaining: null,
    };
  }

  const expiry = new Date(expiryDate);
  const today = new Date();
  const monthsRemaining = getMonthsDifference(today, expiry);

  // Already expired
  if (monthsRemaining < 0) {
    return {
      level: 'prominent',
      message: `Expired ${Math.abs(monthsRemaining).toFixed(1)} months ago`,
      monthsRemaining,
    };
  }

  // Less than 6 months - prominent warning
  if (monthsRemaining < 6) {
    return {
      level: 'prominent',
      message: `Expires in ${monthsRemaining.toFixed(1)} months`,
      monthsRemaining,
    };
  }

  // 6-12 months - low-level warning
  if (monthsRemaining < 12) {
    return {
      level: 'low',
      message: `Expires in ${monthsRemaining.toFixed(1)} months`,
      monthsRemaining,
    };
  }

  // 12+ months - no warning
  return {
    level: 'none',
    message: 'Expires in ' + monthsRemaining.toFixed(1) + ' months',
    monthsRemaining,
  };
}

/**
 * Calculate the difference in months between two dates
 */
function getMonthsDifference(date1: Date, date2: Date): number {
  const months =
    (date2.getFullYear() - date1.getFullYear()) * 12 +
    date2.getMonth() -
    date1.getMonth();

  // Adjust for day of month
  const dayDiff = date2.getDate() - date1.getDate();
  const monthFraction = dayDiff / 30; // Approximate

  return months + monthFraction;
}

/**
 * Get badge styles for warning level
 */
export function getWarningBadgeStyles(level: WarningLevel): {
  className: string;
  icon: string;
} {
  switch (level) {
    case 'prominent':
      return {
        className: 'bg-red-100 text-red-800 border-red-200',
        icon: '⚠️',
      };
    case 'low':
      return {
        className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        icon: '⏰',
      };
    default:
      return {
        className: 'bg-gray-100 text-gray-800 border-gray-200',
        icon: '✓',
      };
  }
}

/**
 * Filter agreements by warning level
 */
export function filterAgreementsByWarningLevel<T extends { expiry_date: string | null; is_greenfields?: boolean }>(
  agreements: T[],
  level: WarningLevel
): T[] {
  return agreements.filter((agreement) => {
    const warning = getExpiryWarning(
      agreement.expiry_date,
      agreement.is_greenfields ?? false
    );
    return warning.level === level;
  });
}

/**
 * Get count of agreements by warning level
 */
export function getWarningCounts<T extends { expiry_date: string | null; is_greenfields?: boolean }>(
  agreements: T[]
): Record<WarningLevel, number> {
  const counts: Record<WarningLevel, number> = {
    none: 0,
    low: 0,
    prominent: 0,
  };

  for (const agreement of agreements) {
    const warning = getExpiryWarning(
      agreement.expiry_date,
      agreement.is_greenfields ?? false
    );
    counts[warning.level]++;
  }

  return counts;
}
