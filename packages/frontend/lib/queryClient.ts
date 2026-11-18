import { QueryClient } from '@tanstack/react-query';

interface Retriable {
  status?: number;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A client error will not get better by asking again.
      retry: (failureCount, error) => {
        const status = (error as Retriable | null)?.status;
        if (typeof status === 'number' && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});
