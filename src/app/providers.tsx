"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CDPHooksProvider } from "@coinbase/cdp-hooks";
import { createCDPEmbeddedWalletConnector } from "@coinbase/cdp-wagmi";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { useEffect, useRef, useState } from "react";
import { http } from "viem";
import { createConfig, WagmiProvider, useAccount } from "wagmi";
import { base } from "wagmi/chains";
import { createClient } from "@/lib/supabase/client";

const projectId = process.env.NEXT_PUBLIC_CDP_PROJECT_ID ?? "";
const cdpConfig = {
  projectId,
  ethereum: { createOnLogin: "smart" as const },
};
const cdpConnector = createCDPEmbeddedWalletConnector({
  cdpConfig,
  providerConfig: { chains: [base], transports: { [base.id]: http() }, announceProvider: true },
});
const wagmiConfig = createConfig({
  chains: [base],
  connectors: [cdpConnector],
  transports: { [base.id]: http() },
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <CDPHooksProvider config={cdpConfig}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <OnchainKitProvider
            apiKey={process.env.NEXT_PUBLIC_CDP_API_KEY}
            projectId={projectId}
            chain={base}
          >
            <WalletAddressSync />
            {children}
          </OnchainKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </CDPHooksProvider>
  );
}

export function useSyncUserWallet() {
  const { address, chainId } = useAccount();
  const walletAddress = address;
  const lastSynced = useRef("");
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!walletAddress || chainId !== base.id) return;
    const activeAddress = walletAddress;

    const supabase = createClient();
    let active = true;

    async function syncWallet(userId: string | undefined) {
      if (!userId) return;
      const syncKey = `${userId}:${activeAddress.toLowerCase()}`;
      if (lastSynced.current === syncKey || inFlight.current.has(syncKey)) return;
      inFlight.current.add(syncKey);

      try {
        const response = await fetch("/api/profile/wallet", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ walletAddress: activeAddress }),
        });
        if (active && response.ok) lastSynced.current = syncKey;
      } catch {
        // A later account or chain event retries the profile sync.
      } finally {
        inFlight.current.delete(syncKey);
      }
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (active) void syncWallet(data.user?.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncWallet(session?.user.id);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [walletAddress, chainId]);
}

function WalletAddressSync() {
  useSyncUserWallet();
  return null;
}