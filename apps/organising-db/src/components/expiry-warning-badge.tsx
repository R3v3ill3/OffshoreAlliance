import { getExpiryWarning, getWarningBadgeStyles, type ExpiryWarning } from "@/lib/expiry-warnings";

interface ExpiryWarningBadgeProps {
  expiryDate: string | null | undefined;
  isGreenfields?: boolean;
  showFullMessage?: boolean;
}

export function ExpiryWarningBadge({
  expiryDate,
  isGreenfields = false,
  showFullMessage = true,
}: ExpiryWarningBadgeProps) {
  const warning = getExpiryWarning(expiryDate, isGreenfields);
  const styles = getWarningBadgeStyles(warning.level);

  if (warning.level === 'none' && !showFullMessage) {
    return null;
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${styles.className}`}
    >
      <span>{styles.icon}</span>
      <span>{warning.message}</span>
    </div>
  );
}

interface ExpiryWarningBannerProps {
  expiryDate: string | null | undefined;
  isGreenfields?: boolean;
  agreementName?: string;
}

export function ExpiryWarningBanner({
  expiryDate,
  isGreenfields = false,
  agreementName,
}: ExpiryWarningBannerProps) {
  const warning = getExpiryWarning(expiryDate, isGreenfields);

  if (warning.level === 'none') {
    return null;
  }

  const bannerStyles = {
    prominent: 'bg-red-50 border-red-200 text-red-800',
    low: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  };

  const titles = {
    prominent: 'Action Required - Agreement Expiring Soon',
    low: 'Upcoming Expiry - Agreement Expiring Within 12 Months',
  };

  return (
    <div
      className={`p-4 rounded-lg border ${bannerStyles[warning.level]} mb-4`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">
          {warning.level === 'prominent' ? '⚠️' : '⏰'}
        </span>
        <div className="flex-1">
          <h3 className="font-semibold mb-1">
            {titles[warning.level]}
          </h3>
          <p className="text-sm opacity-90">
            {agreementName && <strong>{agreementName}</strong>}
            {agreementName && ' — '}
            {warning.message}
          </p>
          {warning.level === 'prominent' && (
            <p className="text-xs mt-2 opacity-80">
              Consider initiating renewal negotiations or expiry contingency planning
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
