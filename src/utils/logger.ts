import pino from "pino";
import { loggerOptions } from "../adapters/telemetry/logger.js";
export const logger = pino(loggerOptions);
