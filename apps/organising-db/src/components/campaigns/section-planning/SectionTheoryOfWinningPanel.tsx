'use client'

import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/supabase/auth-context'
import {
  useSaveSectionTheory,
  useSectionTheory,
} from '@/lib/hooks/useSectionTheoryAndSoc'

export function SectionTheoryOfWinningPanel({
  sectionPlanId,
}: {
  sectionPlanId: number
}) {
  const { canWrite } = useAuth()
  const { data: theory, isLoading } = useSectionTheory(sectionPlanId)
  const save = useSaveSectionTheory()
  const [statement, setStatement] = useState('')
  const [memberAgency, setMemberAgency] = useState('')
  const [employerResponse, setEmployerResponse] = useState('')

  useEffect(() => {
    if (theory) {
      setStatement(theory.if_then_statement ?? '')
      setMemberAgency(theory.member_agency_assessment ?? '')
      setEmployerResponse(theory.employer_response_plan ?? '')
    }
  }, [theory])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Theory of Winning
              {theory?.version != null && (
                <Badge variant="secondary">v{theory.version}</Badge>
              )}
              {theory?.ai_generated && <Badge variant="info">AI-drafted</Badge>}
            </CardTitle>
            <CardDescription>
              An if/then statement testing the bet — if we do X by Y, then Z
              follows. Each save creates a new version; older versions stay
              for audit.
            </CardDescription>
          </div>
          {canWrite && (
            <Button
              size="sm"
              onClick={() =>
                save.mutate({
                  section_plan_id: sectionPlanId,
                  if_then_statement: statement,
                  member_agency_assessment: memberAgency || null,
                  employer_response_plan: employerResponse || null,
                })
              }
              disabled={save.isPending || !statement.trim()}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {save.isPending ? 'Saving…' : 'Save new version'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        <div className="space-y-1">
          <Label htmlFor="tow-stmt">If/then statement</Label>
          <Textarea
            id="tow-stmt"
            rows={4}
            value={statement}
            placeholder="If we hit 60% rated and 4 leaders identified by 14 May, then a strong 'No' vote becomes credible by 25 May."
            onChange={(e) => setStatement(e.target.value)}
            disabled={!canWrite}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="tow-agency">Member agency assessment</Label>
            <Textarea
              id="tow-agency"
              rows={3}
              value={memberAgency}
              placeholder="What can workers actually do here?"
              onChange={(e) => setMemberAgency(e.target.value)}
              disabled={!canWrite}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tow-employer">Employer response plan</Label>
            <Textarea
              id="tow-employer"
              rows={3}
              value={employerResponse}
              placeholder="What does the employer do, and how do we respond?"
              onChange={(e) => setEmployerResponse(e.target.value)}
              disabled={!canWrite}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
