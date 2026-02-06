import { Context } from "hono";
import { EmailParser } from "../utils/email-parser";
import { Env, FeedConfig, FeedMetadata } from "../types";

// Interface for ForwardEmail.net webhook payload
interface ForwardEmailPayload {
  recipients?: string[];
  from?: {
    value?: Array<{ address?: string; name?: string }>;
    text?: string;
    html?: string;
  };
  subject?: string;
  text?: string;
  html?: string;
  date?: string;
  messageId?: string;
  headerLines?: Array<{ key: string; line: string }>;
  headers?: string;
  raw?: string;
  attachments?: Array<any>;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function extractIncomingSenderAddresses(
  payload: ForwardEmailPayload,
): string[] {
  const valueEntries = payload.from?.value || [];
  const structuredAddresses = valueEntries
    .map((entry) => entry.address || "")
    .map(normalizeEmail)
    .filter(Boolean);

  if (structuredAddresses.length > 0) {
    return Array.from(new Set(structuredAddresses));
  }

  // Fallback parser for plain text like "Name <sender@example.com>"
  const fromText = payload.from?.text || "";
  const matches =
    fromText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map(normalizeEmail)));
}

function senderMatchesAllowlist(
  sender: string,
  allowedSender: string,
): boolean {
  const normalizedSender = normalizeEmail(sender);
  const normalizedAllowed = normalizeEmail(allowedSender);

  if (!normalizedAllowed) {
    return false;
  }

  if (normalizedAllowed.includes("@")) {
    return normalizedSender === normalizedAllowed;
  }

  const senderDomain = normalizedSender.split("@")[1] || "";
  const normalizedDomain = normalizedAllowed.startsWith("@")
    ? normalizedAllowed.slice(1)
    : normalizedAllowed;
  return senderDomain === normalizedDomain;
}

/**
 * Handle incoming emails from ForwardEmail.net webhook
 */
export async function handle(c: Context): Promise<Response> {
  try {
    // Type assertion for environment variables
    const env = c.env as unknown as Env;

    // Parse the incoming JSON payload
    const payload: ForwardEmailPayload = await c.req.json();

    // Log basic information about the incoming email
    console.log("Received email:", {
      to: payload.recipients?.[0],
      from: payload.from?.text || "Unknown",
      subject: payload.subject,
      contentType: payload.html ? "HTML" : "Text",
    });

    // Extract feed ID from email address (e.g., apple.mountain.42@domain.com -> apple.mountain.42)
    const toAddress = payload.recipients?.[0] || "";
    const feedId = EmailParser.extractFeedId(toAddress);

    if (!feedId) {
      console.error(`Invalid email address format: ${toAddress}`);
      return new Response("Invalid email address format", { status: 400 });
    }

    // Check if the feed exists by looking up the feed configuration
    const feedConfigKey = `feed:${feedId}:config`;
    const feedConfig = (await env.EMAIL_STORAGE.get(
      feedConfigKey,
      "json",
    )) as FeedConfig | null;

    if (!feedConfig) {
      console.error(
        `Feed with ID ${feedId} does not exist or has been deleted`,
      );
      return new Response("Feed does not exist", { status: 404 });
    }

    const allowedSenders = (feedConfig.allowed_senders || [])
      .map(normalizeEmail)
      .filter(Boolean);
    if (allowedSenders.length > 0) {
      const incomingSenders = extractIncomingSenderAddresses(payload);
      const senderAllowed = incomingSenders.some((sender) =>
        allowedSenders.some((allowedSender) =>
          senderMatchesAllowlist(sender, allowedSender),
        ),
      );

      if (!senderAllowed) {
        console.warn(
          `Rejected email for feed ${feedId}; sender not in allowlist`,
          {
            incomingSenders,
            allowedSenders,
          },
        );
        return new Response("Sender not allowed for this feed", {
          status: 403,
        });
      }
    }

    // Parse the email using our simplified parser
    const emailData = EmailParser.parseForwardEmailPayload(payload);

    // Generate a unique key for this email in KV storage
    const emailKey = `feed:${feedId}:${Date.now()}`;

    // Store the email data in KV
    await env.EMAIL_STORAGE.put(emailKey, JSON.stringify(emailData));

    // Get existing feed metadata
    const feedMetadataKey = `feed:${feedId}:metadata`;
    const feedMetadata = ((await env.EMAIL_STORAGE.get(
      feedMetadataKey,
      "json",
    )) || { emails: [] }) as FeedMetadata;

    // Add this email to the feed metadata
    feedMetadata.emails.unshift({
      key: emailKey,
      subject: emailData.subject,
      receivedAt: emailData.receivedAt,
    });

    // Store updated feed metadata
    await env.EMAIL_STORAGE.put(feedMetadataKey, JSON.stringify(feedMetadata));

    console.log(`Successfully processed email for feed ${feedId}`);
    return new Response("Email processed successfully", { status: 200 });
  } catch (error) {
    console.error("Error processing email:", error);
    return new Response("Error processing email", { status: 500 });
  }
}
