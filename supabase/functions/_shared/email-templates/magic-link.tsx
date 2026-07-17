/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { BrandedEmail } from './_layout.tsx'

interface Props {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: Props) => (
  <BrandedEmail
    preview="Your Aras A+ sign-in link"
    heading="Sign in to Aras A+"
    intro="Use the secure link below to sign in to your Aras A+ account."
    cta={{ label: 'Sign in securely', href: confirmationUrl }}
    notice="Never share or forward this email. Anyone with this link can sign in as you. It expires shortly and can only be used once."
  />
)

export default MagicLinkEmail
