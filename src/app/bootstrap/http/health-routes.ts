import { Router } from "express";

import { problem } from "./problem-details";
import type { ReadinessState } from "../../../shared/readiness/readiness-state";

interface CreateHealthRouterOptions {
  readiness: ReadinessState;
}

export const createHealthRouter = ({
  readiness
}: CreateHealthRouterOptions): Router => {
  const router = Router();

  router.get("/health/live", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  router.get("/health/ready", async (req, res) => {
    if (!(await readiness.isReady())) {
      return res
        .status(503)
        .json(
          problem(
            "service_unavailable",
            "Service unavailable",
            503,
            "Service is not ready",
            req.traceId
          )
        );
    }

    return res.status(200).json({ status: "ok" });
  });

  return router;
};
