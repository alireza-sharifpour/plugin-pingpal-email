import { logger, IAgentRuntime, ServiceType } from "@elizaos/core";

export async function handleEmailMessage(eventPayload: {
  runtime: IAgentRuntime;
  message: any;
}) {
  const { runtime, message: emailMessage } = eventPayload;
  const emailService = runtime.getService(ServiceType.EMAIL);
  console.log("EmailServiceAli", emailService);
  console.log("emailMessageAli", emailMessage);
  logger.debug(
    {
      agentId: runtime.agentId,
      elizaInternalRoomId: emailMessage.roomId,
      elizaMessageId: emailMessage.id,
      messageContentUrl: emailMessage.content?.url,
      messageTextPreview: emailMessage.content?.text?.substring(0, 70) + "...",
    },
    `[PingPal Email] Received message from Email plugin.`
  );
}
