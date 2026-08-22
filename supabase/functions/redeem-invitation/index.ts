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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Invite redemption.
 *
 * Client-side `auth.signUp()` could not be used for invite redemption:
 *  - it silently succeeds for an email that already has an account (so the
 *    invitation was never consumed and no verification email was ever sent);
 *  - it left invitation consumption to a trigger whose failures were swallowed,
 *    so the link stayed reusable.
 *
 * This function claims the invitation atomically (single winner even under
 * concurrent redemption), then creates the auth user with the invitation's
 * canonical role + center_id and an UNCONFIRMED email. If user creation fails
 * the claim is released so the invitation returns to pending.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { token?: unknown; password?: unknown; fullName?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const fullName =
    typeof body.fullName === 'string' ? body.fullName.trim().slice(0, 100) : ''

  if (!UUID_RE.test(token)) return json({ error: 'invalid_token' }, 400)
  if (password.length < 8 || password.length > 200) {
    return json({ error: 'weak_password' }, 400)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // Peek at the invitation only to detect an existing account BEFORE burning it.
  const { data: peekRows } = await admin
    .from('invitations')
    .select('email')
    .eq('token', token)
    .eq('status', 'pending')
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  const peekEmail = (peekRows as { email?: string } | null)?.email ?? null
  if (!peekEmail) return json({ error: 'invitation_unavailable' }, 409)

  const { data: exists, error: existsErr } = await admin.rpc('auth_user_exists', {
    _email: peekEmail,
  })
  if (existsErr) {
    console.error('auth_user_exists failed', existsErr)
    return json({ error: 'server_error' }, 500)
  }
  if (exists === true) return json({ error: 'account_exists' }, 409)

  // Atomic claim — only one concurrent redemption can win.
  const { data: claimRows, error: claimErr } = await admin.rpc(
    'claim_invitation_for_signup',
    { _token: token },
  )
  if (claimErr) {
    console.error('claim_invitation_for_signup failed', claimErr)
    return json({ error: 'server_error' }, 500)
  }
  const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows
  if (!claim?.id) return json({ error: 'invitation_unavailable' }, 409)

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: claim.email,
    password,
    email_confirm: false,
    user_metadata: {
      full_name: fullName || String(claim.email).split('@')[0],
      role: claim.role,
      center_id: claim.center_id,
    },
  })

  if (createErr || !created?.user) {
    console.error('createUser failed', createErr)
    await admin.rpc('release_invitation_claim', { _invitation_id: claim.id })
    const message = `${createErr?.message ?? ''}`.toLowerCase()
    if (message.includes('already') || message.includes('registered')) {
      return json({ error: 'account_exists' }, 409)
    }
    return json({ error: 'server_error' }, 500)
  }

  // The admin createUser call above never sends mail, so the new account would
  // otherwise sit unconfirmed with no verification email ever delivered.
  // Trigger the standard signup confirmation email (branded auth email hook)
  // with an anon client — failures must not undo a successful redemption.
  let verificationEmailSent = false
  if (!created.user.email_confirmed_at) {
    const anonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
      ''
    if (anonKey) {
      const publicClient = createClient(Deno.env.get('SUPABASE_URL')!, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { error: resendErr } = await publicClient.auth.resend({
        type: 'signup',
        email: claim.email,
      })
      if (resendErr) {
        console.error('verification email resend failed', resendErr)
      } else {
        verificationEmailSent = true
      }
    } else {
      console.error('no anon key available to send verification email')
    }
  }

  return json({
    ok: true,
    email: claim.email,
    role: claim.role,
    requiresEmailVerification: !created.user.email_confirmed_at,
    verificationEmailSent,
  })
})
