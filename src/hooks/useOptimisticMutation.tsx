import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface OptimisticMutationOptions<T, R> {
  mutationFn: (data: T) => Promise<R>;
  onSuccess?: (result: R, data: T) => void;
  onError?: (error: Error, data: T) => void;
  onOptimisticUpdate?: (data: T) => void;
  onRollback?: (data: T) => void;
  successMessage?: string;
  errorMessage?: string;
}

export function useOptimisticMutation<T, R = void>(
  options: OptimisticMutationOptions<T, R>
) {
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  const mutate = useCallback(
    async (data: T) => {
      setIsPending(true);

      // Optimistic update - update UI immediately
      options.onOptimisticUpdate?.(data);

      try {
        const result = await options.mutationFn(data);
        
        options.onSuccess?.(result, data);
        
        if (options.successMessage) {
          toast({
            title: "Success",
            description: options.successMessage,
          });
        }
        
        return result;
      } catch (error) {
        // Rollback on error
        options.onRollback?.(data);
        
        options.onError?.(error as Error, data);
        
        toast({
          title: "Error",
          description: options.errorMessage || "Something went wrong. Please try again.",
          variant: "destructive",
        });
        
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [options, toast]
  );

  return {
    mutate,
    isPending,
  };
}
