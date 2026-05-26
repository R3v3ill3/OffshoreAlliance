'use client'

/**
 * OutlookConnectionCard — surface for the user to connect, disconnect,
 * and inspect their Microsoft (Outlook) connection. Can live in
 * settings, or inline in the composer (as a CTA when the user reaches
 * for "Save to Outlook" without a connection).
 */

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Mail, Loader2, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useOutlookConnection } from '@/lib/hooks/useOutlookConnection'

interface Props {
  variant?: 'card' | 'inline'
  returnTo?: string
}

export function OutlookConnectionCard({ variant = 'card', returnTo }: Props) {
  const { connection, isLoading, connect, disconnect } = useOutlookConnection()

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const connected = !!connection?.connected
  const lastUsed = connection?.last_used_at
    ? new Date(connection.last_used_at).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  if (variant === 'inline') {
    return (
      <div className="rounded-md border bg-card p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {connected ? 'Outlook connected' : 'Outlook not connected'}
            </p>
            <p className="text-xs text-muted-foreground">
              {connected
                ? `Drafts will be saved to ${connection?.email ?? 'your mailbox'}.`
                : 'Connect your Microsoft 365 account to save personalised drafts directly into your Outlook.'}
            </p>
            {connection?.last_error && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {connection.last_error.slice(0, 140)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {connected ? (
            <>
              <Badge variant="secondary" className="text-[10px]">
                <ShieldCheck className="h-3 w-3 mr-1" />
                {connection?.email}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => void disconnect()}
              >
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => connect(returnTo)}
            >
              <Mail className="h-3 w-3" />
              Connect Outlook
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-blue-600" />
          Outlook (Microsoft 365)
        </CardTitle>
        <CardDescription>
          Connect your work mailbox so the composer can save personalised
          drafts directly into your Outlook Drafts folder. You then review and
          send from inside Outlook — the email leaves your own account with
          your normal signature and threading.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {connected ? (
          <>
            <div className="rounded-md border bg-muted/30 p-3 space-y-1">
              <p className="text-sm font-medium flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                Connected as {connection?.email}
              </p>
              {connection?.display_name && (
                <p className="text-xs text-muted-foreground">
                  {connection.display_name}
                </p>
              )}
              {lastUsed && (
                <p className="text-xs text-muted-foreground">
                  Last used: {lastUsed}
                </p>
              )}
              {connection?.last_error && (
                <p className="text-xs text-red-600 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5" />
                  {connection.last_error}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void disconnect()}
              >
                Disconnect
              </Button>
              <a
                href="https://myapps.microsoft.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
              >
                Manage in Microsoft <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              You&apos;ll be redirected to Microsoft to sign in and grant the
              following permissions:
            </p>
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
              <li>
                <strong>Read your profile</strong> — so we can display the
                connected mailbox here.
              </li>
              <li>
                <strong>Read and write mail</strong> — required to create
                drafts. We never send on your behalf; you send from Outlook.
              </li>
              <li>
                <strong>Maintain access while you&apos;re offline</strong> — so
                you don&apos;t have to reconnect every hour.
              </li>
            </ul>
            <Button
              type="button"
              onClick={() => connect(returnTo)}
              className="gap-1.5"
            >
              <Mail className="h-4 w-4" />
              Connect Outlook
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
