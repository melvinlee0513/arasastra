/**
 * Shared client-side password rules for Aras A+ account creation and password
 * recovery. Passwords are never stored, logged, or transmitted anywhere except
 * Supabase Auth.
 */

export const MIN_PASSWORD_LENGTH = 8;

/** Returns an error message, or null when the password satisfies the rules. */
export function validatePasswordStrength(password: string): string | null {
  if (!password) return "Password is required";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

/** Returns an error message, or null when both values are valid and equal. */
export function validatePasswordPair(
  password: string,
  confirmPassword: string,
): string | null {
  const strength = validatePasswordStrength(password);
  if (strength) return strength;
  if (!confirmPassword) return "Please confirm your password";
  if (password !== confirmPassword) return "Passwords do not match.";
  return null;
}
