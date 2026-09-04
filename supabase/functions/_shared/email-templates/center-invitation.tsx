/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { BrandedEmail } from './_layout.tsx'
import { styles } from './_brand.ts'

interface Props {
  centerName: string
  roleLabel: string
  inviteUrl: string
  expiresAtLabel: string
  invitedByName?: string | null
}

/**
 * Centre invitation email (Email 1) — sent as soon as a tenant admin creates an
 * invitation. Distinct from the post-signup verification email (Email 2).
 */
export const CenterInvitationEmail = ({
  centerName,
  roleLabel,
  inviteUrl,
  expiresAtLabel,
  invitedByName,
}: Props) => (
  <BrandedEmail
    preview={`You're invited to join ${centerName} on Aras A+`}
    heading={`You're invited to join ${centerName} 🎓`}
    intro={`${invitedByName ? `${invitedByName} at ${centerName}` : centerName} has invited you to create an account on Aras A+.`}
    cta={{ label: 'Create your account', href: inviteUrl }}
    notice={`This invitation link is single-use and expires on ${expiresAtLabel}. If you weren't expecting this invitation, you can safely ignore this email.`}
  >
    <Text style={styles.text}>
      Your role: <strong>{roleLabel}</strong>
    </Text>
    <Text style={styles.fallbackLabel}>Or paste this link into your browser:</Text>
    <Text style={styles.fallbackUrl}>{inviteUrl}</Text>
  </BrandedEmail>
)

export default CenterInvitationEmail
