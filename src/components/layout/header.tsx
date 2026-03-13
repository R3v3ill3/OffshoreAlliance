"use client";

import { usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { MobileNav } from "./mobile-nav";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/workers": "Workers",
  "/employers": "Employers",
  "/worksites": "Worksites",
  "/agreements": "Agreements (EBAs)",
  "/campaigns": "Campaigns",
  "/reports": "Reports",
  "/administration": "Administration",
  "/organiser-patches": "Organiser Patches",
};

export function Header() {
  const pathname = usePathname();
  const basePath = "/" + (pathname.split("/")[1] || "");
  const title = pageTitles[basePath] || "Offshore Alliance";

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-4 md:px-6">
      <div className="flex items-center gap-4">
        <MobileNav />
        <h1 className="text-lg md:text-xl font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-64 hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="pl-8"
          />
        </div>
      </div>
    </header>
  );
}
