import assert from "node:assert/strict";
import test from "node:test";
import {
  notifyCommercialConfigurationChanged,
  subscribeCommercialConfiguration,
} from "../src/lib/commercial-refresh.ts";

test("salvar configurações atualiza a tela e outra aba da mesma unidade e remove listeners", () => {
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  const savedStorage = globalThis.localStorage;
  const channels = new Set<FakeChannel>();
  class FakeChannel {
    onmessage: ((event: { data: { unitId: string } }) => void) | null = null;
    name: string;
    constructor(name: string) {
      this.name = name;
      channels.add(this);
    }
    postMessage(data: { unitId: string }) {
      for (const channel of channels) if (channel !== this) channel.onmessage?.({ data });
    }
    close() {
      channels.delete(this);
    }
  }
  const windowTarget = Object.assign(new EventTarget(), {
    BroadcastChannel: FakeChannel,
    setInterval: () => 1,
    clearInterval: () => undefined,
  });
  const documentTarget = Object.assign(new EventTarget(), { visibilityState: "visible" });
  try {
    Object.defineProperty(globalThis, "window", { value: windowTarget, configurable: true });
    Object.defineProperty(globalThis, "document", { value: documentTarget, configurable: true });
    Object.defineProperty(globalThis, "localStorage", {
      value: { setItem: () => undefined },
      configurable: true,
    });
    const savedBroadcast = globalThis.BroadcastChannel;
    Object.defineProperty(globalThis, "BroadcastChannel", {
      value: FakeChannel,
      configurable: true,
    });
    try {
      let sameUnit = 0,
        otherUnit = 0;
      const unsubscribe = subscribeCommercialConfiguration("star", () => sameUnit++);
      const unsubscribeOther = subscribeCommercialConfiguration("other", () => otherUnit++);
      notifyCommercialConfigurationChanged("star");
      assert.equal(sameUnit, 1); // Same-document and broadcast delivery are deduplicated.
      assert.equal(otherUnit, 0);
      windowTarget.dispatchEvent(new Event("focus"));
      assert.equal(sameUnit, 2);
      unsubscribe();
      unsubscribeOther();
      notifyCommercialConfigurationChanged("star");
      assert.equal(sameUnit, 2);
      assert.equal(channels.size, 0);
    } finally {
      Object.defineProperty(globalThis, "BroadcastChannel", {
        value: savedBroadcast,
        configurable: true,
      });
    }
  } finally {
    Object.defineProperty(globalThis, "window", { value: savedWindow, configurable: true });
    Object.defineProperty(globalThis, "document", { value: savedDocument, configurable: true });
    Object.defineProperty(globalThis, "localStorage", { value: savedStorage, configurable: true });
  }
});
