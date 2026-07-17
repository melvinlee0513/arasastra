/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { BrandedEmail } from './_layout.tsx'

interface Props {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ confirmationUrl }: Props) => (
  <BrandedEmail
    preview="You're invited to join Aras A+"
    heading="You're invited to join Aras A+"
    intro="Your tuition centre has invited you to join Aras A+. Accept the invitation to set up your account."
    cta={{ label: 'Accept invitation', href: confirmationUrl }}
    notice="This invitation link expires shortly and can only be used once. If it has been revoked or already used, it will no longer work."
  />
)

export default InviteEmail
