import { useMutation, useQueryClient } from "@tanstack/react-query";

import { type ServerSettings, tunnelboxApi } from "../api/tunnelbox-api";

export function useSaveSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: ServerSettings) =>
      tunnelboxApi.saveSettings(settings),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
