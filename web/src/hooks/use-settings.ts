import { useQuery } from "@tanstack/react-query";

import { tunnelboxApi } from "../api/tunnelbox-api";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await tunnelboxApi.getSettings()).settings,
  });
}
