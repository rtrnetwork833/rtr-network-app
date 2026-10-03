'use client';

import React, { ReactNode, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { createCDPEmbeddedWalletConnector } from '@coinbase/cdp-wagmi';
import { createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';

const cdpProjectId = process.env.NEXT_PUBLIC_CDP_PROJECT_ID || "";
const reownProjectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";
const cdpApiKey = process.env.NEXT_PUBLIC_CDP_API_KEY || "";

const cdpConfig = {
  projectId: cdpProjectId,
  ethereum: { createOnLogin: "smart" as const },
};

const cdpConnector = createCDPEmbeddedWalletConnector({
  cdpConfig,
  providerConfig: { 
    chains: [base], 
    transports: { [base.id]: http() }, 
    announceProvider: true 
  },
});

const wagmiConfig = createConfig({
  chains: [base],
  connectors: [cdpConnector],
  transports: { [base.id]: http() },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={cdpApiKey}
          projectId={reownProjectId}
          chain={base}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}