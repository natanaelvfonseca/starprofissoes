import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthRequestError,
  isUnauthenticatedError,
  loadAuthSession,
} from "../src/lib/auth-request.ts";

const sessionPayload = {
  user: {
    id: "user-id",
    email: "marketing@star.test",
    name: "Marketing",
    role: "MARKETING",
    avatarUrl: null,
  },
  units: [],
  activeUnit: null,
  canRegisterUsers: true,
  canCreateUnits: true,
  features: { whatsappSupervision: false },
};

test("não repete nem mascara uma sessão não autenticada", async () => {
  let requests = 0;

  await assert.rejects(
    loadAuthSession(async () => {
      requests += 1;
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }, [0, 0]),
    (error) => isUnauthenticatedError(error),
  );

  assert.equal(requests, 1);
});

test("repete falhas transitórias antes de considerar o serviço indisponível", async () => {
  let requests = 0;
  const session = await loadAuthSession(async () => {
    requests += 1;

    if (requests < 3) {
      return Response.json({ error: "Erro temporário." }, { status: 500 });
    }

    return Response.json(sessionPayload);
  }, [0, 0]);

  assert.equal(requests, 3);
  assert.equal(session.user.role, "MARKETING");
});

test("falha de rede não é tratada como logout", async () => {
  const error = await loadAuthSession(async () => {
    throw new TypeError("fetch failed");
  }, []).catch((caught) => caught);

  assert.equal(error instanceof AuthRequestError, true);
  assert.equal(isUnauthenticatedError(error), false);
});
