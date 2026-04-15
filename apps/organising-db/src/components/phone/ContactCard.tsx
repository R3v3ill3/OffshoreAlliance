'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Phone, Mail, Briefcase, MapPin, Clock, MessageCircle, Pencil } from 'lucide-react'
import type { CallListItemWithWorker } from '@/types/planner-types'

interface ContactCardProps {
  contact: CallListItemWithWorker
  onEdit?: () => void
}

export function ContactCard({ contact, onEdit }: ContactCardProps) {
  const { worker, connection, recent_attempts } = contact
  if (!worker) return null

  const lastAttempt = recent_attempts?.[0]

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-primary">
              {worker.first_name?.[0]}{worker.last_name?.[0]}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">
                {worker.first_name} {worker.last_name}
              </h3>
              {onEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  onClick={onEdit}
                  title="Edit contact details"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
              {worker.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  <a href={`tel:${worker.phone}`} className="font-mono hover:text-primary">
                    {worker.phone}
                  </a>
                </span>
              )}
              {worker.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {worker.email}
                </span>
              )}
              {worker.occupation && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {worker.occupation}
                </span>
              )}
              {worker.employer_name && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {worker.employer_name}
                  {worker.worksite_name && ` — ${worker.worksite_name}`}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {connection?.support_level && (
                <Badge variant="secondary" className="text-xs">
                  {connection.support_level.replace(/_/g, ' ')}
                </Badge>
              )}
              {connection?.connection_status && (
                <Badge variant="outline" className="text-xs">
                  {connection.connection_status}
                </Badge>
              )}
              {contact.attempts_count > 0 && (
                <Badge variant="outline" className="text-xs">
                  {contact.attempts_count} prior attempt{contact.attempts_count !== 1 ? 's' : ''}
                </Badge>
              )}
              {contact.priority_score > 0 && (
                <Badge variant="outline" className="text-xs">
                  Priority: {Math.round(contact.priority_score)}
                </Badge>
              )}
            </div>

            {/* Previous attempt info */}
            {lastAttempt && (
              <div className="mt-2 p-2 rounded bg-muted/30 text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Last call: {new Date(lastAttempt.started_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  {' — '}
                  {lastAttempt.dial_disposition.replace(/_/g, ' ')}
                  {lastAttempt.call_disposition && ` / ${lastAttempt.call_disposition.replace(/_/g, ' ')}`}
                </div>
                {lastAttempt.overall_notes && (
                  <div className="flex items-start gap-1 mt-1">
                    <MessageCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{lastAttempt.overall_notes}</span>
                  </div>
                )}
              </div>
            )}

            {connection?.notes && (
              <div className="mt-2 p-2 rounded bg-amber-50 text-xs text-amber-800">
                <span className="font-medium">Connection note: </span>
                {connection.notes}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
