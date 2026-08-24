export type ParsedMetaLeadEvent = {
  pageId: string;
  formId: string;
  leadgenId: string;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  createdTime: string | null;
  value: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parsedEvent(value: Record<string, unknown>, entryId: unknown): ParsedMetaLeadEvent {
  return {
    pageId: String(value.page_id ?? entryId ?? "").trim(),
    formId: String(value.form_id ?? "").trim(),
    leadgenId: String(value.leadgen_id ?? "").trim(),
    campaignId: stringOrNull(value.campaign_id),
    adsetId: stringOrNull(value.adset_id),
    adId: stringOrNull(value.ad_id),
    createdTime: stringOrNull(value.created_time),
    value,
  };
}

export function parseMetaLeadEvents(payload: Record<string, unknown>) {
  const events: Array<ParsedMetaLeadEvent> = [];
  const seenLeadgenIds = new Set<string>();
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const rawEntry of entries) {
    if (!isRecord(rawEntry)) {
      continue;
    }

    const changes = Array.isArray(rawEntry.changes) ? rawEntry.changes : [];

    for (const rawChange of changes) {
      if (!isRecord(rawChange)) {
        continue;
      }

      const field = stringOrNull(rawChange.field);

      if (field && field !== "leadgen") {
        continue;
      }

      const value = isRecord(rawChange.value) ? rawChange.value : rawChange;
      const event = parsedEvent(value, rawEntry.id);

      if (event.pageId && event.formId && event.leadgenId && !seenLeadgenIds.has(event.leadgenId)) {
        seenLeadgenIds.add(event.leadgenId);
        events.push(event);
      }
    }
  }

  return events;
}

export function parseKognaMetaLeadEvent(payload: Record<string, unknown>) {
  const pageId = stringOrNull(payload.page_id);
  const formId = stringOrNull(payload.form_id);
  const leadgenId = stringOrNull(payload.leadgen_id);

  if (!pageId || !formId || !leadgenId) {
    return null;
  }

  const metaEvent = isRecord(payload.meta_event) ? payload.meta_event : {};
  const nestedEvent = parseMetaLeadEvents(metaEvent).find(
    (event) => event.pageId === pageId && event.formId === formId && event.leadgenId === leadgenId,
  );
  const directValue = isRecord(metaEvent.value) ? metaEvent.value : metaEvent;
  const baseEvent = nestedEvent ?? parsedEvent(directValue, pageId);

  return {
    ...baseEvent,
    pageId,
    formId,
    leadgenId,
  } satisfies ParsedMetaLeadEvent;
}
