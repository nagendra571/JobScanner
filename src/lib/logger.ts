import pino from "pino";
import { getEnv } from "@/lib/env";

export const logger = pino({
  level: getEnv().LOG_LEVEL,
  redact: { paths: ["*.password", "*.passwordHash", "req.headers.authorization"], remove: true },
});
