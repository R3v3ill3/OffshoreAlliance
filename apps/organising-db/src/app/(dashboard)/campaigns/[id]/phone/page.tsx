'use client'

import { useParams, useRouter } from 'next/navigation'
import { useCallLists } from '@/lib/hooks/useCallList'
import { useCallScripts } from '@/lib/hooks/useCallScripts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Phone, Plus, Play, Pause, FileText, Users, ArrowLeft,
  Loader2, BarChart3, Edit,
} from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  paused: 'bg-amber-100 text-amber-700',
  archived: 'bg-slate-100 text-slate-500',
}

export default function PhoneOpsPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = params.id as string

  const { data: lists, isLoading: listsLoading } = useCallLists(campaignId)
  const { data: scripts, isLoading: scriptsLoading } = useCallScripts(campaignId)

  const activeLists = lists?.filter((l) => l.status === 'active') || []
  const otherLists = lists?.filter((l) => l.status !== 'active') || []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/campaigns/${campaignId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Campaign
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Phone Operations
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage call lists, scripts, and call sessions
          </p>
        </div>
        <Button onClick={() => router.push(`/campaigns/${campaignId}/phone/lists/new`)}>
          <Plus className="h-4 w-4 mr-1" />
          New Call List
        </Button>
      </div>

      {/* Scripts section */}
      <div>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Call Scripts
          <Badge variant="secondary" className="text-xs">{scripts?.length || 0}</Badge>
        </h3>
        {scriptsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : scripts && scripts.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {scripts.map((script) => (
              <Card
                key={script.script_id}
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => router.push(`/campaigns/${campaignId}/phone/scripts/${script.script_id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{script.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {script.call_script_sections?.length || 0} sections
                      </p>
                    </div>
                    <Badge className={STATUS_COLORS[script.status] || ''} variant="secondary">
                      {script.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No call scripts yet. Generate a phone script in the Capacities step, then structure it for calling.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Active call lists */}
      {activeLists.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Play className="h-4 w-4 text-green-600" />
            Active Call Lists
          </h3>
          <div className="space-y-2">
            {activeLists.map((list) => (
              <CallListCard key={list.list_id} list={list} campaignId={campaignId} router={router} />
            ))}
          </div>
        </div>
      )}

      {/* Other lists */}
      <div>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" />
          All Call Lists
          <Badge variant="secondary" className="text-xs">{lists?.length || 0}</Badge>
        </h3>
        {listsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : otherLists.length > 0 || activeLists.length > 0 ? (
          <div className="space-y-2">
            {[...activeLists, ...otherLists].map((list) => (
              <CallListCard key={list.list_id} list={list} campaignId={campaignId} router={router} />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No call lists yet</p>
              <Button
                variant="outline" size="sm"
                onClick={() => router.push(`/campaigns/${campaignId}/phone/lists/new`)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create First List
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function CallListCard({
  list,
  campaignId,
  router,
}: {
  list: Record<string, unknown>
  campaignId: string
  router: ReturnType<typeof useRouter>
}) {
  const listId = list.list_id as number
  const name = list.name as string
  const status = list.status as string
  const totalItems = (list.total_items as number) || 0
  const completedItems = (list.completed_items as number) || 0
  const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0
  const script = list.call_scripts as Record<string, unknown> | null

  return (
    <Card className="hover:bg-muted/30 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium truncate">{name}</p>
              <Badge className={STATUS_COLORS[status] || ''} variant="secondary">
                {status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{completedItems}/{totalItems} contacts</span>
              {script && <span>Script: {script.title as string}</span>}
            </div>
            {totalItems > 0 && (
              <Progress value={progressPct} className="h-1 mt-2" />
            )}
          </div>
          <div className="flex items-center gap-1">
            {(status === 'active' || status === 'draft') && (
              <Button
                size="sm" variant="default"
                onClick={() => router.push(`/campaigns/${campaignId}/phone/call/${listId}`)}
              >
                <Phone className="h-3 w-3 mr-1" />
                Call
              </Button>
            )}
            <Button
              size="sm" variant="ghost"
              onClick={() => router.push(`/campaigns/${campaignId}/phone/lists/${listId}`)}
            >
              <Edit className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
