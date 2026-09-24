"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NameCreatePayload } from "@/lib/hooks/useDecideNameMatch";
import type { NameReviewEntity } from "@/lib/hooks/useNameMatchReviews";
import { WORKSITE_TYPES, type EmployerCategory } from "@/types/organising-row-types";

const EMPLOYER_CATEGORIES: EmployerCategory[] = [
  "Producer",
  "Major_Contractor",
  "Subcontractor",
  "Labour_Hire",
  "Specialist",
  "Principal_Employer",
];

const NO_CATEGORY = "__none__";

interface Props {
  entity: NameReviewEntity;
  rawName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  /** The decide route's message, verbatim (a 409 names the existing row). */
  error: string | null;
  onSubmit: (create: NameCreatePayload) => void;
}

/**
 * The last action on a queue row (D5): create the employer / worksite and
 * map the raw string to it, through the decide route's `create` action —
 * the only insert into either table on the import path.
 */
export function CreateNewDialog({ entity, rawName, open, onOpenChange, pending, error, onSubmit }: Props) {
  const [name, setName] = useState(rawName);
  const [tradingName, setTradingName] = useState("");
  const [category, setCategory] = useState<string>(NO_CATEGORY);
  const [worksiteType, setWorksiteType] = useState<string>("");
  const [isOffshore, setIsOffshore] = useState(false);
  const [trackedOpen, setTrackedOpen] = useState(open);

  // Re-seed from the raw string each time the dialog opens (prop-derived
  // state, the documented pattern — no effect).
  if (open !== trackedOpen) {
    setTrackedOpen(open);
    if (open) {
      setName(rawName);
      setTradingName("");
      setCategory(NO_CATEGORY);
      setWorksiteType("");
      setIsOffshore(false);
    }
  }

  const trimmed = name.trim();
  const valid = trimmed.length > 0 && (entity === "employer" || worksiteType !== "");
  const noun = entity === "employer" ? "employer" : "worksite";

  const submit = () => {
    if (!valid) return;
    if (entity === "employer") {
      onSubmit({
        employer_name: trimmed,
        trading_name: tradingName.trim() || null,
        employer_category: category === NO_CATEGORY ? null : category,
      });
    } else {
      onSubmit({ worksite_name: trimmed, worksite_type: worksiteType, is_offshore: isOffshore });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create new {noun}</DialogTitle>
          <DialogDescription>
            Nothing existing matched “{rawName}”. This creates the {noun}, maps the name to it and fills
            the workers imported with it.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="name-review-create-name">
              {entity === "employer" ? "Employer name" : "Worksite name"}
            </Label>
            <Input id="name-review-create-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {entity === "employer" ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="name-review-create-trading">Trading name (optional)</Label>
                <Input
                  id="name-review-create-trading"
                  value={tradingName}
                  onChange={(e) => setTradingName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="name-review-create-category">Category (optional)</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="name-review-create-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>Not set</SelectItem>
                    {EMPLOYER_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="name-review-create-type">Worksite type</Label>
                <Select value={worksiteType} onValueChange={setWorksiteType}>
                  <SelectTrigger id="name-review-create-type">
                    <SelectValue placeholder="Choose a type" />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKSITE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="name-review-create-offshore"
                  checked={isOffshore}
                  onCheckedChange={(v) => setIsOffshore(v === true)}
                />
                <Label htmlFor="name-review-create-offshore">Offshore</Label>
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || pending}>
              {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create and map
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
