export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type StandaloneNavigator = Navigator & {
  standalone?: boolean;
};

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notifyInstallPromptListeners() {
  listeners.forEach((listener) => listener());
}

export function setDeferredInstallPrompt(prompt: BeforeInstallPromptEvent | null) {
  deferredInstallPrompt = prompt;
  notifyInstallPromptListeners();
}

export function getDeferredInstallPrompt() {
  return deferredInstallPrompt;
}

export function consumeDeferredInstallPrompt() {
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  notifyInstallPromptListeners();
  return prompt;
}

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function isInstalledAsApp() {
  if (typeof window === "undefined") {
    return false;
  }

  const navigatorWithStandalone = window.navigator as StandaloneNavigator;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export function isIosDevice() {
  if (typeof window === "undefined") {
    return false;
  }

  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}
