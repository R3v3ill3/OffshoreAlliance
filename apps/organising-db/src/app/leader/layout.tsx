import type { ReactNode } from "react";

export default function LeaderLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
