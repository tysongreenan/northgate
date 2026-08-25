/**
 * Host registry. V1 enables ChatGPT only.
 * Adding Claude later: flip enabled, add adapters/claude.js hook, add the
 * match to manifest.json content_scripts / host_permissions. No core rewrite.
 */

export const HOSTS = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    enabled: true,
    matches: ["https://chatgpt.com/*"],
    hosts: ["chatgpt.com"],
  },
  {
    id: "claude",
    label: "Claude",
    enabled: false,
    matches: ["https://claude.ai/*"],
    hosts: ["claude.ai"],
  },
  {
    id: "gemini",
    label: "Gemini",
    enabled: false,
    matches: ["https://gemini.google.com/*"],
    hosts: ["gemini.google.com"],
  },
  {
    id: "grok",
    label: "Grok",
    enabled: false,
    matches: [
      "https://grok.com/*",
      "https://grok.x.ai/*",
      "https://x.com/i/grok*",
    ],
    hosts: ["grok.com", "grok.x.ai"],
    pathHosts: [{ host: "x.com", pathPrefix: "/i/grok" }],
  },
];

export function enabledHosts() {
  return HOSTS.filter((entry) => entry.enabled);
}

export function enabledMatches() {
  return enabledHosts().flatMap((entry) => entry.matches);
}

export function matchHost(locationLike) {
  const hostname = String(locationLike.hostname || "")
    .toLowerCase()
    .replace(/^www\./, "");
  const pathname = String(locationLike.pathname || "");

  return (
    HOSTS.find((entry) => {
      if (entry.hosts?.includes(hostname)) {
        return true;
      }
      return (entry.pathHosts || []).some(
        (rule) => hostname === rule.host && pathname.startsWith(rule.pathPrefix)
      );
    }) || null
  );
}
