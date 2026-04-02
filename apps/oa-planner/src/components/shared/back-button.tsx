import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface BackButtonProps {
  href?: string;
  label?: string;
  fallbackHref?: string;
}

/**
 * Back button component with return URL handling
 *
 * Checks for return_to query parameter to navigate back to the originating app
 *
 * @param href - Default href to return to
 * @param label - Button label (default: "Back")
 * @param fallbackHref - Fallback href if no return_to parameter
 */
export function BackButton({ href, label = 'Back', fallbackHref }: BackButtonProps) {
  const router = useRouter();

  // Check if we have a return_to URL (from cross-app navigation)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('return_to');

    if (returnTo) {
      // Store the return URL for later use
      sessionStorage.setItem('cross_app_return_url', returnTo);
    }
  }, []);

  const handleClick = () => {
    // Check for stored return URL first
    const storedReturnUrl = sessionStorage.getItem('cross_app_return_url');

    if (storedReturnUrl) {
      // Clear the stored URL and navigate to it
      sessionStorage.removeItem('cross_app_return_url');
      window.location.href = storedReturnUrl;
    } else if (href) {
      router.push(href);
    } else if (fallbackHref) {
      router.push(fallbackHref);
    }
  };

  return (
    <Button variant="ghost" size="icon" onClick={handleClick}>
      <ArrowLeft className="h-4 w-4" />
    </Button>
  );
}
