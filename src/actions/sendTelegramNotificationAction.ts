import type { Action, IAgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import type { EmailDetails } from "../types"; // Assuming EmailDetails is in src/types.ts

// Helper function to escape characters for Telegram MarkdownV2
function escapeMarkdownV2(text: string): string {
  // Escape characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
  // Note: Characters must be escaped with a preceding '\\'.
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

interface AnalysisResult {
  summary: string;
  reason_for_importance: string;
  // Add other fields from analysisResult if necessary, though only summary is directly used here from options.
}

export const sendTelegramNotificationAction: Action = {
  name: "SEND_EMAIL_TELEGRAM_NOTIFICATION",
  description:
    "Formats and sends an important email notification via Telegram.",
  examples: [[]], // Basic example
  validate: async () => {
    // For this action, primary validation happens in the handler based on settings and options
    return true;
  },
  handler: async (
    runtime: IAgentRuntime,
    originalEmailDetailsInput: any, // This will be the EmailDetails object
    state?: any,
    options?: { analysisResult: AnalysisResult }
  ) => {
    logger.info(`[SEND_EMAIL_TELEGRAM_NOTIFICATION] Action started.`);

    const originalEmailDetails = originalEmailDetailsInput as EmailDetails;

    if (!originalEmailDetails || !originalEmailDetails.messageId) {
      logger.error(
        "[SEND_EMAIL_TELEGRAM_NOTIFICATION] Invalid or incomplete originalEmailDetails received."
      );
      return false;
    }

    const targetTelegramUserId =
      runtime.getSetting("pingpal.targetTelegramUserId") ||
      process.env.PINGPAL_TARGET_TELEGRAM_USERID;
    const userEmailAddress =
      runtime.getSetting("pingpal.userEmailAddress") ||
      process.env.EMAIL_INCOMING_USER;

    if (!targetTelegramUserId) {
      logger.error(
        "[SEND_EMAIL_TELEGRAM_NOTIFICATION] targetTelegramUserId setting is missing."
      );
      return false;
    }
    if (!userEmailAddress) {
      logger.error(
        "[SEND_EMAIL_TELEGRAM_NOTIFICATION] userEmailAddress setting is missing."
      );
      return false;
    }

    if (
      !options ||
      !options.analysisResult ||
      typeof options.analysisResult.summary !== "string" // Check specifically for summary
    ) {
      logger.error(
        "[SEND_EMAIL_TELEGRAM_NOTIFICATION] Invalid or missing analysisResult in options, or summary is not a string. Options received:",
        options
      );
      return false;
    }

    const { summary } = options.analysisResult;

    // Escape dynamic parts for MarkdownV2
    const sender = escapeMarkdownV2(originalEmailDetails.from);
    const escapedSummary = escapeMarkdownV2(summary);
    const displayEmailAddress = escapeMarkdownV2(userEmailAddress);

    const notificationText = `*🔔 PingPal Alert: Important Email*\n\n*From:* ${sender}\n*Summary:* ${escapedSummary}\n\nCheck your inbox @ ${displayEmailAddress}`;

    try {
      const telegramService = runtime.getService("telegram");

      if (
        telegramService &&
        (telegramService as any).bot?.telegram?.sendMessage
      ) {
        await (telegramService as any).bot.telegram.sendMessage(
          targetTelegramUserId || process.env.PINGPAL_TARGET_TELEGRAM_USERID,
          notificationText,
          { parse_mode: "MarkdownV2" }
        );
        logger.info(
          `[SEND_EMAIL_TELEGRAM_NOTIFICATION] Successfully sent notification to Telegram user ID: ${targetTelegramUserId} for email ID: ${originalEmailDetails.messageId}`
        );
        return true;
      } else {
        logger.error(
          "[SEND_EMAIL_TELEGRAM_NOTIFICATION] Telegram service is not available or sendMessage method is missing/structured unexpectedly. Service object keys: " +
            (telegramService ? Object.keys(telegramService).join(", ") : "null")
        );
        return false;
      }
    } catch (error) {
      logger.error(
        `[SEND_EMAIL_TELEGRAM_NOTIFICATION] Failed to send Telegram notification for email ID ${originalEmailDetails.messageId}:`,
        error
      );
      return false;
    }
  },
};
