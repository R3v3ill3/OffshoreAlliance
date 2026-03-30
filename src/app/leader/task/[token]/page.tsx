"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { VOTE_SUPPORTER_OPTIONS } from "@/lib/campaign/constants";

type WorkerRow = {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  existing_rating: number | null;
  binary_value: string | null;
  notes: string | null;
};

export default function LeaderTaskPage() {
  const params = useParams();
  const token = params.token as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [activityTitle, setActivityTitle] = useState("");
  const [isBinary, setIsBinary] = useState(false);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [binary, setBinary] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [prospective, setProspective] = useState<
    { first_name: string; last_name: string; email: string; phone: string; rating: string; notes: string }[]
  >([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/campaign-leader/${token}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        if (cancelled) return;
        setCampaignName(json.campaign?.name ?? "");
        setActivityTitle(json.activity?.title ?? "");
        setIsBinary(!!json.activity?.is_binary);
        const ws = (json.workers ?? []) as WorkerRow[];
        setWorkers(ws);
        const r: Record<number, number> = {};
        const b: Record<number, string> = {};
        const n: Record<number, string> = {};
        for (const w of ws) {
          if (w.existing_rating != null) r[w.worker_id] = w.existing_rating;
          if (w.binary_value) b[w.worker_id] = w.binary_value;
          if (w.notes) n[w.worker_id] = w.notes;
        }
        setRatings(r);
        setBinary(b);
        setNotes(n);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit() {
    setSaving(true);
    setSaved(false);
    try {
      const ratingsPayload = workers.map((w) => ({
        worker_id: w.worker_id,
        rating: ratings[w.worker_id] ?? w.existing_rating ?? 3,
        binary_value: isBinary ? (binary[w.worker_id] ?? null) : null,
        notes: notes[w.worker_id] ?? null,
      }));
      const prospectivePayload = prospective
        .filter((p) => p.first_name.trim() && p.last_name.trim())
        .map((p) => ({
          first_name: p.first_name.trim(),
          last_name: p.last_name.trim(),
          email: p.email.trim() || null,
          phone: p.phone.trim() || null,
          rating: p.rating ? Number(p.rating) : null,
          notes: p.notes.trim() || null,
        }));
      const res = await fetch(`/api/campaign-leader/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratings: ratingsPayload, prospective: prospectivePayload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Save failed");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <EurekaLoadingSpinner />
      </div>
    );
  }

  if (error && workers.length === 0) {
    return <p className="text-destructive text-center">{error}</p>;
  }

  return (
    <div className="space-y-6 print:text-black">
      <div>
        <h1 className="text-2xl font-bold">Task list</h1>
        <p className="text-muted-foreground">{campaignName}</p>
        <p className="font-medium mt-1">{activityTitle}</p>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Workers</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Rating (1–5)</TableHead>
                {isBinary && <TableHead>Response</TableHead>}
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.map((w) => (
                <TableRow key={w.worker_id}>
                  <TableCell className="font-medium">
                    {w.first_name} {w.last_name}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={String(ratings[w.worker_id] ?? "")}
                      onValueChange={(v) =>
                        setRatings((prev) => ({ ...prev, [w.worker_id]: Number(v) }))
                      }
                    >
                      <SelectTrigger className="w-24 h-9">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  {isBinary && (
                    <TableCell>
                      <Select
                        value={binary[w.worker_id] ?? ""}
                        onValueChange={(v) => setBinary((prev) => ({ ...prev, [w.worker_id]: v }))}
                      >
                        <SelectTrigger className="w-28 h-9">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {VOTE_SUPPORTER_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  )}
                  <TableCell>
                    <Input
                      className="h-9 min-w-[120px]"
                      value={notes[w.worker_id] ?? ""}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [w.worker_id]: e.target.value }))
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Additional workers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {prospective.map((row, i) => (
            <div key={i} className="grid sm:grid-cols-2 gap-2 border-b pb-3">
              <Input
                placeholder="First name"
                value={row.first_name}
                onChange={(e) => {
                  const next = [...prospective];
                  next[i] = { ...next[i], first_name: e.target.value };
                  setProspective(next);
                }}
              />
              <Input
                placeholder="Last name"
                value={row.last_name}
                onChange={(e) => {
                  const next = [...prospective];
                  next[i] = { ...next[i], last_name: e.target.value };
                  setProspective(next);
                }}
              />
              <Input
                placeholder="Email"
                value={row.email}
                onChange={(e) => {
                  const next = [...prospective];
                  next[i] = { ...next[i], email: e.target.value };
                  setProspective(next);
                }}
              />
              <Input
                placeholder="Phone"
                value={row.phone}
                onChange={(e) => {
                  const next = [...prospective];
                  next[i] = { ...next[i], phone: e.target.value };
                  setProspective(next);
                }}
              />
              <Select
                value={row.rating || "__none__"}
                onValueChange={(v) => {
                  const next = [...prospective];
                  next[i] = { ...next[i], rating: v === "__none__" ? "" : v };
                  setProspective(next);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Notes"
                value={row.notes}
                onChange={(e) => {
                  const next = [...prospective];
                  next[i] = { ...next[i], notes: e.target.value };
                  setProspective(next);
                }}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setProspective((p) => [
                ...p,
                { first_name: "", last_name: "", email: "", phone: "", rating: "", notes: "" },
              ])
            }
          >
            Add row
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved.</p>}

      <div className="flex gap-2 print:hidden">
        <Button onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? "Saving…" : "Submit ratings"}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Print
        </Button>
      </div>
    </div>
  );
}
