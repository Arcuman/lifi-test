export interface KnownChainDefinition {
  chainId: number;
  name: string;
}

const knownChains = new Map<string, KnownChainDefinition>([
  ["polygon", { chainId: 137, name: "polygon" }],
  ["ethereum", { chainId: 1, name: "ethereum" }],
  ["arbitrum", { chainId: 42_161, name: "arbitrum" }],
  ["optimism", { chainId: 10, name: "optimism" }],
  ["base", { chainId: 8_453, name: "base" }],
  ["gnosis", { chainId: 100, name: "gnosis" }],
  ["bsc", { chainId: 56, name: "bsc" }],
  ["avalanche", { chainId: 43_114, name: "avalanche" }]
]);

export const getKnownChainDefinition = (
  chainKey: string
): KnownChainDefinition | undefined => knownChains.get(chainKey.toLowerCase());
