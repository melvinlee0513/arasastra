/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { CenterInvitationEmail } from '../_shared/email-templates/center-invitation.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ROOT_DOMAIN = 'arasaplus.info'
const SENDER_DOMAIN = 'notify.arasaplus.info'
const FROM_ADDRESS = `Aras A+ <no-reply@${SENDER_DOMAIN}>`

const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  tutor: 'Tutor',
  admin: 'Admin',
  superadmin: 'Superadmin',
}

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/

/**
 * Sends the centre invitation email (Email 1) for an existing invitation row.
 *
 * Authorisation is delegated to the existing `reveal_invitation_token` RPC,
 * invoked with the CALLER's JWT: it only returns a token when the caller is an
 * admin of that invitation's centre and the invitation is still pending,
 * unexpired and unrevoked. The tenant hostname is derived server-side from the
 * invitation's centre — never from a client-supplied host.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)

  let body: { invitationId?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }
  const invitationId = typeof body.invitationId === 'string' ? body.invitationId.trim() : ''
  if (!UUID_RE.test(invitationId)) return json({ error: 'invalid_invitation' }, 400)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const apiKeyConfigured = Boolean(Deno.env.get('LOVABLE_API_KEY'))

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const { data: userData } = await caller.auth.getUser()
  if (!userData?.user) return json({ error: 'unauthorized' }, 401)

  // Tenant-scoped authorisation + token retrieval in one trusted step.
  const { data: revealed, error: revealError } = await caller.rpc('reveal_invitation_token', {
    _invitation_id: invitationId,
  })
  if (revealError) {
    console.error('reveal_invitation_token failed', revealError.message)
    return json({ error: 'not_authorized' }, 403)
  }
  const row = Array.isArray(revealed) ? revealed[0] : revealed
  const token = (row as { token?: string } | null)?.token
  if (!token) return json({ error: 'invitation_not_sendable' }, 409)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: invitation, error: invError } = await admin
    .from('invitations')
    .select('id, email, role, center_id, expires_at, resend_count, invited_by')
    .eq('id', invitationId)
    .maybeSingle()
  if (invError || !invitation) return json({ error: 'invitation_not_found' }, 404)

  const { data: center } = await admin
    .from('tuition_centers')
    .select('name, subdomain_slug, domain_status')
    .eq('id', invitation.center_id)
    .maybeSingle()

  const slug = (center as { subdomain_slug?: string | null } | null)?.subdomain_slug ?? null
  const host =
    slug && SLUG_RE.test(slug) && (center as { domain_status?: string }).domain_status === 'active'
      ? `${slug}.${ROOT_DOMAIN}`
      : ROOT_DOMAIN
  const inviteUrl = `https://${host}/invite?token=${encodeURIComponent(token)}`

  let invitedByName: string | null = null
  if (invitation.invited_by) {
    const { data: inviter } = await admin
      .from('profiles')
      .select('full_name')
      .eq('user_id', invitation.invited_by)
      .maybeSingle()
    invitedByName = (inviter as { full_name?: string | null } | null)?.full_name ?? null
  }

  const centerName = (center as { name?: string } | null)?.name ?? 'your tuition centre'
  const expiresAtLabel = new Date(invitation.expires_at).toLocaleString('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const props = {
    centerName,
    roleLabel: ROLE_LABELS[invitation.role] ?? 'Member',
    inviteUrl,
    expiresAtLabel,
    invitedByName,
  }

  const messageId = crypto.randomUUID()
  const subject = `You're invited to join ${centerName} on Aras A+`
  const resendCount = invitation.resend_count ?? 0

  const markFailure = async (message: string) => {
    await admin
      .from('invitations')
      .update({ email_failed_at: new Date().toISOString(), last_send_error: message.slice(0, 500) })
      .eq('id', invitationId)
    await admin.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'center-invitation',
      recipient_email: invitation.email,
      status: 'failed',
      error_message: message.slice(0, 1000),
    })
  }

  if (!apiKeyConfigured) {
    await markFailure('Email provider is not configured')
    return json({ emailed: false, error: 'email_not_configured' }, 502)
  }

  // App emails must carry a one-click unsubscribe token (provider requirement).
  // Reuse the recipient's existing token when present, otherwise mint one.
  const resolveUnsubscribeToken = async (): Promise<string | null> => {
    const { data: existing } = await admin
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', invitation.email)
      .maybeSingle()
    const found = (existing as { token?: string } | null)?.token
    if (found) return found

    const token = crypto.randomUUID()
    const { error } = await admin
      .from('email_unsubscribe_tokens')
      .insert({ email: invitation.email, token })
    if (error) {
      const { data: retry } = await admin
        .from('email_unsubscribe_tokens')
        .select('token')
        .eq('email', invitation.email)
        .maybeSingle()
      return (retry as { token?: string } | null)?.token ?? null
    }
    return token
  }

  try {
    const unsubscribeToken = await resolveUnsubscribeToken()
    if (!unsubscribeToken) {
      await markFailure('Could not resolve an unsubscribe token for this recipient')
      return json({ emailed: false, error: 'unsubscribe_token_unavailable' }, 500)
    }

    const html = await renderAsync(React.createElement(CenterInvitationEmail, props))
    const text = await renderAsync(React.createElement(CenterInvitationEmail, props), {
      plainText: true,
    })

    await admin.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'center-invitation',
      recipient_email: invitation.email,
      status: 'pending',
    })

    const { error: enqueueError } = await admin.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: invitation.email,
        from: FROM_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: 'center-invitation',
        // Unique per attempt: the provider rejects reuse of a key whose run failed.
        idempotency_key: `center-invitation-${invitationId}-${messageId}`,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    })

    if (enqueueError) {
      await markFailure(enqueueError.message ?? 'Failed to queue invitation email')
      return json({ emailed: false, error: 'enqueue_failed' }, 500)
    }

    await admin
      .from('invitations')
      .update({
        email_message_id: messageId,
        email_queued_at: new Date().toISOString(),
        email_failed_at: null,
        last_send_error: null,
        resend_count: resendCount + 1,
      })
      .eq('id', invitationId)

    return json({ emailed: true, recipient: invitation.email })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error'
    console.error('invitation email failed', message)
    await markFailure(message)
    return json({ emailed: false, error: 'send_failed' }, 500)
  }
})
