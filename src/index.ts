import type { Plugin } from "@elizaos/core";
import {
  type Action,
  type Content,
  type GenerateTextParams,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type Provider,
  type ProviderResult,
  Service,
  ServiceType,
  type State,
  logger,
} from "@elizaos/core";
import { z } from "zod";
import type { EmailObject } from "./types";

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

export const starterPlugin: Plugin = {
  name: "plugin-pingpal-email",
  description: "Plugin starter for elizaOS",

  async init(config: Record<string, string>, runtime: IAgentRuntime) {
    logger.info("*** Initializing plugin-pingpal-email ***");
    await runtime.init();
    const emailService = runtime.getService(ServiceType.EMAIL);
    console.log("emailServiceAli", emailService);
    if (!emailService) {
      throw new Error("Email service not found");
    }
  },

  services: [],
  actions: [],
  providers: [],
};

export default starterPlugin;
