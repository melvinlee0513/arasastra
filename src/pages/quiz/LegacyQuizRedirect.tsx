import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The legacy /quiz/:quizId surfaces wrote quiz attempts directly from the
 * client, which the canonical quiz engine no longer permits. Old links are
 * resolved to the class quiz hub so students land on the supported flow.
 */
export function LegacyQuizRedirect() {
  const { quizId } = useParams<{ quizId: string }>();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!quizId) {
        setTarget("/dashboard/classes");
        return;
      }
      const { data } = await supabase
        .from("quizzes")
        .select("class_id")
        .eq("id", quizId)
        .maybeSingle();
      if (cancelled) return;
      setTarget(
        data?.class_id
          ? `/dashboard/classes/${data.class_id}/quizzes`
          : "/dashboard/classes",
      );
    })();
    return () => { cancelled = true; };
  }, [quizId]);

  if (!target) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Opening quiz…
      </div>
    );
  }
  return <Navigate to={target} replace />;
}
