import type { ErrorRequestHandler } from "express";
import type { Logger } from "pino";
import { ZodError } from "zod";

import {
  InvalidCursorError,
  isFeeQueryValidationError
} from "../../../modules/fee-events/infrastructure/http/fees-query-schema";
import { problem } from "./problem-details";

interface CreateApiErrorHandlerOptions {
  logger: Logger;
}

export const createApiErrorHandler = ({
  logger
}: CreateApiErrorHandlerOptions): ErrorRequestHandler => {
  return (error, req, res, _next) => {
    if (error instanceof InvalidCursorError) {
      return res
        .status(400)
        .json(
          problem(
            "invalid_cursor",
            "Invalid cursor",
            400,
            error.message,
            req.traceId
          )
        );
    }

    if (error instanceof ZodError || isFeeQueryValidationError(error)) {
      return res
        .status(400)
        .json(
          problem(
            "validation_error",
            "Invalid request",
            400,
            (error as Error).message,
            req.traceId
          )
        );
    }

    logger.error({ error }, "Unhandled API error");
    return res
      .status(500)
      .json(
        problem(
          "internal_error",
          "Internal server error",
          500,
          "An unexpected error occurred",
          req.traceId
        )
      );
  };
};
