"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defaultWagmiConfig } from "@web3modal/wagmi/react";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { base } from "wagmi/chains";

const walletConnectProjectId = "fb889fa04051f8f407b34a90b837fd81";
const metadata = {
  name: "RTR Network",
  description: "Base Mainnet node dashboard",
  url: "https://rtr.network",
  icons: ["https://rtr.network/logo.png"],
};

const wagmiConfig = defaultWagmiConfig({
  chains: [base],
  projectId: walletConnectProjectId,
  metadata,
  enableCoinbase: false,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}