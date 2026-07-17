/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { BrandedEmail } from './_layout.tsx'

interface Props {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ confirmationUrl }: Props) => (
  <BrandedEmail
    preview="Confirm your Aras A+ account"
    heading="Confirm your email"
    intro="Welcome to Aras A+. Confirm your email address to activate your account and start learning."
    cta={{ label: 'Confirm email', href: confirmationUrl }}
    notice="This link expires shortly and can only be used once. If you didn't create an Aras A+ account, you can safely ignore this email."
  />
)

export default SignupEmail
