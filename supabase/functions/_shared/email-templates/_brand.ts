// Shared Aras A+ brand tokens and email-safe style objects.
// One global design for every tenant. Do not add tenant-specific overrides.

export const BRAND = {
  name: 'Aras A+',
  primary: '#0052FF',
  midnight: '#0F172A',
  slate: '#475569',
  muted: '#64748B',
  border: '#E2E8F0',
  outerBg: '#F1F5F9',
  cardBg: '#FFFFFF',
  footerColor: '#94A3B8',
  hqUrl: 'https://arasaplus.info',
  footerLine: 'Aras A+ · Powered by Futron Digital',
} as const

export const styles = {
  outer: {
    backgroundColor: BRAND.outerBg,
    fontFamily:
      "-apple-system, BlinkMaxSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: '32px 12px',
  },
  container: {
    backgroundColor: BRAND.cardBg,
    borderRadius: '16px',
    padding: '32px 28px',
    maxWidth: '520px',
    margin: '0 auto',
    boxShadow: '0 8px 30px rgba(15,23,42,0.06)',
  },
  brandWordmark: {
    color: BRAND.primary,
    fontSize: '20px',
    fontWeight: 700 as const,
    letterSpacing: '-0.01em',
    margin: '0 0 24px',
  },
  h1: {
    color: BRAND.midnight,
    fontSize: '22px',
    fontWeight: 700 as const,
    lineHeight: '1.3',
    margin: '0 0 12px',
  },
  text: {
    color: BRAND.slate,
    fontSize: '15px',
    lineHeight: '1.6',
    margin: '0 0 18px',
  },
  button: {
    backgroundColor: BRAND.primary,
    color: '#FFFFFF',
    fontSize: '15px',
    fontWeight: 600 as const,
    borderRadius: '9999px',
    padding: '13px 26px',
    textDecoration: 'none',
    display: 'inline-block',
  },
  fallbackLabel: {
    color: BRAND.muted,
    fontSize: '12px',
    margin: '24px 0 6px',
  },
  fallbackUrl: {
    color: BRAND.primary,
    fontSize: '12px',
    wordBreak: 'break-all' as const,
    margin: '0 0 24px',
  },
  notice: {
    color: BRAND.muted,
    fontSize: '12px',
    lineHeight: '1.5',
    margin: '24px 0 0',
    borderTop: `1px solid ${BRAND.border}`,
    paddingTop: '18px',
  },
  footer: {
    color: BRAND.footerColor,
    fontSize: '11px',
    textAlign: 'center' as const,
    margin: '20px 0 0',
  },
  code: {
    fontFamily: 'Menlo, Consolas, monospace',
    fontSize: '28px',
    fontWeight: 700 as const,
    letterSpacing: '6px',
    color: BRAND.midnight,
    backgroundColor: BRAND.outerBg,
    borderRadius: '10px',
    padding: '16px 20px',
    textAlign: 'center' as const,
    margin: '0 0 20px',
  },
}
