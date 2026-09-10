"use client";

// WP1.2 — one row of the nav, shared by the desktop sidebar and the mobile
// sheet. The two surfaces render an identical inventory (appendix D §1.4) and
// differ only in their Tailwind class sets, so those are props and the markup
// is written once.
//
// A muted row is deliberately NOT a link: it is a `<span>` with
// `aria-disabled`, a native `title` carrying the reason and an `sr-only` copy
// of the same sentence, so the explanation reaches a pointer user and a
// screen-reader user alike. A native `title` rather than the shadcn
// `<Tooltip>` because `TooltipProvider` is not mounted in the shell and
// mounting one for a handful of muted rows is a shell change this package
// does not need.

import Link from "next/link";

import { NAV_ICONS } from "@/lib/nav/nav-icons";
import type { NavItem } from "@/lib/nav/nav-model";
import { cn } from "@/lib/utils/cn";

export interface NavRowProps {
  item: NavItem;
  isActive: boolean;
  /** Classes every state shares, e.g. the flex/padding/typography row. */
  baseClassName: string;
  activeClassName: string;
  inactiveClassName: string;
  /** False in the collapsed (w-16) sidebar: icon only. */
  showLabel: boolean;
  badgeClassName: string;
  /** Mobile closes the sheet on navigation; desktop passes nothing. */
  onNavigate?: () => void;
}

export function NavRow({
  item,
  isActive,
  baseClassName,
  activeClassName,
  inactiveClassName,
  showLabel,
  badgeClassName,
  onNavigate,
}: NavRowProps) {
  const Icon = NAV_ICONS[item.icon];
  const className = cn(baseClassName, isActive ? activeClassName : inactiveClassName);

  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      {showLabel && <span>{item.label}</span>}
      {item.badge != null && (
        <span
          className={badgeClassName}
          aria-label={`${item.badge} unread email conversations`}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </>
  );

  if (item.state === "muted") {
    return (
      <span
        className={cn(className, "opacity-50 cursor-not-allowed")}
        aria-disabled="true"
        tabIndex={-1}
        title={item.mutedReason}
      >
        {body}
        <span className="sr-only">{item.mutedReason}</span>
      </span>
    );
  }

  return (
    <Link href={item.href} className={className} onClick={onNavigate}>
      {body}
    </Link>
  );
}
