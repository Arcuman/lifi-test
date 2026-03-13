import type { Router } from "express";

import { createFeeEventsRouter } from "../infrastructure/http/create-fee-events-router";
import { MongoFeeEventRepository } from "../infrastructure/persistence/repositories/fee-event-repository";

export const createFeeEventsHttpRouters = (): Router[] => [
  createFeeEventsRouter({
    feeQueryService: new MongoFeeEventRepository()
  })
];
