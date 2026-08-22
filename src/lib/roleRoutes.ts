/**
 * Canonical workspace ownership per role.
 *
 * Roles come from `user_roles` (via useAuth) only — never from the current
 * route, UI state, class assignment or profile metadata.
 *
 *   student     → /dashboard
 *   tutor       → /tutor
 *   admin       → /admin
 *   superadmin  → /admin (tenant-aware behaviour lives inside the admin shell)
 */
export function workspaceHomePath(roleFlags: {
  isAdmin: boolean;
  isTutor: boolean;
}): string {
  if (roleFlags.isAdmin) return "/admin";
  if (roleFlags.isTutor) return "/tutor";
  return "/dashboard";
}
