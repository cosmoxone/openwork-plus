import {
  deepLinkBridgeEvent,
  drainPendingDeepLinks,
  pushPendingDeepLinks,
  type DeepLinkBridgeDetail,
} from "../../app/lib/deep-link-bridge";
import { parseSettingsNavigationDeepLink } from "../../app/lib/openwork-links";
import { subscribeDesktopDeepLinks } from "../../app/lib/desktop";
import { isDesktopRuntime } from "../../app/utils";

let started = false;
const handledSettingsLinks = new Set<string>();

function navigateSettingsDeepLink(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  window.location.hash = `#${normalized}`;
}

function applySettingsNavigationFromUrls(urls: readonly string[]) {
  for (const rawUrl of urls) {
    if (handledSettingsLinks.has(rawUrl)) continue;
    const parsed = parseSettingsNavigationDeepLink(rawUrl);
    if (!parsed) continue;
    handledSettingsLinks.add(rawUrl);
    navigateSettingsDeepLink(parsed.path);
  }
}

function forwardNonSettingsDeepLinks(urls: readonly string[]) {
  const pending: string[] = [];
  for (const rawUrl of urls) {
    if (handledSettingsLinks.has(rawUrl)) continue;
    const parsed = parseSettingsNavigationDeepLink(rawUrl);
    if (parsed) {
      handledSettingsLinks.add(rawUrl);
      navigateSettingsDeepLink(parsed.path);
      continue;
    }
    pending.push(rawUrl);
  }
  if (pending.length > 0) {
    pushPendingDeepLinks(window, pending);
  }
}

export function startDeepLinkBridge(): void {
  if (typeof window === "undefined" || started) return;
  started = true;

  window.addEventListener(deepLinkBridgeEvent, (event) => {
    applySettingsNavigationFromUrls(
      ((event as CustomEvent<DeepLinkBridgeDetail>).detail?.urls ?? []) as string[],
    );
  }, true);

  if (!isDesktopRuntime()) {
    forwardNonSettingsDeepLinks([window.location.href]);
    return;
  }

  applySettingsNavigationFromUrls(drainPendingDeepLinks(window));

  void (async () => {
    try {
      await subscribeDesktopDeepLinks((urls) => {
        forwardNonSettingsDeepLinks(urls);
      });
    } catch {
      // ignore startup failures
    }
  })();
}
