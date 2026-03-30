'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error(error.message)
    } else {
      router.push('/dashboard')
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — video background */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-slate-900">
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src="/EurekaFlagVintage_2min.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/95 via-slate-900/40 to-slate-900/20" />
        {/* Branding content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <Image
              src="/apple-touch-icon.png"
              alt="Offshore Alliance"
              width={40}
              height={40}
              className="rounded-xl"
            />
            <span className="text-white font-semibold text-sm">Offshore Alliance</span>
          </div>
          <div>
            <blockquote className="text-white text-2xl font-semibold leading-snug mb-4">
              &ldquo;Winning enterprise bargaining campaigns through strategic planning.&rdquo;
            </blockquote>
            <p className="text-slate-300 text-sm">
              Campaign Strategic Planner — Playing to Win
            </p>
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center bg-white px-8 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile branding */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex justify-center mb-3">
              <Image
                src="/apple-touch-icon.png"
                alt="Offshore Alliance"
                width={48}
                height={48}
                className="rounded-xl"
              />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Offshore Alliance</h1>
            <p className="text-slate-500 text-sm mt-1">Campaign Strategic Planner</p>
          </div>

          {/* Desktop heading */}
          <div className="hidden lg:block mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
            <p className="text-slate-500 text-sm mt-1">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-8">
            Offshore Alliance &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}
