"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { createCDPEmbeddedWalletConnector } from "@coinbase/cdp-wagmi";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { useEffect, useRef, useState } from "react";
import { getAddress, http, type Address } from "viem";
import { createConfig, WagmiProvider, useAccount } from "wagmi";
import { base } from "wagmi/chains";
import { fetchProfileWalletAddress, profileWalletQueryKey, saveProfileWalletAddress } from "@/lib/wallet-profile";
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
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_CDP_API_KEY}
          projectId={projectId}
          chain={base}
          url="https://rtrnetwork.com"
        >
          <WalletAddressSync />
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function useSyncUserWallet() {
  const { address, chainId } = useAccount();
  const queryClient = useQueryClient();
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function syncWallet(userId: string | undefined) {
      if (!userId) return;
      const queryKey = profileWalletQueryKey(userId);
      let savedAddress: Address | null | undefined = queryClient.getQueryData(queryKey);
      let acquiredSyncKey: string | undefined;
      try {
        if (savedAddress === undefined) {
          savedAddress = await fetchProfileWalletAddress();
          if (!active) return;
          queryClient.setQueryData(queryKey, savedAddress);
        }

        if (!address || chainId !== base.id) return;
        const activeAddress = getAddress(address);
        if (savedAddress?.toLowerCase() === activeAddress.toLowerCase()) return;

        const syncKey = `${userId}:${activeAddress.toLowerCase()}`;
        if (inFlight.current.has(syncKey)) return;
        inFlight.current.add(syncKey);
        acquiredSyncKey = syncKey;
        await saveProfileWalletAddress(activeAddress);
        if (active) queryClient.setQueryData(queryKey, activeAddress);
      } catch {
        // A later auth or wallet event retries the profile sync.
      } finally {
        if (acquiredSyncKey) inFlight.current.delete(acquiredSyncKey);
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
  }, [address, chainId, queryClient]);
}

function WalletAddressSync() {
  useSyncUserWallet();
  return null;
}