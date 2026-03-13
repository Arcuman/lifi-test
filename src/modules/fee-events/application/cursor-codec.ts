import { Buffer } from "node:buffer";

export interface FeeEventsCursor {
  blockNumber: number;
  logIndex: number;
  chainId: number;
  id: string;
}

export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid cursor");
    this.name = "InvalidCursorError";
  }
}

export const encodeCursor = (cursor: FeeEventsCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

export const decodeCursor = (value: string): FeeEventsCursor => {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Partial<FeeEventsCursor>;
    if (
      typeof parsed.blockNumber !== "number" ||
      typeof parsed.logIndex !== "number" ||
      typeof parsed.chainId !== "number" ||
      typeof parsed.id !== "string" ||
      !isMongoObjectId(parsed.id)
    ) {
      throw new InvalidCursorError();
    }
    return parsed as FeeEventsCursor;
  } catch {
    throw new InvalidCursorError();
  }
};

const isMongoObjectId = (value: string): boolean =>
  /^[0-9a-fA-F]{24}$/.test(value);
