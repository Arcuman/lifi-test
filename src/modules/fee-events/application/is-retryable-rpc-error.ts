import { RpcTimeoutError } from "./errors/rpc-timeout-error";

const RETRYABLE_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /block range too large/i,
  /maximum allowed is \d+ blocks/i,
  /ranges over \d+ blocks are not supported/i,
  /query returned more than/i,
  /response size exceeded/i,
  /rate limit/i,
  /too many requests/i
];

const FATAL_PATTERNS = [/history has been pruned/i, /missing trie node/i];

export const isRetryableRpcError = (error: unknown): boolean => {
  if (error instanceof RpcTimeoutError) {
    return true;
  }

  const texts = collectErrorTexts(error).map((value) => value.toLowerCase());
  if (texts.length === 0) {
    return false;
  }

  if (
    texts.some((value) =>
      RETRYABLE_PATTERNS.some((pattern) => pattern.test(value))
    )
  ) {
    return true;
  }

  if (
    texts.some((value) => FATAL_PATTERNS.some((pattern) => pattern.test(value)))
  ) {
    return false;
  }

  return false;
};

const collectErrorTexts = (value: unknown): string[] => {
  const texts = new Set<string>();
  const queue: unknown[] = [value];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === null || current === undefined || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (typeof current === "string") {
      texts.add(current);
      const parsed = parseJson(current);
      if (parsed) {
        queue.push(parsed);
      }
      continue;
    }

    if (current instanceof Error) {
      texts.add(current.message);
      queue.push(current.cause);
      queue.push(current.name);
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    if (typeof current === "object") {
      for (const nested of Object.values(current)) {
        queue.push(nested);
      }
    }
  }

  return [...texts];
};

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};
