import { useQuery } from "@tanstack/react-query";

import { getMe, sessionQueryKey } from "./api";

export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: ({ signal }) => getMe(signal),
    retry: false,
  });
}
