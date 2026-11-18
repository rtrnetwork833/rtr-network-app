'use client';

import React, { ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppKit } from '@reown/appkit/react';
import { base } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { WagmiProvider, createStorage } from 'wagmi';

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";

const metadata = {
  name: 'RTR Network',
  description: 'Cryptocurrency Mining Platform',
  url: 'https://rtrnetwork.com',
  icons: ['https://rtrnetwork.com']
};

const networks: [typeof base, ...typeof base[]] = [base];
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined
  })
});

const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  metadata,
  projectId,
  defaultNetwork: base,
  defaultAccountTypes: {
    eip155: 'smartAccount',
  },
  features: {
    onramp: true,
    swaps: true,
    email: true,
    socials: ['google', 'apple', 'github', 'facebook', 'x', 'discord', 'farcaster'],
  },
  themeMode: 'dark'
});
appKit.setConnectMethodsOrder(['email', 'social', 'wallet']);

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
