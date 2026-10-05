'use client';

import React, { ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { WagmiProvider } from 'wagmi';
import { base } from 'wagmi/chains';

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";

const wagmiAdapter = new WagmiAdapter({
  networks: [base],
  projectId,
  ssr: true,
});

createAppKit({
  adapters: [wagmiAdapter],
  networks: [base],
  projectId,
  features: {
    email: true,
    socials: ['google'],
    analytics: false,
  },
});

const wagmiConfig = wagmiAdapter.wagmiConfig;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}