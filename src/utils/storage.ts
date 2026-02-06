import { EmailData, FeedConfig, FeedMetadata, FeedList, EmailMetadata } from '../types';

/**
 * Store email data in KV
 */
export async function storeEmail(
  kv: KVNamespace,
  feedId: string,
  emailData: EmailData
): Promise<string> {
  // Generate a unique key for this email
  const timestamp = Date.now();
  const key = `feed:${feedId}:email:${timestamp}`;
  
  // Store the email content
  await kv.put(key, JSON.stringify(emailData));
  
  // Update the feed's metadata (list of emails)
  await updateFeedMetadata(kv, feedId, {
    key,
    subject: emailData.subject,
    receivedAt: timestamp
  });
  
  return key;
}

/**
 * Update feed metadata with a new email
 */
async function updateFeedMetadata(
  kv: KVNamespace,
  feedId: string,
  emailMetadata: EmailMetadata
): Promise<void> {
  const feedMetadataKey = `feed:${feedId}:metadata`;
  const existingMetadata = await kv.get(feedMetadataKey, { type: 'json' }) as FeedMetadata | null;
  
  const metadata: FeedMetadata = existingMetadata || { emails: [] };
  
  // Add new email to the beginning of the list
  metadata.emails.unshift(emailMetadata);
  
  // Keep only the last 50 emails in the metadata
  if (metadata.emails.length > 50) {
    metadata.emails = metadata.emails.slice(0, 50);
  }
  
  // Store updated metadata
  await kv.put(feedMetadataKey, JSON.stringify(metadata));
}

/**
 * Get feed metadata
 */
export async function getFeedMetadata(
  kv: KVNamespace,
  feedId: string
): Promise<FeedMetadata | null> {
  const feedMetadataKey = `feed:${feedId}:metadata`;
  return await kv.get(feedMetadataKey, { type: 'json' }) as FeedMetadata | null;
}

/**
 * Get feed configuration
 */
export async function getFeedConfig(
  kv: KVNamespace,
  feedId: string
): Promise<FeedConfig | null> {
  const feedConfigKey = `feed:${feedId}:config`;
  return await kv.get(feedConfigKey, { type: 'json' }) as FeedConfig | null;
}

/**
 * Get email data
 */
export async function getEmailData(
  kv: KVNamespace,
  key: string
): Promise<EmailData | null> {
  return await kv.get(key, { type: 'json' }) as EmailData | null;
}

/**
 * Create a new feed
 */
export async function createFeed(
  kv: KVNamespace,
  feedId: string,
  feedConfig: FeedConfig
): Promise<void> {
  // Store feed configuration
  const feedConfigKey = `feed:${feedId}:config`;
  await kv.put(feedConfigKey, JSON.stringify(feedConfig));
  
  // Create empty metadata for the feed
  const feedMetadataKey = `feed:${feedId}:metadata`;
  await kv.put(feedMetadataKey, JSON.stringify({
    emails: []
  }));
  
  // Add feed to the list of all feeds
  await addFeedToList(kv, feedId, feedConfig.title, feedConfig.description);
}

/**
 * Add a feed to the global list
 */
export async function addFeedToList(
  kv: KVNamespace,
  feedId: string,
  title: string,
  description?: string
): Promise<void> {
  const feedListKey = 'feeds:list';
  const existingList = await kv.get(feedListKey, { type: 'json' }) as FeedList | null;
  
  const feedList: FeedList = existingList || { feeds: [] };
  
  feedList.feeds.push({
    id: feedId,
    title,
    description
  });
  
  await kv.put(feedListKey, JSON.stringify(feedList));
}

/**
 * Get all feeds
 */
export async function getAllFeeds(kv: KVNamespace): Promise<FeedList> {
  const feedListKey = 'feeds:list';
  const feedList = await kv.get(feedListKey, { type: 'json' }) as FeedList | null;
  
  return feedList || { feeds: [] };
} 
