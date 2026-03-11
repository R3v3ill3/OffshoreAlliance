"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="flex w-full max-w-2xl flex-col gap-0">

        {/* Header */}
        <div className="pb-4 text-center">
          <h1 className="text-2xl font-black uppercase tracking-widest text-white">
            Offshore Alliance
          </h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-zinc-500">
            Campaign Database
          </p>
        </div>

        {/* Video frame */}
        <div className="w-full border-2 border-zinc-600 bg-black aspect-video overflow-hidden">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
          >
            <source src="/heritage_Eureka.mp4" type="video/mp4" />
          </video>
        </div>

        {/* Sign-in card */}
        <div className="border-2 border-t-0 border-zinc-600 bg-zinc-900 p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-widest text-zinc-400"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@offshorealliance.org.au"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-widest text-zinc-400"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 px-4 py-2.5 text-sm font-black uppercase tracking-widest text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
