"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import {
  HR_SENTIMENT_SCALE,
  type HrSentiment,
} from "@/lib/situation-analysis/constants";
import type { HrPosture } from "@/lib/situation-analysis/types";

interface HrPostureFieldProps {
  posture: HrPosture;
  onChange: (next: HrPosture) => void;
}

export function HrPostureField({ posture, onChange }: HrPostureFieldProps) {
  const contacts = posture.contacts ?? [];

  const updateContact = (
    index: number,
    patch: Partial<NonNullable<HrPosture["contacts"]>[number]>
  ) => {
    onChange({
      ...posture,
      contacts: contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    });
  };

  const removeContact = (index: number) => {
    onChange({
      ...posture,
      contacts: contacts.filter((_, i) => i !== index),
    });
  };

  const addContact = () => {
    onChange({
      ...posture,
      contacts: [...contacts, { name: "", role: "", posture: null, notes: "" }],
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        How does HR / employer reps actually behave? Hostile postures predict
        captive-audience meetings and disciplinary risk; cooperative postures
        change pacing and access to the workforce.
      </p>

      <div className="space-y-2">
        <Label>Overall posture</Label>
        <Select
          value={posture.sentiment ?? ""}
          onValueChange={(v) =>
            onChange({
              ...posture,
              sentiment: (v || null) as HrSentiment | null,
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {HR_SENTIMENT_SCALE.map((level) => (
              <SelectItem key={level.id} value={level.id}>
                {level.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <Textarea
          rows={2}
          value={posture.notes ?? ""}
          onChange={(e) => onChange({ ...posture, notes: e.target.value })}
          placeholder="Recent shifts in posture, who's setting the tone, useful background."
        />
      </div>

      <div className="space-y-2">
        <Label>Named contacts</Label>
        {contacts.length === 0 && (
          <p className="text-sm text-muted-foreground italic">None recorded.</p>
        )}
        {contacts.map((contact, index) => (
          <div
            key={index}
            className="rounded-md border bg-muted/20 p-3 space-y-3"
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={contact.name}
                  onChange={(e) =>
                    updateContact(index, { name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Input
                  value={contact.role ?? ""}
                  onChange={(e) =>
                    updateContact(index, { role: e.target.value })
                  }
                  placeholder="e.g. HR Manager, IR lead, Site Manager"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Personal posture</Label>
              <Select
                value={contact.posture ?? ""}
                onValueChange={(v) =>
                  updateContact(index, {
                    posture: (v || null) as HrSentiment | null,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Same as overall —" />
                </SelectTrigger>
                <SelectContent>
                  {HR_SENTIMENT_SCALE.map((level) => (
                    <SelectItem key={level.id} value={level.id}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                rows={2}
                value={contact.notes ?? ""}
                onChange={(e) =>
                  updateContact(index, { notes: e.target.value })
                }
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeContact(index)}
              className="text-muted-foreground"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove contact
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addContact}>
          <Plus className="h-4 w-4 mr-2" />
          Add contact
        </Button>
      </div>
    </div>
  );
}
