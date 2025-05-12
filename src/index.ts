// /Users/alireza/Codes/AI Projects/plugin-pingpal-email/src/index.ts
import type { Plugin } from "@elizaos/core";
import { type IAgentRuntime, logger } from "@elizaos/core";
import MailNotifier, {
  type EmailContent,
  type Config as MailNotifierConfig,
} from "mail-notifier";
import { analyzeEmailAction } from "./actions/analyzeEmailAction";

export const starterPlugin: Plugin = {
  name: "@elizaos/plugin-pingpal-email", // Ensure this matches your package.json and link name
  description: "Plugin for PingPal Email - Direct IMAP Test",

  async init(config: Record<string, string>, runtime: IAgentRuntime) {
    logger.info(`[${this.name}] ----- PLUGIN INIT START -----`);
    logger.debug(`[${this.name}] Runtime Agent ID: ${runtime.agentId}`);
    logger.debug(
      `[${this.name}] Runtime Character Name: ${runtime.character.name}`
    );

    // Check if settings from character file are accessible
    const charIncomingService = runtime.getSetting("EMAIL_INCOMING_SERVICE");
    const charImapHost = runtime.getSetting("EMAIL_INCOMING_HOST");
    logger.debug(
      `[${this.name}] From runtime.getSetting("EMAIL_INCOMING_SERVICE"): ${charIncomingService}`
    );
    logger.debug(
      `[${this.name}] From runtime.getSetting("EMAIL_INCOMING_HOST"): ${charImapHost}`
    );

    // List all available services to see if 'email' is among them
    if (runtime.services && typeof runtime.services.keys === "function") {
      const availableServices = Array.from(runtime.services.keys());
      logger.debug(
        `[${this.name}] Available services in runtime: ${availableServices.join(", ")}`
      );
    } else {
      logger.warn(
        `[${this.name}] runtime.services or runtime.services.keys is not available/iterable.`
      );
    }

    const emailService = runtime.getService<any>("email");

    if (!emailService) {
      logger.error(
        `[${this.name}] CRITICAL: Email service with key 'email' NOT FOUND. ` +
          `Troubleshooting steps:
        1. Ensure '@elizaos/plugin-email' is listed in the character file's 'plugins' array.
        2. Ensure '@elizaos/plugin-email' is correctly installed or linked in the 'eliza-test' project.
        3. Check logs from '@elizaos/plugin-email' for any initialization errors (it might need specific .env vars or character settings like EMAIL_INCOMING_SERVICE).
        4. Verify the service key used by '@elizaos/plugin-email' is indeed 'email'.`
      );
      logger.info(
        `[${this.name}] ----- PLUGIN INIT END (SERVICE NOT FOUND) -----`
      );
      return;
    }

    logger.info(
      `[${this.name}] Email service 'email' instance acquired. Type: ${emailService.constructor ? emailService.constructor.name : typeof emailService}`
    );

    if (typeof emailService.receive === "function") {
      logger.info(
        `[${this.name}] Email service has a 'receive' method. Attempting to register callback.`
      );
      try {
        emailService.receive((mail: EmailContent) => {
          logger.info(
            `[${this.name}] >>>>>>>>>>>>>>>>>> EMAIL VIA @elizaos/plugin-email: NEW EMAIL RECEIVED <<<<<<<<<<<<<<<<<<<<`
          );
          logger.info(`[${this.name}] Subject: ${mail.subject}`);
        });
        logger.info(
          `[${this.name}] Successfully registered 'receive' callback with the @elizaos/plugin-email service.`
        );
      } catch (error) {
        logger.error(
          `[${this.name}] Error when calling emailService.receive() or during callback registration:`,
          error
        );
      }
    } else {
      logger.error(
        `[${this.name}] Email service 'email' was found, BUT it does NOT have a 'receive' method.`
      );
    }
    logger.info(`[${this.name}] ----- PLUGIN INIT END -----`);
  },
  services: [],
  actions: [analyzeEmailAction],
  providers: [],
};
export default starterPlugin;
