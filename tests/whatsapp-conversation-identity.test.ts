import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalWhatsappIdentity,
  phonesAreEquivalent,
  whatsappAliasType,
  whatsappPhoneFromJid,
} from "../src/lib/whatsapp-conversation-identity.ts";

test("usa o telefone do JID como identidade canônica", () => {
  assert.deepEqual(
    canonicalWhatsappIdentity({ remoteJid: "5511999999999@s.whatsapp.net" }),
    { canonicalKey: "phone:5511999999999", canonicalPhone: "5511999999999" },
  );
});

test("consolida LID com o JID alternativo telefônico", () => {
  assert.deepEqual(
    canonicalWhatsappIdentity({
      remoteJid: "123456789@lid",
      alternateJid: "5547999989259@s.whatsapp.net",
    }),
    { canonicalKey: "phone:5547999989259", canonicalPhone: "5547999989259" },
  );
});

test("mantém LID provisório quando ainda não existe telefone", () => {
  assert.deepEqual(canonicalWhatsappIdentity({ remoteJid: "ABC123@lid" }), {
    canonicalKey: "jid:abc123@lid",
    canonicalPhone: null,
  });
});

test("reconhece aliases e não extrai telefone de LID", () => {
  assert.equal(whatsappAliasType("123@lid"), "lid");
  assert.equal(whatsappAliasType("5511999999999@s.whatsapp.net"), "phone");
  assert.equal(whatsappPhoneFromJid("123@lid"), "");
});

test("tolera equivalência de telefone formatado e com prefixo", () => {
  assert.equal(phonesAreEquivalent("+55 (11) 99999-9999", "11999999999"), true);
  assert.equal(phonesAreEquivalent("5511999999999", "5521999999999"), false);
});
