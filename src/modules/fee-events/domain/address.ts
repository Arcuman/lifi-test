import { ethers } from "ethers";

export class InvalidAddressError extends Error {
  constructor(value: string) {
    super(`Invalid address: ${value}`);
    this.name = "InvalidAddressError";
  }
}

export const normalizeAddress = (value: string): string => {
  try {
    return ethers.utils.getAddress(value).toLowerCase();
  } catch {
    throw new InvalidAddressError(value);
  }
};
