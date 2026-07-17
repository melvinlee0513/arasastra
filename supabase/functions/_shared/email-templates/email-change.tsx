/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { BrandedEmail } from './_layout.tsx'

interface Props {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
}: Props) => (
  <BrandedEmail
    preview="Confirm your new email address"
    heading="Confirm your new email address"
    intro={
      <>
        A request was made to change the email on your Aras A+ account from{' '}
        <strong>{oldEmail}</strong> to <strong>{newEmail}</strong>. Confirm the
        change to keep your account up to date.
      </>
    }
    cta={{ label: 'Confirm email change', href: confirmationUrl }}
    notice="If you didn't request this change, do not click the link. Secure your account by resetting your password immediately."
  />
)

export default EmailChangeEmail
