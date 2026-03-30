"use client";

import Image from "next/image";

type Size = "sm" | "md" | "lg" | "inline";

const sizeMap = {
  sm: 24,
  md: 48,
  lg: 72,
  inline: 20,
};

interface EurekaLoadingSpinnerProps {
  size?: Size;
  className?: string;
}

/**
 * Loading spinner using the Eureka flag GIF for loading states across the app.
 */
export function EurekaLoadingSpinner({ size = "md", className = "" }: EurekaLoadingSpinnerProps) {
  const px = sizeMap[size];
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      role="status"
      aria-label="Loading"
    >
      <Image
        src="/eurekaflag.gif"
        alt=""
        width={px}
        height={px}
        className="object-contain"
        unoptimized
      />
    </div>
  );
}
