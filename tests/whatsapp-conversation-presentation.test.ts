import assert from "node:assert/strict";
import test from "node:test";
import {
  formatConversationLastMessageAt,
  formatConversationLastMessageParts,
} from "../src/lib/whatsapp-conversation-time.ts";
import { resolveWhatsappMediaPresentation } from "../src/lib/whatsapp-conversation-media.ts";
import { mergeRecentConversations } from "../src/lib/whatsapp-conversation-pagination.ts";

test("última mensagem mostra data e hora reais em São Paulo", () => {
  assert.equal(formatConversationLastMessageAt("2026-09-14T13:32:00.000Z"), "14/09/2026 10:32");
  assert.equal(formatConversationLastMessageAt("2026-09-13T02:15:00.000Z"), "12/09/2026 23:15");
  assert.deepEqual(formatConversationLastMessageParts("2026-09-14T13:32:00.000Z"), {
    date: "14/09",
    time: "10:32",
    full: "14/09/2026 10:32",
  });
  assert.equal(
    formatConversationLastMessageAt("2026-09-14 10:32:00.123456-03"),
    "14/09/2026 10:32",
  );
});

test("conversa sem mensagem ou timestamp inválido não mostra data fictícia", () => {
  assert.equal(formatConversationLastMessageAt(null), "");
  assert.equal(formatConversationLastMessageAt("inválido"), "");
});

test("mídia desconhecida usa MIME e PDF recebe identificação própria", () => {
  assert.deepEqual(resolveWhatsappMediaPresentation("unknown", "image/jpeg", null), {
    mediaType: "image",
    isPdf: false,
  });
  assert.deepEqual(resolveWhatsappMediaPresentation("unknown", "audio/ogg", null), {
    mediaType: "audio",
    isPdf: false,
  });
  assert.deepEqual(
    resolveWhatsappMediaPresentation("document", "application/pdf", "proposta.pdf"),
    {
      mediaType: "document",
      isPdf: true,
    },
  );
  assert.deepEqual(resolveWhatsappMediaPresentation("unknown", null, "anexo.bin"), {
    mediaType: "document",
    isPdf: false,
  });
});

test("atualização da primeira página reordena contato ativo sem duplicar páginas carregadas", () => {
  const current = [
    { id: "a", lastMessageAt: "2026-09-14T13:00:00Z" },
    { id: "b", lastMessageAt: "2026-09-14T12:00:00Z" },
  ];
  const incoming = [{ id: "b", lastMessageAt: "2026-09-14T14:00:00Z" }];
  assert.deepEqual(
    mergeRecentConversations(current, incoming).map((item) => item.id),
    ["b", "a"],
  );
});
