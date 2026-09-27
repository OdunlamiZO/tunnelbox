import { useQuery } from "@tanstack/react-query";

import { type TunnelView, tunnelboxApi } from "../api/tunnelbox-api";

export function useTunnels() {
  return useQuery<TunnelView[]>({
    queryKey: ["tunnels"],
    queryFn: () => tunnelboxApi.listTunnels(),
    refetchInterval: 2_000,
  });
}
