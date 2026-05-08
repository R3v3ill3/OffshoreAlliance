"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { IssueLinkResult } from "@/components/share/issue-link-dialog";

export function IssuedLinkResultDialog({
  result,
  onClose,
  title = "Leader link ready",
}: {
  result: IssueLinkResult | null;
  onClose: () => void;
  title?: string;
}) {
  const [copied, setCopied] = useState<"url" | "password" | null>(null);

  function copy(value: string, kind: "url" | "password") {
    void navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1500);
  }

  return (
    <Dialog
      open={!!result}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Share the link and the password using two different channels.</strong>{" "}
              For example: email the link, SMS the password. The password is only shown
              once - you cannot reveal it again from this screen.
            </div>

            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Link
              </Label>
              <div className="flex items-stretch gap-2">
                <p className="flex-1 break-all font-mono text-sm bg-muted p-2 rounded">
                  {result.url}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => copy(result.url, "url")}>
                  {copied === "url" ? <Check size={14} /> : <Copy size={14} />}
                  <span className="ml-1">Copy</span>
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Password
              </Label>
              <div className="flex items-stretch gap-2">
                <p className="flex-1 break-all font-mono text-sm bg-muted p-2 rounded">
                  {result.password}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copy(result.password, "password")}
                >
                  {copied === "password" ? <Check size={14} /> : <Copy size={14} />}
                  <span className="ml-1">Copy</span>
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Expires in {result.expires_in_hours} hour
              {result.expires_in_hours === 1 ? "" : "s"}
              {result.expires_at ? ` (${new Date(result.expires_at).toLocaleString()})` : ""}.
            </p>
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
