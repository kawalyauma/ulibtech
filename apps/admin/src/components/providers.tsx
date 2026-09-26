'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import type { AdminSessionInfo, Permission } from '@edushare/shared';
import { api, setCsrfToken } from '@/lib/api';

const SessionContext = createContext<{
  admin: AdminSessionInfo | null;
  loading: boolean;
  can: (p: Permission) => boolean;
}>({
  admin: null,
  loading: true,
  can: () => false,
});

export function useSession() {
  return useContext(SessionContext);
}

function SessionProvider({ children }: { children: React.ReactNode }) {
  const q = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ admin: AdminSessionInfo }>('/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const admin = q.data?.admin ?? null;
  useEffect(() => setCsrfToken(admin?.csrfToken ?? null), [admin]);
  if (admin) setCsrfToken(admin.csrfToken);
  return (
    <SessionContext.Provider
      value={{ admin, loading: q.isLoading, can: (p) => Boolean(admin?.permissions.includes(p)) }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function Providers({
  children,
  withSession = true,
}: {
  children: React.ReactNode;
  withSession?: boolean;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {withSession ? <SessionProvider>{children}</SessionProvider> : children}
      <Toaster richColors position="top-right" closeButton />
    </QueryClientProvider>
  );
}
