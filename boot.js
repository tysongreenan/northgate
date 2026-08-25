/**
 * Module boot, loaded only after the classic stub has painted the banner.
 */
import { matchHost } from "./lib/hosts.js";
import { adapters } from "./adapters/registry.js";
import { ensureOverlay, setBanner } from "./lib/overlay.js";

export function boot() {
  if (window.__northgateLoaded) return;
  window.__northgateLoaded = true;

  try {
    ensureOverlay();
    setBanner({
      status: "Northgate · script loaded",
      detail: "starting adapter…",
    });

    const host = matchHost(location);
    if (!host || !host.enabled) {
      setBanner({
        status: "Northgate · script loaded",
        detail: "this host is not enabled in V1",
      });
      return;
    }

    const adapter = adapters[host.id];
    if (!adapter?.init) {
      setBanner({
        status: "Northgate · script loaded",
        detail: "adapter missing",
      });
      return;
    }

    adapter.init(host);
  } catch (err) {
    console.warn("[northgate] adapter init failed", err);
    setBanner({
      status: "Northgate · script loaded",
      detail: "adapter failed; banner is up",
    });
  }
}
