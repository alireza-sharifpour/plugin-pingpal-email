export interface EmailDetails {
  messageId: string; // e.g., "<CAK+5871L4L1L=Oz7-S+dO-0G9FVf_6s_SUsjoX3zqmmt8J5yjw@mail.gmail.com>"
  from: string; // e.g., "sender@example.com"
  to: string[]; // e.g., ["recipient1@example.com"]
  subject: string;
  bodyText: string;
  // Potentially add 'uid: string | number' if needed for later IMAP operations within actions
}
