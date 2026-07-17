/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { BRAND, styles } from './_brand.ts'

interface LayoutProps {
  preview: string
  heading: string
  intro: React.ReactNode
  cta?: { label: string; href: string }
  notice?: React.ReactNode
  children?: React.ReactNode
}

export const BrandedEmail = ({
  preview,
  heading,
  intro,
  cta,
  notice,
  children,
}: LayoutProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={styles.outer}>
      <Container style={styles.container}>
        <Text style={styles.brandWordmark}>{BRAND.name}</Text>
        <Heading style={styles.h1}>{heading}</Heading>
        <Text style={styles.text}>{intro}</Text>
        {cta ? (
          <Button style={styles.button} href={cta.href}>
            {cta.label}
          </Button>
        ) : null}

        {children}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Text style={styles.footer}>{BRAND.footerLine}</Text>
      </Container>
    </Body>
  </Html>
)

export default BrandedEmail
