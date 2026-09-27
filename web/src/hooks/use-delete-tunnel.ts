import { useMutation, useQueryClient } from "@tanstack/react-query";

import { tunnelboxApi } from "../api/tunnelbox-api";

export function useDeleteTunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tunnelId: string) => tunnelboxApi.deleteTunnel(tunnelId),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tunnels"] });
    },
  });
}
