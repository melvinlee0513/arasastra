/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { BrandedEmail } from './_layout.tsx'

interface Props {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: Props) => (
  <BrandedEmail
    preview="Reset your Aras A+ password"
    heading="Reset your password"
    intro="We received a request to reset the password on your Aras A+ account. Choose a new password using the link below."
    cta={{ label: 'Reset password', href: confirmationUrl }}
    notice="If you didn't request a password reset, you can safely ignore this email. Your current password will remain unchanged."
  />
)

export default RecoveryEmail
