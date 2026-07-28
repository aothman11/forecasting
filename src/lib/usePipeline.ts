import { useMemo } from "react";
import { usePlanStore } from "./store";
import { runPipeline } from "./calculations";
import { validatePipeline } from "./validations";

export function usePipeline() {
  const params = usePlanStore((s) => s.params);
  const placement = usePlanStore((s) => s.placement);

  return useMemo(() => {
    const result = runPipeline(placement, params);
    const issues = validatePipeline(params, result);
    return { result, issues, params };
  }, [params, placement]);
}
