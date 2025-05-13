import type { Action, IAgentRuntime, Memory } from "@elizaos/core";
import { logger, ModelType } from "@elizaos/core";
import type { EmailDetails } from "../types";

// Define a custom metadata interface that extends the base Memory metadata
interface PingpalEmailMetadata {
  type: "pingpal_email_processed";
  originalEmailMessageId: string;
  senderEmailAddress: string;
  notifiedViaTelegram: boolean;
  analysisResult: {
    important: boolean;
    summary: string;
    reason_for_importance: string;
    error?: string; // Added for error case
  };
  [key: string]: unknown; // Added to satisfy CustomMetadata requirements
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

    // --- LLM Interaction ---
    let analysisResult: PingpalEmailMetadata["analysisResult"]; // To store the LLM analysis
    let llmErrorOccurred = false; // Flag to track LLM processing status

    const llmPrompt = `You are an assistant helping a user filter their email inbox. Analyze the following email.
Email Subject: "${emailDetails.subject}"
Email Body:
"${emailDetails.bodyText}"

1. Determine if this email requires the urgent attention or action of the user. Consider direct requests, deadlines, important announcements, or messages from key contacts.
2. If it is important, provide a concise summary of the email in no more than 3 sentences.
3. Also, provide a brief reason why this email was flagged as important.

Respond ONLY with a JSON object matching this schema:
{
  "important": boolean, // true if the email is important, false otherwise
  "summary": "string", // The 3-sentence (or less) summary if important, otherwise an empty string or null.
  "reason_for_importance": "string" // Brief reason why it's important, or empty/null if not.
}`;

    const outputSchema = {
      type: "object",
      properties: {
        important: { type: "boolean" },
        summary: { type: "string" },
        reason_for_importance: { type: "string" },
      },
      required: ["important", "summary", "reason_for_importance"],
    };

    try {
      // Update to use ModelType.OBJECT_SMALL and the defined schema
      const parsedResponse = (await runtime.useModel(ModelType.OBJECT_SMALL, {
        prompt: llmPrompt,
        schema: outputSchema,
        // strictObject: true, // strictObject is not a param for OBJECT_SMALL
      })) as PingpalEmailMetadata["analysisResult"]; // Cast to the expected type

      if (!parsedResponse) {
        logger.warn(
          `[ANALYZE_EMAIL] LLM returned empty response for email ID: ${emailDetails.messageId}`
        );
        llmErrorOccurred = true;
        // analysisResult remains undefined, will use a fallback for logging
      } else {
        // Validate the structure and types of the parsed LLM response
        // This basic validation can be enhanced if needed, but OBJECT_SMALL with schema helps.
        if (
          typeof parsedResponse.important !== "boolean" ||
          typeof parsedResponse.summary !== "string" ||
          typeof parsedResponse.reason_for_importance !== "string"
        ) {
          logger.error(
            `[ANALYZE_EMAIL] LLM response validation failed for email ID ${emailDetails.messageId}: Invalid structure or types after schema validation. Received:`,
            parsedResponse
          );
          llmErrorOccurred = true;
          // analysisResult remains undefined, will use a fallback for logging
        } else {
          analysisResult = {
            important: parsedResponse.important,
            summary: parsedResponse.summary,
            reason_for_importance: parsedResponse.reason_for_importance,
          };
        }
      }
    } catch (error) {
      logger.error(
        `[ANALYZE_EMAIL] LLM interaction or JSON parsing failed for email ID ${emailDetails.messageId}:`,
        error
      );
      llmErrorOccurred = true;
      // analysisResult remains undefined, will use a fallback for logging
    }
    // --- End of LLM Interaction ---

    // Processed Email Logging
    const analysisDataForLogging: PingpalEmailMetadata["analysisResult"] =
      analysisResult && !llmErrorOccurred
        ? analysisResult // analysisResult is the parsed LLM output if successful
        : {
            important: false,
            summary: "",
            reason_for_importance: "LLM processing failed",
            error: "LLM_PROCESSING_FAILED",
          };

    const memoryToCreate = {
      agentId: runtime.agentId,
      roomId: "PINGPAL_EMAIL_MONITOR_INTERNAL" as any,
      entityId: runtime.agentId,
      content: { text: `Processed email subject: ${emailDetails.subject}` },
      metadata: {
        type: "pingpal_email_processed",
        originalEmailMessageId: emailDetails.messageId,
        senderEmailAddress: emailDetails.from, // Assuming emailDetails.from is available
        notifiedViaTelegram: analysisResult?.important || false, // Uses the original parsed LLM output status
        analysisResult: analysisDataForLogging,
      } as PingpalEmailMetadata,
    };

    try {
      await runtime.createMemory(memoryToCreate, "pingpal_email_processed");
      logger.info(
        `[ANALYZE_EMAIL] Successfully logged processed email ID: ${emailDetails.messageId}`
      );
    } catch (error) {
      logger.error(
        `[ANALYZE_EMAIL] Failed to log processed email ID ${emailDetails.messageId}:`,
        error
      );
      // Depending on policy, an error here might also warrant returning false from the action.
      // For now, we'll continue, but this could be a point of failure.
    }
    // End of Processed Email Logging

    // --- Triggering SEND_EMAIL_TELEGRAM_NOTIFICATION ---
    if (!llmErrorOccurred && analysisResult && analysisResult.important) {
      logger.info(
        `[ANALYZE_EMAIL] Email ID: ${emailDetails.messageId} marked as important. Attempting to trigger notification.`
      );
      const sendNotificationAction = runtime.actions.find(
        (a) => a.name === "SEND_EMAIL_TELEGRAM_NOTIFICATION"
      );

      if (sendNotificationAction && sendNotificationAction.handler) {
        try {
          // Passing undefined for state.
          // emailDetails is the original EmailDetails object for the current email.
          // analysisResult is the direct output from the LLM.
          await sendNotificationAction.handler(
            runtime,
            emailDetails as any, // Cast to any to satisfy linter for this specific action call
            undefined,
            { analysisResult }
          );
          logger.info(
            `[ANALYZE_EMAIL] Call to SEND_EMAIL_TELEGRAM_NOTIFICATION handler completed for email ID: ${emailDetails.messageId}.`
          );
        } catch (error) {
          logger.error(
            `[ANALYZE_EMAIL] Error calling SEND_EMAIL_TELEGRAM_NOTIFICATION handler for email ID ${emailDetails.messageId}:`,
            error
          );
          // The ANALYZE_EMAIL action itself does not fail if the triggered action errors out.
          // That error should be logged by the sendNotificationAction itself.
        }
      } else {
        logger.error(
          `[ANALYZE_EMAIL] Action SEND_EMAIL_TELEGRAM_NOTIFICATION not found or handler is missing for email ID: ${emailDetails.messageId}.`
        );
      }
    } else if (
      !llmErrorOccurred &&
      analysisResult &&
      !analysisResult.important
    ) {
      logger.info(
        `[ANALYZE_EMAIL] Email ID: ${emailDetails.messageId} not marked as important. No notification will be sent.`
      );
    } else if (llmErrorOccurred) {
      // This condition implies analysisResult might be undefined or not reliably populated.
      logger.warn(
        `[ANALYZE_EMAIL] Skipping notification trigger for email ID: ${emailDetails.messageId} due to previous LLM error or undefined analysis result.`
      );
    }
    // --- End of Triggering SEND_EMAIL_TELEGRAM_NOTIFICATION ---

    // Final return logic for ANALYZE_EMAIL action:
    // The action's success is primarily based on whether the email analysis and logging were performed.
    // An error during LLM processing (llmErrorOccurred = true) is considered a failure of this action's core responsibility.
    if (llmErrorOccurred) {
      // Logging of this error state has been handled (e.g., by setting analysisResult.error).
      // The logic above ensures no notification is attempted if llmErrorOccurred.
      return false;
    }

    // If no LLM errors, the action (which includes analysis, logging, and attempting to trigger
    // a notification if applicable) is considered to have completed its responsibilities successfully.
    // Explicitly states "Return true (action completed)" after its steps.
    return true;
  },
};
