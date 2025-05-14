# PingPal Email-to-Telegram Monitor Plugin (plugin-pingpal-email)

This ElizaOS plugin, `plugin-pingpal-email`, monitors a specified email account for incoming emails, analyzes their importance using a Language Model (LLM), and sends notifications for critical emails to a designated Telegram chat. It is designed to help users manage email overload by filtering out noise and ensuring timely awareness of important messages.

This plugin uses the `imapflow` library for direct IMAP communication with an email server and integrates with `@elizaos/plugin-telegram` for sending notifications.

## Key Features

- **Direct IMAP Email Monitoring:** Connects to an email account (e.g., Gmail, Outlook via IMAP) to listen for new emails.
- **LLM-Powered Importance Analysis:** Utilizes an LLM via `runtime.useModel` to analyze the subject and body of incoming emails to determine their importance and generate a concise summary.
- **Telegram Notifications:** Sends private Telegram messages for emails deemed important, including the sender, a summary, and a note to check the relevant inbox.
- **Deduplication:** Prevents duplicate notifications for the same email message by tracking processed email Message-IDs.
- **Configurable:** Setup involves environment variables for credentials and specific character settings within your ElizaOS agent configuration.

## How It Works

1.  **Initialization (`init` in `src/index.ts`):**

    - The plugin connects to the configured IMAP server using credentials provided via settings (typically sourced from environment variables).
    - It uses `imapflow` to listen for new emails in the specified mailbox (e.g., 'INBOX').
    - An internal logging room is created for the agent if it doesn't exist.

2.  **New Email Detection:**

    - When a new email arrives, `imapflow` detects it (e.g., via IMAP IDLE or polling).
    - The plugin fetches essential details: Message-ID, From, To, Subject, and Body text (converted to plain text if necessary).

3.  **Email Analysis (`ANALYZE_EMAIL` action in `src/actions/analyzeEmailAction.ts`):**

    - Before analysis, the plugin checks if the email's Message-ID has already been processed to prevent duplicates. This check uses ElizaOS memories stored in a table (e.g., `pingpal_email_processed`).
    - If it's a new email, the `ANALYZE_EMAIL` action is triggered.
    - This action constructs a prompt with the email's subject and body and sends it to an LLM using `runtime.useModel`.
    - The LLM responds with a JSON object indicating if the email is `important`, a `summary`, and the `reason_for_importance`.
    - The analysis result and original email details are logged as an ElizaOS memory.

4.  **Telegram Notification (`SEND_EMAIL_TELEGRAM_NOTIFICATION` action in `src/actions/sendTelegramNotificationAction.ts`):**
    - If the `ANALYZE_EMAIL` action determines the email is important, it triggers the `SEND_EMAIL_TELEGRAM_NOTIFICATION` action.
    - This action formats a message containing the original sender, the LLM-generated summary, and the user's email address.
    - It then uses the `@elizaos/plugin-telegram` service (obtained via `runtime.getService('telegram')`) to send this message as a private notification to the configured `targetTelegramUserId`.

## Setup and Configuration

To use this plugin, you need to configure your ElizaOS agent and provide necessary credentials and settings.

### 1. Environment Variables

Create a `.env` file in your ElizaOS project root with the following variables:

```env
# IMAP Server Details (for listening to emails)
EMAIL_INCOMING_HOST="your_imap_server.com"
EMAIL_INCOMING_PORT="993" # (typically 993 for SSL/TLS, 143 for plain/STARTTLS)
EMAIL_INCOMING_USER="your_email_address_to_monitor@example.com"
EMAIL_INCOMING_PASS="your_email_password_or_app_password"
EMAIL_INCOMING_SECURE="true" # (true for SSL/TLS on connect, false for STARTTLS or plain)
EMAIL_INCOMING_MAILBOX="INBOX" # (or other mailbox to monitor)

# Telegram Bot Details (for sending notifications)
# This bot will send notifications TO the targetTelegramUserId.
# The target user MUST /start a chat with this bot once.
TELEGRAM_BOT_TOKEN="your_telegram_bot_token"

# LLM Provider API Key (e.g., OpenAI)
OPENAI_API_KEY="your_llm_api_key" # Or other relevant key for your LLM provider

# PingPal Specific Settings (can also be in character settings)
PINGPAL_TARGET_TELEGRAM_USERID="your_numerical_telegram_user_id"
PINGPAL_EMAIL_LOOKBACK_HOURS="24" # How many hours back to look for unseen emails on initial connection/restart
```

**Important Notes:**

- **App Passwords:** For services like Gmail that use 2-Factor Authentication (2FA), you'll likely need to generate an "App Password" to use in `EMAIL_INCOMING_PASS`.
- **Target Telegram User ID:** This is your numerical Telegram User ID. You can get it by messaging a bot like `@userinfobot` on Telegram.
- **Telegram Bot:** The `TELEGRAM_BOT_TOKEN` is for a bot you create (via BotFather on Telegram). The user specified by `PINGPAL_TARGET_TELEGRAM_USERID` must initiate a conversation with this bot (e.g., by sending `/start`) before it can send them private messages.

### 2. ElizaOS Agent Character Configuration

In your agent's character definition file (e.g., `src/index.ts` or similar), configure the agent to use this plugin and provide necessary settings:

```typescript
import type {
  Character,
  IAgentRuntime,
  Project,
  ProjectAgent,
} from "@elizaos/core";
import pingPalEmailPlugin from "plugin-pingpal-email"; // Assuming the plugin is correctly referenced

export const character: Character = {
  name: "Email Monitor Agent",
  plugins: [
    "@elizaos/plugin-sql", // Required for memory (deduplication)
    "@elizaos/plugin-telegram", // Required for sending notifications
    "plugin-pingpal-email", // This plugin
  ],
  settings: {
    // Secrets can reference environment variables
    // These ensure ElizaOS securely manages them and makes them available via runtime.getSetting()
    EMAIL_INCOMING_HOST: process.env.EMAIL_INCOMING_HOST,
    EMAIL_INCOMING_PORT: process.env.EMAIL_INCOMING_PORT,
    EMAIL_INCOMING_USER: process.env.EMAIL_INCOMING_USER,
    EMAIL_INCOMING_PASS: process.env.EMAIL_INCOMING_PASS,
    EMAIL_INCOMING_SECURE: process.env.EMAIL_INCOMING_SECURE,
    EMAIL_INCOMING_MAILBOX: process.env.EMAIL_INCOMING_MAILBOX,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY, // Or your LLM provider key

    // PingPal Email Plugin specific settings
    pingpal_email: {
      targetTelegramUserId: process.env.PINGPAL_TARGET_TELEGRAM_USERID,
      // This is the email address being monitored, used for display in the notification text.
      userEmailAddress: process.env.EMAIL_INCOMING_USER,
      lookbackHours: process.env.PINGPAL_EMAIL_LOOKBACK_HOURS || "24",
    },
  },
  // Other character properties (bio, style, etc.)
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => {
    console.log("Initializing Email Monitor Agent:", character.name);
    // Agent-specific initialization if any
  },
  plugins: [pingPalEmailPlugin], // Ensure the plugin instance is added here
  tests: [],
};

const project: Project = {
  agents: [projectAgent],
};

export default project;
```

## Running the Plugin

1.  **Install Dependencies:** Ensure all dependencies for your ElizaOS project and this plugin are installed (`npm install` or `bun install`).
2.  **Configure:** Set up your `.env` file and character configuration as described above.
3.  **Start ElizaOS:** Run your ElizaOS agent that includes this plugin.
    ```bash
    npx elizaos start
    # or if you have it as a script in package.json
    # npm run start / bun run start
    ```
4.  **Test:** Send emails to the monitored email address.
    - Check the agent's console logs for IMAP connection status, email reception, and LLM analysis logs.
    - If an email is deemed important by the LLM, you should receive a notification on the configured Telegram account.

## Development

```bash
# Start development with hot-reloading
npm run dev

# Build the plugin
npm run build

# Test the plugin
npm run test
```

## Agent Configuration (in package.json - for plugin registry)

The `agentConfig` section in this plugin's `package.json` defines the parameters your plugin requires for users discover it through the registry. This is less about runtime and more about discovery and informing users about necessary settings.

Example from the template (customize as needed for what this plugin _uniquely_ brings, most settings are handled by core ElizaOS or dependent plugins like telegram):

```json
"agentConfig": {
  "pluginType": "elizaos:plugin:1.0.0",
  "pluginParameters": {
    "pingpal_email.targetTelegramUserId": {
      "type": "string",
      "description": "The numerical Telegram User ID to send notifications to."
    },
    "pingpal_email.userEmailAddress": {
      "type": "string",
      "description": "The email address being monitored (used for display in notifications)."
    },
    "pingpal_email.lookbackHours": {
      "type": "string",
      "description": "Optional. How many hours back to check for unseen emails on startup. Defaults to 24."
    }
    // Note: IMAP, Telegram Bot Token, and LLM API keys are typically configured
    // as secrets at the agent level, not directly as pluginParameters here,
    // as they are sensitive and often shared across an agent's plugins.
    // The plugin relies on these being available via runtime.getSetting().
  }
}
```

Customize this section to accurately reflect settings specific to `plugin-pingpal-email` that a user would configure within their agent's `character.settings.pingpal_email` block.

## Documentation

Provide clear documentation about:

- What your plugin does
- How to use it
- Required API keys or credentials
- Example usage
