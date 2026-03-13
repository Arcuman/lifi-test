import { normalizeAddress } from "../../modules/fee-events/domain/address";

export const toChainEnvSuffix = (chainKey: string): string =>
  chainKey
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_");

export const parseRpcUrls = (value: string | undefined, envKey: string): string[] => {
  if (!value?.trim()) {
    throw new Error(`${envKey} is required`);
  }

  const rpcUrls = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (rpcUrls.length === 0) {
    throw new Error(`${envKey} must contain at least one RPC URL`);
  }

  return rpcUrls;
};

export const parseAddress = (value: string | undefined, envKey: string): string => {
  if (!value?.trim()) {
    throw new Error(`${envKey} is required`);
  }

  try {
    return normalizeAddress(value);
  } catch (error) {
    throw new Error(`${envKey}: ${(error as Error).message}`, { cause: error });
  }
};

export const parseNonNegativeInt = (
  value: string | undefined,
  envKey: string
): number => {
  if (!value?.trim()) {
    throw new Error(`${envKey} is required`);
  }

  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${envKey} must be a non-negative integer`);
  }

  return Number.parseInt(value, 10);
};

export const parseChainId = (
  value: string | undefined,
  envSuffix: string,
  defaultValue?: number
): number => {
  if (!value?.trim()) {
    if (typeof defaultValue === "number") {
      return defaultValue;
    }
    throw new Error(`CHAIN_${envSuffix}_ID is required`);
  }

  if (!/^[1-9]\d*$/.test(value.trim())) {
    throw new Error(`CHAIN_${envSuffix}_ID must be a positive integer`);
  }

  return Number.parseInt(value, 10);
};
