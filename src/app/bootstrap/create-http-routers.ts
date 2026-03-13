import type { Router } from "express";

import { createFeeEventsHttpRouters } from "../../modules/fee-events/bootstrap/create-fee-events-http-routers";

export const createHttpRouters = (): Router[] => [
  ...createFeeEventsHttpRouters()
];
