'use client';

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getWarningCounts, type WarningLevel } from "@/lib/expiry-warnings";

interface Agreement {
  agreement_id: number;
  name: string;
  expiry_date: string | null;
  is_greenfields?: boolean;
}

interface WarningCounts {
  none: number;
  low: number;
  prominent: number;
}

export function ExpiryWarningDashboard() {
  const [counts, setCounts] = useState<WarningCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchWarningCounts() {
      try {
        const { data: agreements, error } = await supabase
          .from("agreements")
          .select("agreement_id, name, expiry_date, is_greenfields");

        if (error) throw error;

        const warningCounts = getWarningCounts(agreements ?? []);
        setCounts(warningCounts);
      } catch (err) {
        console.error("Error fetching warning counts:", err);
        setError("Failed to load expiry warnings");
      } finally {
        setLoading(false);
      }
    }

    fetchWarningCounts();
  }, [supabase]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !counts) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600">{error ?? "Failed to load expiry warnings"}</p>
      </div>
    );
  }

  const cards = [
    {
      level: 'prominent' as WarningLevel,
      title: 'Critical',
      count: counts.prominent,
      description: 'Expires in < 6 months',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-800',
      icon: '⚠️',
    },
    {
      level: 'low' as WarningLevel,
      title: 'Warning',
      count: counts.low,
      description: 'Expires in 6-12 months',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      textColor: 'text-yellow-800',
      icon: '⏰',
    },
    {
      level: 'none' as WarningLevel,
      title: 'Good Standing',
      count: counts.none,
      description: 'Expires in > 12 months',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      textColor: 'text-green-800',
      icon: '✓',
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Agreement Expiry Status
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div
            key={card.level}
            className={`p-4 rounded-lg border ${card.bgColor} ${card.borderColor}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{card.icon}</span>
              <span className={`text-3xl font-bold ${card.textColor}`}>
                {card.count}
              </span>
            </div>
            <h3 className={`font-semibold ${card.textColor} mb-1`}>
              {card.title}
            </h3>
            <p className={`text-sm ${card.textColor} opacity-80`}>
              {card.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
