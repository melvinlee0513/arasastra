import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getAvatarSignedUrl, initialsFor } from "@/lib/profile";

interface UserAvatarProps {
  path?: string | null;
  name?: string | null;
  className?: string;
  fallbackClassName?: string;
  /**
   * Bump this when the underlying avatar file has been replaced so the signed
   * URL is refetched (React Query key participates).
   */
  refreshKey?: string | number | null;
}

/**
 * Shared identity avatar. Renders a signed URL for the private "avatars"
 * bucket when available, otherwise falls back to initials. Safe for classmates,
 * roster views, leaderboards and account pages.
 */
export function UserAvatar({
  path, name, className, fallbackClassName, refreshKey,
}: UserAvatarProps) {
  const q = useQuery({
    queryKey: ["avatar-url", path, refreshKey ?? null],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: () => getAvatarSignedUrl(path!),
  });

  const initials = initialsFor(name);

  return (
    <Avatar className={cn(className)}>
      {q.data && <AvatarImage src={q.data} alt={name || "Profile"} />}
      <AvatarFallback className={cn("bg-primary/10 text-primary font-semibold", fallbackClassName)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

export default UserAvatar;
