'use client';

import React, { ReactNode, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react';
import { base } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { WagmiProvider, createStorage } from 'wagmi';
import { createClient } from '@supabase/supabase-js';

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

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

function SessionMonitor() {
  const { disconnect } = useDisconnect();
  const { isConnected } = useAppKitAccount();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (isConnected) {
          disconnect();
        }

        // Purge all AppKit and wallet-related storage
        const keysToPurge = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('appkit-') || key.startsWith('w3m-') || key.includes('wallet'))) {
            keysToPurge.push(key);
          }
        }
        keysToPurge.forEach(key => localStorage.removeItem(key));

        // Clear sessionStorage
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && (key.startsWith('appkit-') || key.startsWith('w3m-') || key.includes('wallet'))) {
            sessionStorage.removeItem(key);
          }
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isConnected, disconnect]);

  return null;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionMonitor />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
