import type { Action, IAgentRuntime, Memory } from "@elizaos/core";
import { logger, ModelType } from "@elizaos/core";
import type { EmailDetails } from "../types";

// Define a custom metadata interface that extends the base Memory metadata
interface PingpalEmailMetadata {
  originalEmailMessageId?: string;
  senderEmailAddress?: string;
  notifiedViaTelegram?: boolean;
  analysisResult?: {
    important: boolean;
    summary: string;
    reason_for_importance: string;
  };
}

export const analyzeEmailAction: Action = {
  name: "ANALYZE_EMAIL",
  description:
    "Analyzes an email for importance, summarizes it, and logs processing.",
  examples: [[]], // Empty or basic example
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    // This action is triggered programmatically by the plugin's init logic.
    // The 'message' argument here would be the EmailDetails object passed by the init logic.
    const emailDetails = message as any as EmailDetails; // Casting based on how it's invoked
    if (
      !emailDetails ||
      !emailDetails.messageId ||
      !emailDetails.subject ||
      !emailDetails.bodyText
    ) {
      logger.warn(
        "[ANALYZE_EMAIL] Validation failed: Incomplete email details received."
      );
      return false;
    }
    return true;
  },
  handler: async (
    runtime: IAgentRuntime,
    emailDetailsInput: any, // This will be the EmailDetails object
    state?: any,
    options?: any
  ) => {
    // Cast input to expected type
    const emailDetails = emailDetailsInput as EmailDetails;

    // Validate essential data is present
    if (!emailDetails || !emailDetails.messageId) {
      logger.error(
        "[ANALYZE_EMAIL] Invalid or incomplete email details received"
      );
      return false;
    }

    logger.info(
      `[ANALYZE_EMAIL] Action started for email ID: ${emailDetails.messageId}`
    );

    // Retrieve existing processed email memories to check for duplicates
    const processedMemories = await runtime.getMemories({
      tableName: "pingpal_email_processed",
      agentId: runtime.agentId,
    });

    // Check if this email has already been processed by looking for its messageId
    const isDuplicate = processedMemories.some(
      (memory) =>
        (memory.metadata as unknown as PingpalEmailMetadata)
          ?.originalEmailMessageId === emailDetails.messageId
    );

    // If duplicate, log and exit early
    if (isDuplicate) {
      logger.info(
        `[ANALYZE_EMAIL] Skipping duplicate email with ID: ${emailDetails.messageId}`
      );
      return true; // Action completed successfully (by skipping duplicate)
    }

    // Email is not a duplicate - continue with processing in subsequent tasks
    logger.info(
      `[ANALYZE_EMAIL] New email detected, proceeding with analysis: ${emailDetails.subject}`
    );

    // The rest of the handler will be implemented in subsequent tasks

    return true;
  },
};
