import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../logger/logger.js";

const execFileAsync = promisify(execFile);

const SHUTDOWN_MARKERS = [
  /daily-maintenance-poweroff\.service/,
  /Reached target poweroff\.target/,
  /Finished systemd-poweroff\.service/,
  /systemd-shutdown\[/,
  /System is powering down\./,
  /powering down due to signal terminated/i,
];

const REBOOT_MARKERS = [
  /Reached target reboot\.target/,
  /Finished systemd-reboot\.service/,
];

function hasAnyMarker(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export async function auditPreviousBoot(): Promise<void> {
  try {
    const { stdout } = await execFileAsync(
      "journalctl",
      ["-b", "-1", "--no-pager", "-n", "2000"],
      { maxBuffer: 2 * 1024 * 1024 },
    );

    const journal = String(stdout);
    const plannedMaintenance = journal.includes("daily-maintenance-poweroff.service");
    const orderlyShutdown = hasAnyMarker(journal, SHUTDOWN_MARKERS);
    const orderlyReboot = hasAnyMarker(journal, REBOOT_MARKERS);

    if (plannedMaintenance || orderlyShutdown || orderlyReboot) {
      logger.info(
        {
          plannedMaintenance,
          orderlyShutdown,
          orderlyReboot,
        },
        "Previous boot ended orderly",
      );
      return;
    }

    const tailLine = journal
      .split("\n")
      .reverse()
      .find((line) => line.trim().length > 0) ?? "";

    logger.warn(
      {
        tailLine,
      },
      "Detected unexpected previous host shutdown",
    );
  } catch (err) {
    logger.warn({ err }, "Failed to audit previous boot");
  }
}
