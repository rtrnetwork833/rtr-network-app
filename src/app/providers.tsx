'use client';

import React, { ReactNode, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { WagmiProvider } from 'wagmi';
import { base } from 'wagmi/chains';
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

const networks = [{ ...base }] as any;
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  metadata,
  projectId,
  defaultNetwork: base,
  features: {
    email: true,
    socials: ['google'],
    analytics: false,
    emailShowWallets: true,
    swaps: true
  },
  themeMode: 'dark'
});

function SessionMonitor() {
  const { disconnect } = useDisconnect();
  const { isConnected } = useAppKitAccount();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // On sign out or token refresh (session switch), disconnect wallet
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
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
