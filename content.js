/**
 * Generic content entry. Hosts come from a list; this file has no
 * ChatGPT / OpenAI types. Only enabled adapters run.
 */
import { matchHost } from "./lib/hosts.js";
import { adapters } from "./adapters/registry.js";

(function boot() {
  if (window.__northgateLoaded) return;
  window.__northgateLoaded = true;

  const host = matchHost(location);
  if (!host || !host.enabled) return;

  const adapter = adapters[host.id];
  if (!adapter?.init) return;
  adapter.init(host);
})();
