'use client';

import React, { ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { WagmiProvider } from 'wagmi';
import { base } from 'wagmi/chains';

// 1. Get Project ID from environment variables
const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";

if (!projectId) {
  console.warn("Missing NEXT_PUBLIC_REOWN_PROJECT_ID in environment variables.");
}

// 2. Setup the Wagmi Adapter with Base network
const wagmiAdapter = new WagmiAdapter({
  networks: [base],
  projectId,
  ssr: true
});

// 3. Initialize AppKit with correct embedded wallet properties
createAppKit({
  adapters: [wagmiAdapter],
  networks: [base],
  projectId,
  features: {
    email: true, 
    socials: ['google'],
    analytics: false,
    emailShowWallets: true
  },
  themeMode: 'dark'
});

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
