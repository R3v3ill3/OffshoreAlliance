"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, LogOut } from "lucide-react";
import { navItems, adminItems } from "./sidebar";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user, profile, signOut, isAdmin } = useAuth();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden mr-2">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] p-0 flex flex-col">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded">
              <video
                src="/heritage_Eureka.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="h-full w-full object-cover"
                aria-hidden
              />
            </div>
            <span>Offshore Alliance</span>
          </SheetTitle>
        </SheetHeader>
        
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="grid gap-1 px-2">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "hover:bg-secondary/50 hover:text-secondary-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {isAdmin && (
              <>
                <Separator className="my-2" />
                {adminItems.map((item) => {
                  const isActive =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-secondary text-secondary-foreground"
                          : "hover:bg-secondary/50 hover:text-secondary-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </>
            )}
          </nav>
        </div>

        <div className="border-t p-4 bg-background">
          {user && (
            <div className="mb-2 px-2 text-sm font-medium truncate">
              {profile?.display_name || user.email}
            </div>
          )}
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sign out</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
