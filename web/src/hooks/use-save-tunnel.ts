import { useMutation, useQueryClient } from "@tanstack/react-query";

import { type SaveTunnelRequest, tunnelboxApi } from "../api/tunnelbox-api";

export function useSaveTunnel(tunnelId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: SaveTunnelRequest) =>
      tunnelId
        ? tunnelboxApi.updateTunnel(tunnelId, request)
        : tunnelboxApi.createTunnel(request),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tunnels"] });
    },
  });
}
