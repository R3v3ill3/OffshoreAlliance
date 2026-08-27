'use client'

/**
 * Email wrapper management — the reusable header/footer shells applied
 * around every platform (SendGrid) send. List + editor with live
 * preview; the {{unsubscribe_url}} placeholder is mandatory in the
 * footer and validated both here and server-side.
 *
 * Reads are open to all staff; creating/editing is admin-only (RLS) —
 * the API surfaces a 403 for non-admins.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Loader2, Plus, Pencil, Trash2, Mail, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { fetchApi } from '@/lib/api/fetch-api'

const UNSUBSCRIBE_PLACEHOLDER = '{{unsubscribe_url}}'

interface WrapperRow {
  wrapper_id: number
  name: string
  description: string | null
  header_html: string
  footer_html: string
  is_default: boolean
  is_active: boolean
  created_at: string
}

const SAMPLE_BODY =
  '<p>Hi Alex,</p><p>This is where the email body you write in the composer will appear, wrapped by the header above and the footer below.</p><p>In solidarity,<br/>Offshore Alliance</p>'

function previewHtml(headerHtml: string, footerHtml: string): string {
  return (headerHtml + SAMPLE_BODY + footerHtml)
    .split(UNSUBSCRIBE_PLACEHOLDER)
    .join('#unsubscribe-preview')
}

interface EditorState {
  wrapper_id: number | null
  name: string
  description: string
  header_html: string
  footer_html: string
  is_default: boolean
  is_active: boolean
}

const EMPTY_EDITOR: EditorState = {
  wrapper_id: null,
  name: '',
  description: '',
  header_html: '',
  footer_html: `<p><a href="${UNSUBSCRIBE_PLACEHOLDER}">Unsubscribe</a> from these emails.</p>`,
  is_default: false,
  is_active: true,
}

export default function EmailWrappersPage() {
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [deleting, setDeleting] = useState<WrapperRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['email-wrappers'],
    queryFn: async () => {
      const res = await fetchApi('/api/email/wrappers')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load wrappers')
      return json.wrappers as WrapperRow[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (state: EditorState) => {
      const isNew = state.wrapper_id == null
      const res = await fetchApi(
        isNew ? '/api/email/wrappers' : `/api/email/wrappers/${state.wrapper_id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: state.name,
            description: state.description,
            header_html: state.header_html,
            footer_html: state.footer_html,
            is_default: state.is_default,
            is_active: state.is_active,
          }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      return json.wrapper as WrapperRow
    },
    onSuccess: () => {
      toast.success('Wrapper saved.')
      setEditor(null)
      void queryClient.invalidateQueries({ queryKey: ['email-wrappers'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (wrapperId: number) => {
      const res = await fetchApi(`/api/email/wrappers/${wrapperId}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Delete failed')
    },
    onSuccess: () => {
      toast.success('Wrapper deleted.')
      setDeleting(null)
      void queryClient.invalidateQueries({ queryKey: ['email-wrappers'] })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const missingPlaceholder =
    editor != null &&
    !editor.footer_html.includes(UNSUBSCRIBE_PLACEHOLDER) &&
    !editor.header_html.includes(UNSUBSCRIBE_PLACEHOLDER)

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Mail className="h-6 w-6" />
            Email wrappers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Header/footer shells applied around every platform email send.
            The footer must carry the unsubscribe placeholder.
          </p>
        </div>
        <Button onClick={() => setEditor({ ...EMPTY_EDITOR })}>
          <Plus className="h-4 w-4 mr-1.5" />
          New wrapper
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading wrappers…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data ?? []).map((w) => (
            <Card key={w.wrapper_id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {w.name}
                  {w.is_default && <Badge variant="secondary">Default</Badge>}
                  {!w.is_active && <Badge variant="outline">Inactive</Badge>}
                </CardTitle>
                {w.description && (
                  <CardDescription className="text-xs">
                    {w.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <iframe
                  title={`Preview of ${w.name}`}
                  sandbox=""
                  srcDoc={previewHtml(w.header_html, w.footer_html)}
                  className="w-full h-56 rounded border bg-white"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setEditor({
                        wrapper_id: w.wrapper_id,
                        name: w.name,
                        description: w.description ?? '',
                        header_html: w.header_html,
                        footer_html: w.footer_html,
                        is_default: w.is_default,
                        is_active: w.is_active,
                      })
                    }
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDeleting(w)}
                    disabled={w.is_default}
                    title={
                      w.is_default
                        ? 'The default wrapper cannot be deleted — set another wrapper as default first.'
                        : undefined
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {(data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground col-span-2">
              No wrappers yet. Create one — every platform send requires a
              wrapper with an unsubscribe footer.
            </p>
          )}
        </div>
      )}

      {/* Editor dialog */}
      <Dialog open={editor != null} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editor?.wrapper_id == null ? 'New wrapper' : 'Edit wrapper'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              The body written in the composer is inserted between the header
              and footer HTML. <code>{UNSUBSCRIBE_PLACEHOLDER}</code> is
              replaced with each recipient&apos;s personal unsubscribe link at
              send time.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={editor.name}
                    onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                    placeholder="e.g. OA Default"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input
                    value={editor.description}
                    onChange={(e) =>
                      setEditor({ ...editor, description: e.target.value })
                    }
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Header HTML</Label>
                  <Textarea
                    value={editor.header_html}
                    onChange={(e) =>
                      setEditor({ ...editor, header_html: e.target.value })
                    }
                    rows={7}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Footer HTML</Label>
                  <Textarea
                    value={editor.footer_html}
                    onChange={(e) =>
                      setEditor({ ...editor, footer_html: e.target.value })
                    }
                    rows={7}
                    className="font-mono text-xs"
                  />
                  {missingPlaceholder && (
                    <p className="text-xs text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Footer must contain {UNSUBSCRIBE_PLACEHOLDER}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={editor.is_default}
                      onCheckedChange={(v) => setEditor({ ...editor, is_default: v })}
                    />
                    Default wrapper
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={editor.is_active}
                      onCheckedChange={(v) => setEditor({ ...editor, is_active: v })}
                    />
                    Active
                  </label>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Live preview (with sample body)</Label>
                <iframe
                  title="Wrapper preview"
                  sandbox=""
                  srcDoc={previewHtml(editor.header_html, editor.footer_html)}
                  className="w-full h-[420px] rounded border bg-white"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => editor && saveMutation.mutate(editor)}
              disabled={
                !editor || !editor.name.trim() || missingPlaceholder || saveMutation.isPending
              }
            >
              {saveMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Save wrapper
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete wrapper?</DialogTitle>
            <DialogDescription className="text-xs">
              &quot;{deleting?.name}&quot; will be removed. Drafts and lists
              referencing it fall back to the default wrapper.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleting && deleteMutation.mutate(deleting.wrapper_id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
