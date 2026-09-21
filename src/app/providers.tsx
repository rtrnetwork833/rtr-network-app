"use client";

import { OnchainKitProvider } from "@coinbase/onchainkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defaultWagmiConfig } from "@web3modal/wagmi/react";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { base } from "wagmi/chains";

const walletConnectProjectId = "fb889fa04051f8f407b34a90b837fd81";
const coinbaseProjectId = "e749aa38-24c0-4b46-849b-f1adfdd813b4";

const metadata = {
  name: "RTR Network",
  description: "Base Mainnet node dashboard",
  url: "https://rtr.network",
  icons: ["https://rtr.network/icon.png"],
};

const wagmiConfig = defaultWagmiConfig({
  chains: [base],
  projectId: walletConnectProjectId,
  metadata,
  enableCoinbase: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider projectId={coinbaseProjectId} chain={base}>
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}