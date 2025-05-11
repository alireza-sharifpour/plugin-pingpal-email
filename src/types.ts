export interface EmailObject {
  messageId: string;
  from: string;
  to: string[]; // Or string, depending on @elizaos/plugin-email
  subject: string;
  text: string;
  // Add any other fields @elizaos/plugin-email provides and you need
}
