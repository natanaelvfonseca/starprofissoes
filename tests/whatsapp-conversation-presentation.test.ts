import assert from "node:assert/strict";
import test from "node:test";
import { formatConversationLastMessageAt } from "../src/lib/whatsapp-conversation-time.ts";
import { resolveWhatsappMediaPresentation } from "../src/lib/whatsapp-conversation-media.ts";

test("última mensagem mostra data e hora reais em São Paulo", () => {
  assert.equal(formatConversationLastMessageAt("2026-09-14T13:32:00.000Z"), "14/09/2026, 10:32");
  assert.equal(formatConversationLastMessageAt("2026-09-13T02:15:00.000Z"), "12/09/2026, 23:15");
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
