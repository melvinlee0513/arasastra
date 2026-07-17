/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { BrandedEmail } from './_layout.tsx'
import { styles } from './_brand.ts'

interface Props {
  token: string
}

export const ReauthenticationEmail = ({ token }: Props) => (
  <BrandedEmail
    preview="Confirm this Aras A+ security action"
    heading="Confirm this security action"
    intro="You're performing a sensitive action on your Aras A+ account. Enter the verification code below to confirm it's you."
    notice="This code expires shortly. If you didn't request it, you can safely ignore this email."
  >
    <Text style={styles.code}>{token}</Text>
  </BrandedEmail>
)

export default ReauthenticationEmail
