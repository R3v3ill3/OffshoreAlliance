'use client';

import React from 'react';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { usePathname } from 'next/navigation';

interface ExternalLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  showIcon?: boolean;
  variant?: 'default' | 'button' | 'text' | 'outline';
  target?: '_blank' | '_self';
  includeReturnUrl?: boolean;
}

/**
 * ExternalLink component for cross-app navigation
 *
 * Provides visual indication when linking to external apps (Organising DB ↔ OA Planner)
 *
 * @param href - The URL to link to
 * @param children - Link content
 * @param className - Additional CSS classes
 * @param showIcon - Show external link icon (default: true)
 * @param variant - Visual style: 'default' | 'button' | 'text' | 'outline'
 * @param target - Link target: '_blank' (new tab) or '_self' (same tab)
 * @param includeReturnUrl - Automatically add return_to parameter (default: true)
 */
export function ExternalLink({
  href,
  children,
  className,
  showIcon = true,
  variant = 'default',
  target = '_blank',
  includeReturnUrl = true,
}: ExternalLinkProps) {
  const pathname = usePathname();

  // Build URL with return_to parameter if enabled
  const fullHref = React.useMemo(() => {
    if (!includeReturnUrl || target === '_self') return href;

    try {
      const url = new URL(href);
      // Add return_to parameter with current path
      url.searchParams.set('return_to', pathname);
      return url.toString();
    } catch {
      // If href is not a valid URL, return as-is
      return href;
    }
  }, [href, includeReturnUrl, pathname, target]);

  const baseStyles = 'inline-flex items-center gap-1.5 transition-colors';

  const variantStyles = {
    default: 'text-primary hover:underline underline-offset-2',
    button: 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2',
    outline:
      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2',
    text: 'text-sm text-muted-foreground hover:text-foreground',
  };

  return (
    <a
      href={fullHref}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      className={cn(baseStyles, variantStyles[variant], className)}
    >
      {children}
      {showIcon && <ExternalLinkIcon className="h-3.5 w-3.5" />}
    </a>
  );
}
