import { Router } from "express";

import { parseFeesQuery } from "./fees-query-schema";
import { presentFeeEvent } from "./present-fee-event";
import type { FeeEventsQueryService } from "../../application/ports/fee-events-query-service";

interface CreateFeeEventsRouterOptions {
  feeQueryService: FeeEventsQueryService;
}

export const createFeeEventsRouter = ({
  feeQueryService
}: CreateFeeEventsRouterOptions): Router => {
  const router = Router();

  router.get("/v1/fees", async (req, res, next) => {
    try {
      const query = parseFeesQuery(req.query);
      const result = await feeQueryService.getFeesByIntegrator(query);
      res.status(200).json({
        data: result.items.map(presentFeeEvent),
        page: {
          nextCursor: result.nextCursor
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
