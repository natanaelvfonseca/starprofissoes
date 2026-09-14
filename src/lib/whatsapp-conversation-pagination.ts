export const WHATSAPP_CONVERSATION_PAGE_SIZE = 10;

export function mergeRecentConversations<T extends { id: string; lastMessageAt: string | null }>(
  current: Array<T>,
  incoming: Array<T>,
) {
  const byId = new Map(current.map((conversation) => [conversation.id, conversation]));
  incoming.forEach((conversation) => byId.set(conversation.id, conversation));

  return Array.from(byId.values()).sort((first, second) => {
    const firstTime = Date.parse(first.lastMessageAt ?? "") || -Infinity;
    const secondTime = Date.parse(second.lastMessageAt ?? "") || -Infinity;
    return secondTime - firstTime || second.id.localeCompare(first.id);
  });
}
