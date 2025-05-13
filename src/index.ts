import type { Plugin, IAgentRuntime } from "@elizaos/core";
import {
  type Action,
  type Content,
  type GenerateTextParams,
  type HandlerCallback,
  type Memory,
  ModelType,
  type Provider,
  type ProviderResult,
  Service,
  type State,
  logger,
} from "@elizaos/core";
import { z } from "zod";
import { ImapFlow } from "imapflow";
import type { EmailDetails } from "./types";

/**
 * Defines the configuration schema for a plugin, including the validation rules for the plugin name.
 *
 * @type {import('zod').ZodObject<{ EXAMPLE_PLUGIN_VARIABLE: import('zod').ZodString }>}
 */
const configSchema = z.object({
  EXAMPLE_PLUGIN_VARIABLE: z
    .string()
    .min(1, "Example plugin variable is not provided")
    .optional()
    .transform((val) => {
      if (!val) {
        logger.warn(
          "Example plugin variable is not provided (this is expected)"
        );
      }
      return val;
    }),
});

/**
 * Example HelloWorld action
 * This demonstrates the simplest possible action structure
 */
/**
 * Action representing a hello world message.
 * @typedef {Object} Action
 * @property {string} name - The name of the action.
 * @property {string[]} similes - An array of related actions.
 * @property {string} description - A brief description of the action.
 * @property {Function} validate - Asynchronous function to validate the action.
 * @property {Function} handler - Asynchronous function to handle the action and generate a response.
 * @property {Object[]} examples - An array of example inputs and expected outputs for the action.
 */

const pingPalEmailPlugin: Plugin = {
  name: "plugin-pingpal-email",
  description:
    "Monitors an email account using imapflow for important emails and notifies via Telegram.",
  actions: [], // Will be filled in later
  providers: [],
  evaluators: [],
  async init(config: Record<string, string>, runtime: IAgentRuntime) {
    logger.info("Initializing PingPal Email Plugin (with imapflow)...");
    // Retrieve IMAP settings
    const host =
      runtime.getSetting("EMAIL_INCOMING_HOST") ||
      process.env.EMAIL_INCOMING_HOST;
    const port = parseInt(
      runtime.getSetting("EMAIL_INCOMING_PORT") ||
        process.env.EMAIL_INCOMING_PORT ||
        "993",
      10
    );
    const user =
      runtime.getSetting("EMAIL_INCOMING_USER") ||
      process.env.EMAIL_INCOMING_USER;
    const pass =
      runtime.getSetting("EMAIL_INCOMING_PASS") ||
      process.env.EMAIL_INCOMING_PASS;
    const secure = runtime.getSetting("EMAIL_INCOMING_SECURE") !== "false"; // Defaults to true
    if (!host || !user || !pass) {
      logger.error(
        "Missing required IMAP settings. Please check EMAIL_INCOMING_HOST, EMAIL_INCOMING_USER, EMAIL_INCOMING_PASS."
      );
      return;
    }
    const imapClient = new ImapFlow({
      host,
      port,
      secure,
      auth: { user, pass },
      logger: false,
    });
    try {
      await imapClient.connect();
      logger.info("[PingPal Email] Connected to IMAP server.");
      await imapClient.logout();
      logger.info(
        "[PingPal Email] Logged out from IMAP server (test complete)."
      );
    } catch (err) {
      logger.error("[PingPal Email] IMAP Connection failed:", err);
    }
  },
};

export default pingPalEmailPlugin;
