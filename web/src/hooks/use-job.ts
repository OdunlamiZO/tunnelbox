import { useQuery } from "@tanstack/react-query";

import { type Job, tunnelboxApi } from "../api/tunnelbox-api";

export function useJob(jobId: string | null) {
  return useQuery<Job>({
    queryKey: ["job", jobId],
    queryFn: () => tunnelboxApi.getJob(jobId as string),
    enabled: jobId !== null,
    refetchInterval: (query) =>
      query.state.data?.state === "running" ? 1_000 : false,
  });
}
