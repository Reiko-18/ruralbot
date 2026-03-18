import type { LogConfigCache } from "../../types/logger.type.js";
import { getAllEnabledConfigs } from "./repo_log_config.js";

let cache: LogConfigCache[] = [];

export async function loadLogConfigs(): Promise<void> {
  cache = await getAllEnabledConfigs();
}

export function getLogConfigs(): LogConfigCache[] {
  return cache;
}

export async function refreshLogConfigs(): Promise<void> {
  cache = await getAllEnabledConfigs();
}
