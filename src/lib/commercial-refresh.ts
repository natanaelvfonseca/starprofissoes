const eventName = "star-commercial-configuration";

export function notifyCommercialConfigurationChanged(unitId: string) {
  const change = { unitId, changeId: crypto.randomUUID() };
  window.dispatchEvent(new CustomEvent(eventName, { detail: change }));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(eventName);
    channel.postMessage(change);
    channel.close();
  }
  // Also supports browsers without BroadcastChannel.
  try {
    localStorage.setItem(eventName, JSON.stringify(change));
  } catch {
    /* Storage can be unavailable in private sessions. */
  }
}

export function subscribeCommercialConfiguration(
  unitId: string,
  refresh: () => void,
  pollMs = 15000,
) {
  let lastChangeId: string | undefined;
  const onChange = (change: { unitId?: string; changeId?: string } = {}) => {
    if (change.changeId && change.changeId === lastChangeId) return;
    lastChangeId = change.changeId;
    if (!unitId || unitId === "all" || change.unitId === unitId) refresh();
  };
  const onEvent = (event: Event) => onChange((event as CustomEvent).detail);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== eventName || !event.newValue || "BroadcastChannel" in window) return;
    try {
      onChange(JSON.parse(event.newValue));
    } catch {
      /* Ignore malformed storage. */
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") refresh();
  };
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(eventName) : null;
  if (channel) channel.onmessage = (event) => onChange(event.data);
  const interval = window.setInterval(onVisible, pollMs);
  window.addEventListener(eventName, onEvent);
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener(eventName, onEvent);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", onVisible);
    document.removeEventListener("visibilitychange", onVisible);
    channel?.close();
  };
}
