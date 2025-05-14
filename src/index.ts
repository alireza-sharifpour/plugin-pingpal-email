import type { Plugin, IAgentRuntime, UUID } from "@elizaos/core";
import {
  type Action,
  ChannelType,
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
  stringToUuid,
} from "@elizaos/core";
import { z } from "zod";
import { ImapFlow } from "imapflow";
import type { EmailDetails } from "./types";
import { analyzeEmailAction } from "./actions/analyzeEmailAction";
import { sendTelegramNotificationAction } from "./actions/sendTelegramNotificationAction";
import { convert as htmlToTextConverter } from "html-to-text";

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

const getInternalRoomIdForAgent = (agentId: UUID): UUID => {
  const agentSpecificRoomSuffix = agentId.slice(0, 13); // Or use the full agentId for more uniqueness
  return stringToUuid(`pingpal-email-internal-room-${agentSpecificRoomSuffix}`);
};

const pingPalEmailPlugin: Plugin = {
  name: "plugin-pingpal-email",
  description:
    "Monitors an email account using imapflow for important emails and notifies via Telegram.",
  actions: [analyzeEmailAction, sendTelegramNotificationAction],
  providers: [],
  evaluators: [],
  async init(config: Record<string, string>, runtime: IAgentRuntime) {
    logger.info("Initializing PingPal Email Plugin (with imapflow)...");

    const internalRoomId = getInternalRoomIdForAgent(runtime.agentId);
    try {
      await runtime.ensureRoomExists({
        id: internalRoomId,
        name: `PingPal Internal Logs - Agent ${runtime.agentId.slice(0, 8)}`,
        source: "internal_pingpal_plugin", // Identifies this plugin as the source
        type: ChannelType.SELF, // SELF type is suitable for agent-specific internal logs
        // worldId: Optional - if this agent operates within a specific world context.
        // For your standalone agent as per PRD, omitting worldId for this internal room is fine.
      });
      logger.info(
        `[PingPal Email Plugin] Ensured internal logging room exists: ${internalRoomId}`
      );
    } catch (error) {
      logger.error(
        "[PingPal Email Plugin] CRITICAL: Failed to create/ensure internal logging room. Memory logging will fail.",
        error
      );
      // Depending on how critical this is, you might throw the error to stop plugin load
      // throw new Error(`Failed to initialize PingPal internal room: ${error.message}`);
    }

    const targetTelegramUserId =
      runtime.getSetting("pingpal_email.targetTelegramUserId") ||
      process.env.PINGPAL_TARGET_TELEGRAM_USERID;

    console.log("TARGET TELEGRAM USER ID", targetTelegramUserId);

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
    const secure =
      (runtime.getSetting("EMAIL_INCOMING_SECURE") ||
        process.env.EMAIL_INCOMING_SECURE) !== "false"; // Defaults to true
    const mailbox =
      runtime.getSetting("EMAIL_INCOMING_MAILBOX") ||
      process.env.EMAIL_INCOMING_MAILBOX ||
      "INBOX";

    if (!host || !user || !pass) {
      logger.error(
        "[PingPal Email] Missing required IMAP settings. Please check EMAIL_INCOMING_HOST, EMAIL_INCOMING_USER, EMAIL_INCOMING_PASS."
      );
      return;
    }

    const imapClient = new ImapFlow({
      host,
      port,
      secure,
      auth: { user, pass },
      logger: false, // Set to true or custom logger for detailed IMAP logs
    });

    imapClient.on("error", (err: Error) => {
      logger.error("[PingPal Email] IMAP Flow Error:", err);
      // Consider implementing reconnection logic here or in monitorEmails
    });

    const streamToString = async (
      stream: NodeJS.ReadableStream
    ): Promise<string> => {
      const chunks: Buffer[] = [];
      return new Promise((resolve, reject) => {
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on("error", (err) => reject(err));
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
    };

    const htmlToText = (html: string): string => {
      return htmlToTextConverter(html, {
        wordwrap: false, // Or your preferred wordwrap column, e.g., 130. false disables it.
        selectors: [
          { selector: "img", format: "skip" },
          { selector: "hr", format: "skip" },
        ],
      });
    };

    const monitorEmails = async () => {
      try {
        if (!imapClient.usable) {
          logger.info(
            "[PingPal Email] Attempting to connect to IMAP server..."
          );
          await imapClient.connect();
          logger.info("[PingPal Email] Connected to IMAP server.");
        }

        logger.info(`[PingPal Email] Opening mailbox: ${mailbox}...`);
        await imapClient.mailboxOpen(mailbox);
        logger.info(`[PingPal Email] Mailbox "${mailbox}" opened.`);

        imapClient.on(
          "exists",
          async (data: {
            count: number;
            prevCount: number | null;
            path: string;
          }) => {
            const previousCount = data.prevCount === null ? 0 : data.prevCount;
            if (data.count > previousCount) {
              logger.info(
                `[PingPal Email] New email(s) detected. Current count: ${data.count}, Previous count: ${previousCount}`
              );
              const lock = await imapClient.getMailboxLock(mailbox);
              try {
                const uidsToFetch = await imapClient.search(
                  { unseen: true },
                  { uid: true }
                );
                logger.info(
                  `[PingPal Email] Found ${uidsToFetch.length} unseen message(s).`
                );

                for (const uid of uidsToFetch) {
                  logger.info(
                    `[PingPal Email] Fetching message UID: ${uid}...`
                  );
                  const msgData = await imapClient.fetchOne(uid.toString(), {
                    envelope: true,
                    bodyStructure: true,
                    headers: true,
                  });

                  let bodyText = "";
                  let textPartInfo = msgData.bodyStructure?.childNodes?.find(
                    (part) => part.type === "text/plain"
                  );

                  if (textPartInfo?.part) {
                    const downloadedPart = await imapClient.download(
                      uid.toString(),
                      textPartInfo.part,
                      { uid: true }
                    );
                    if (downloadedPart?.content) {
                      bodyText = await streamToString(downloadedPart.content);
                    }
                  } else {
                    let htmlPartInfo = msgData.bodyStructure?.childNodes?.find(
                      (part) => part.type === "text/html"
                    );
                    if (htmlPartInfo?.part) {
                      const downloadedHtmlPart = await imapClient.download(
                        uid.toString(),
                        htmlPartInfo.part,
                        { uid: true }
                      );
                      if (downloadedHtmlPart?.content) {
                        const htmlContent = await streamToString(
                          downloadedHtmlPart.content
                        );
                        bodyText = htmlToText(htmlContent);
                      }
                    } else {
                      const firstTextPart =
                        msgData.bodyStructure?.childNodes?.find((part) =>
                          part.type?.startsWith("text/")
                        );
                      if (firstTextPart?.part) {
                        logger.warn(
                          `[PingPal Email] No explicit text/plain or text/html part for UID ${uid}. Attempting first available text part: ${firstTextPart.type}`
                        );
                        const downloadedFallbackPart =
                          await imapClient.download(
                            uid.toString(),
                            firstTextPart.part,
                            { uid: true }
                          );
                        if (downloadedFallbackPart?.content) {
                          bodyText = await streamToString(
                            downloadedFallbackPart.content
                          );
                        }
                      } else {
                        logger.warn(
                          `[PingPal Email] No text/plain or text/html part found for UID ${uid}. Body will be empty.`
                        );
                      }
                    }
                  }

                  let finalMessageId: string;
                  const messageIdFromEnvelope: string | undefined =
                    msgData.envelope?.messageId;

                  if (
                    messageIdFromEnvelope &&
                    typeof messageIdFromEnvelope === "string" &&
                    messageIdFromEnvelope.trim() !== ""
                  ) {
                    finalMessageId = messageIdFromEnvelope.trim();
                    logger.info(
                      `[PingPal Email] Extracted Message-ID from envelope: "${finalMessageId}" for UID ${uid}.`
                    );
                  } else {
                    logger.warn(
                      `[PingPal Email] Message-ID not found or empty in envelope for UID ${uid} (envelope.messageId was: "${messageIdFromEnvelope}"). Attempting to parse from raw headers.`
                    );

                    let messageIdFromRawHeaders: string | undefined;
                    if (msgData.headers instanceof Buffer) {
                      const rawHeadersString = msgData.headers.toString("utf8");
                      // Log a truncated version of headers to prevent flooding logs
                      const loggableHeaders =
                        rawHeadersString.length > 1000
                          ? rawHeadersString.substring(0, 1000) +
                            "... (truncated)"
                          : rawHeadersString;
                      logger.info(
                        `[PingPal Email] Raw headers for UID ${uid} (Buffer length: ${msgData.headers.length}):\\n${loggableHeaders}`
                      );

                      // Regex to find Message-ID in raw headers (case-insensitive)
                      const regex = /^Message-ID:\s*([^\r\n]+)/im;
                      const match = rawHeadersString.match(regex);
                      if (match && match[1]) {
                        messageIdFromRawHeaders = match[1].trim();
                        logger.info(
                          `[PingPal Email] Extracted Message-ID from raw headers: "${messageIdFromRawHeaders}" for UID ${uid}.`
                        );
                      } else {
                        logger.warn(
                          `[PingPal Email] Could not parse Message-ID from raw headers for UID ${uid}.`
                        );
                      }
                    } else if (msgData.headers) {
                      // Log if headers is present but not a Buffer, truncated to avoid large logs
                      const headersPreview = JSON.stringify(msgData.headers);
                      logger.warn(
                        `[PingPal Email] msgData.headers is present but not a Buffer for UID ${uid}. Type: ${typeof msgData.headers}. Value (preview): ${headersPreview.substring(0, 200)}${headersPreview.length > 200 ? "..." : ""}`
                      );
                    }

                    if (
                      messageIdFromRawHeaders &&
                      typeof messageIdFromRawHeaders === "string" &&
                      messageIdFromRawHeaders.trim() !== ""
                    ) {
                      finalMessageId = messageIdFromRawHeaders.trim();
                    } else {
                      const fallbackId = `pingpal-no-id-${uid}-${msgData.envelope?.date?.toISOString() || Date.now()}`;
                      logger.warn(
                        `[PingPal Email] Could not extract valid Message-ID from envelope or raw headers for UID ${uid}. Generating fallback ID: "${fallbackId}".`
                      );
                      finalMessageId = fallbackId;
                    }
                  }

                  const emailDetails: EmailDetails = {
                    messageId: finalMessageId,
                    from:
                      msgData.envelope.from?.[0]?.mailbox &&
                      msgData.envelope.from?.[0]?.host
                        ? `${msgData.envelope.from[0].mailbox}@${msgData.envelope.from[0].host}`
                        : msgData.envelope.from?.[0]?.name || "Unknown Sender",
                    to:
                      msgData.envelope.to?.map((addr) =>
                        addr.mailbox && addr.host
                          ? `${addr.mailbox}@${addr.host}`
                          : addr.name || "Unknown Recipient"
                      ) || [],
                    subject: msgData.envelope.subject || "No Subject",
                    bodyText: bodyText,
                  };

                  logger.info(
                    `[PingPal Email] Processing email: Subject - "${emailDetails.subject}", From - "${emailDetails.from}", Message-ID - "${emailDetails.messageId}"`
                  );
                  const analyzeAction = runtime.actions.find(
                    (a) => a.name === "ANALYZE_EMAIL"
                  );
                  if (analyzeAction?.handler) {
                    try {
                      await analyzeAction.handler(
                        runtime,
                        emailDetails as any,
                        undefined,
                        undefined
                      );
                    } catch (actionError) {
                      logger.error(
                        `[PingPal Email] Error executing ANALYZE_EMAIL action for UID ${uid}:`,
                        actionError
                      );
                    }
                  } else {
                    logger.error(
                      "[PingPal Email] ANALYZE_EMAIL action not found."
                    );
                  }
                }
              } catch (fetchErr) {
                logger.error(
                  "[PingPal Email] Error fetching or processing messages:",
                  fetchErr
                );
              } finally {
                lock.release();
              }
            }
          }
        );

        logger.info("[PingPal Email] Starting IDLE mode...");
        try {
          await imapClient.idle();
          logger.info("[PingPal Email] IDLE mode stopped gracefully.");
        } catch (idleErr) {
          logger.error(
            "[PingPal Email] IDLE mode error or connection lost:",
            idleErr
          );
          if (imapClient.usable === false) {
            logger.info(
              "[PingPal Email] Connection lost during IDLE. Attempting to reconnect in 30 seconds..."
            );
            setTimeout(monitorEmails, 30000);
          } else {
            logger.info(
              "[PingPal Email] IDLE ended, but client still usable. Will attempt to restart IDLE in 10 seconds."
            );
            setTimeout(async () => {
              try {
                if (imapClient.usable) {
                  await imapClient.idle();
                }
              } catch (reIdleErr) {
                logger.error(
                  "[PingPal Email] Failed to restart IDLE:",
                  reIdleErr
                );
                setTimeout(monitorEmails, 30000);
              }
            }, 10000);
          }
        }
      } catch (err) {
        logger.error("[PingPal Email] Main monitoring function error:", err);
        logger.info("[PingPal Email] Attempting to reconnect in 60 seconds...");
        if (imapClient.usable) {
          try {
            await imapClient.logout();
          } catch (logoutErr) {
            logger.error(
              "[PingPal Email] Error during logout after main error:",
              logoutErr
            );
            imapClient.close();
          }
        } else {
          imapClient.close();
        }
        setTimeout(monitorEmails, 60000);
      }
    };

    monitorEmails();

    const gracefulShutdown = async () => {
      logger.info(
        "[PingPal Email] Attempting graceful shutdown of IMAP client..."
      );
      if (imapClient && imapClient.usable) {
        try {
          await imapClient.logout();
          logger.info("[PingPal Email] IMAP client logged out successfully.");
        } catch (err) {
          logger.error("[PingPal Email] Error during IMAP logout:", err);
          imapClient.close();
        }
      } else if (imapClient) {
        imapClient.close();
        logger.info(
          "[PingPal Email] IMAP client closed (was not in a usable state)."
        );
      }
    };

    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);

    logger.info(
      "PingPal Email Plugin (with imapflow) initialized and monitoring started."
    );
  },
};

export default pingPalEmailPlugin;
