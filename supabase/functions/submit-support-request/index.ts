import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const CATEGORIES = [
  'Account / Login',
  'Password',
  'Classes / Enrolment',
  'Learning Materials',
  'Timetable',
  'Technical Issue',
  'Privacy / Data',
  'Other',
]

const MAX_BYTES = 10 * 1024 * 1024
const MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Strip control characters Postgres rejects (chr(0)) and normalise whitespace. */
const clean = (value: string, max: number) =>
  // deno-lint-ignore no-control-regex
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max)

/**
 * Support request intake.
 *
 * Tenant attribution (center_id), user_id and role are derived SERVER-SIDE from
 * the verified JWT — never from the request body — so a submitted ticket cannot
 * claim to belong to another centre or user. Signed-out visitors may submit with
 * an email address only; their ticket carries no centre or user.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }

  const category = clean(String(form.get('category') ?? ''), 60)
  const subject = clean(String(form.get('subject') ?? ''), 120)
  const description = clean(String(form.get('description') ?? ''), 3000)
  const bodyEmail = clean(String(form.get('email') ?? ''), 254).toLowerCase()
  const sourcePageUrl = clean(String(form.get('sourcePageUrl') ?? ''), 500)
  const attachment = form.get('attachment')

  if (!CATEGORIES.includes(category)) return json({ error: 'invalid_category' }, 400)
  if (subject.length < 3) return json({ error: 'invalid_subject' }, 400)
  if (description.length < 10) return json({ error: 'invalid_description' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ---- identity: verified session only -------------------------------------
  let userId: string | null = null
  let userEmail: string | null = null
  let centerId: string | null = null
  let roleSnapshot: string | null = null

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''

  if (token) {
    const { data: userData } = await admin.auth.getUser(token)
    const user = userData?.user ?? null
    if (user) {
      userId = user.id
      userEmail = user.email ?? null

      const [profileRes, rolesRes] = await Promise.all([
        admin.from('profiles').select('center_id').eq('user_id', user.id).maybeSingle(),
        admin.from('user_roles').select('role').eq('user_id', user.id),
      ])
      centerId = (profileRes.data?.center_id as string | null) ?? null
      const roles = (rolesRes.data ?? []).map((r: { role: string }) => r.role)
      roleSnapshot =
        ['superadmin', 'admin', 'tutor', 'student'].find((r) => roles.includes(r)) ?? null
    }
  }

  const requesterEmail = userEmail ?? bodyEmail
  if (!requesterEmail || !EMAIL_RE.test(requesterEmail)) {
    return json({ error: 'invalid_email' }, 400)
  }

  // ---- simple abuse guard: per-requester burst limit -----------------------
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const recent = admin
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
  const { count } = userId
    ? await recent.eq('user_id', userId)
    : await recent.eq('requester_email', requesterEmail)
  if ((count ?? 0) >= 5) return json({ error: 'rate_limited' }, 429)

  // ---- optional attachment -------------------------------------------------
  let attachmentPath: string | null = null
  if (attachment instanceof File && attachment.size > 0) {
    if (attachment.size > MAX_BYTES) return json({ error: 'attachment_too_large' }, 400)
    if (!MIME.includes(attachment.type)) return json({ error: 'attachment_unsupported' }, 400)

    const scope = userId ?? 'anonymous'
    attachmentPath = `${scope}/${crypto.randomUUID()}.${EXT[attachment.type]}`
    const { error: uploadError } = await admin.storage
      .from('support-attachments')
      .upload(attachmentPath, attachment, { contentType: attachment.type, upsert: false })
    if (uploadError) {
      console.error('[support] attachment upload failed', uploadError.message)
      return json({ error: 'attachment_failed' }, 400)
    }
  }

  const { data: inserted, error: insertError } = await admin
    .from('support_tickets')
    .insert({
      center_id: centerId,
      user_id: userId,
      role_snapshot: roleSnapshot,
      requester_email: requesterEmail,
      category,
      subject,
      description,
      source_page_url: sourcePageUrl || null,
      attachment_path: attachmentPath,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    console.error('[support] insert failed', insertError?.message)
    if (attachmentPath) {
      await admin.storage.from('support-attachments').remove([attachmentPath])
    }
    return json({ error: 'submit_failed' }, 500)
  }

  return json({ reference: String(inserted.id).slice(0, 8).toUpperCase() }, 201)
})
