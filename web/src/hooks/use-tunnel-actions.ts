import { useMutation, useQueryClient } from "@tanstack/react-query";

import { tunnelboxApi } from "../api/tunnelbox-api";

export function useStartTunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tunnelId: string) => tunnelboxApi.startTunnel(tunnelId),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["tunnels"] });
    },
  });
}

export function useStopTunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tunnelId: string) => tunnelboxApi.stopTunnel(tunnelId),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["tunnels"] });
    },
  });
}

export function useProvisionTunnel() {
  return useMutation({
    mutationFn: (tunnelId: string) => tunnelboxApi.provisionTunnel(tunnelId),
  });
}

export function usePrepareServer() {
  return useMutation({
    mutationFn: () => tunnelboxApi.prepareServer(),
  });
}
