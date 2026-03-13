import { z } from "zod";

import {
  decodeCursor,
  InvalidCursorError
} from "../../application/cursor-codec";
import type { FindFeesByIntegratorQuery } from "../../application/ports/fee-events-query-service";
import { normalizeAddress } from "../../domain/address";

const querySchema = z.object({
  integrator: z.string().min(1),
  chainId: z.coerce.number().int().positive().optional(),
  fromBlock: z.coerce.number().int().nonnegative().optional(),
  toBlock: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
  cursor: z.string().optional()
}).superRefine((value, context) => {
  if (
    value.fromBlock !== undefined &&
    value.toBlock !== undefined &&
    value.fromBlock > value.toBlock
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fromBlock"],
      message: "fromBlock must be less than or equal to toBlock"
    });
  }
});

export { InvalidCursorError };

export const parseFeesQuery = (
  input: unknown
): FindFeesByIntegratorQuery => {
  const parsed = querySchema.parse(input);
  if (parsed.cursor) {
    decodeCursor(parsed.cursor);
  }

  let integrator: string;
  try {
    integrator = normalizeAddress(parsed.integrator);
  } catch (error) {
    throw new Error(`integrator: ${(error as Error).message}`, {
      cause: error
    });
  }

  const query: FindFeesByIntegratorQuery = {
    integrator,
    limit: parsed.limit
  };

  if (parsed.chainId !== undefined) {
    query.chainId = parsed.chainId;
  }
  if (parsed.fromBlock !== undefined) {
    query.fromBlock = parsed.fromBlock;
  }
  if (parsed.toBlock !== undefined) {
    query.toBlock = parsed.toBlock;
  }
  if (parsed.cursor !== undefined) {
    query.cursor = parsed.cursor;
  }

  return query;
};

export const isFeeQueryValidationError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.startsWith("integrator:") ||
    error.message.includes("limit") ||
    error.message.includes("validation"));
