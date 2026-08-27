/** Local-only state for the Northgate V1 prototype. No backend. */

export const VAULTS = [
  { id: "acme", name: "Sway — Acme Clinic" },
  { id: "birch", name: "Sway — Birch Marketing" },
];

const KEYS = {
  session: "session",
  activeVaultId: "activeVaultId",
  pretendCanadaOnly: "pretendCanadaOnly",
  activity: "activity",
};

const ACTIVITY_CAP = 500;

export function vaultById(id) {
  return VAULTS.find((vault) => vault.id === id) || VAULTS[0];
}

export async function getState() {
  const data = await chrome.storage.local.get([
    KEYS.session,
    KEYS.activeVaultId,
    KEYS.pretendCanadaOnly,
    KEYS.activity,
  ]);

  const activity = Array.isArray(data.activity) ? data.activity : [];
  const activeVaultId = VAULTS.some((vault) => vault.id === data.activeVaultId)
    ? data.activeVaultId
    : VAULTS[0].id;

  return {
    session: data.session || null,
    activeVaultId,
    activeVault: vaultById(activeVaultId),
    pretendCanadaOnly: Boolean(data.pretendCanadaOnly),
    activity,
  };
}

export async function signIn(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    throw new Error("Enter a name to sign in.");
  }

  const session = {
    name: trimmed,
    signedInAt: new Date().toISOString(),
  };

  await chrome.storage.local.set({ [KEYS.session]: session });
  return session;
}

export async function signOut() {
  await chrome.storage.local.remove(KEYS.session);
}

export async function setActiveVault(vaultId) {
  if (!VAULTS.some((vault) => vault.id === vaultId)) {
    throw new Error("Unknown vault.");
  }
  await chrome.storage.local.set({ [KEYS.activeVaultId]: vaultId });
}

export async function setPretendCanadaOnly(on) {
  await chrome.storage.local.set({ [KEYS.pretendCanadaOnly]: Boolean(on) });
}

export async function addActivity(entry) {
  const state = await getState();
  const item = {
    id: crypto.randomUUID(),
    timestamp: entry.timestamp || new Date().toISOString(),
    vaultId: entry.vaultId || state.activeVaultId,
    vaultName: entry.vaultName || vaultById(entry.vaultId || state.activeVaultId).name,
    host: entry.host || "",
    decision: entry.decision || "unknown",
    redactions: {
      email: Number(entry.redactions?.email) || 0,
      phone: Number(entry.redactions?.phone) || 0,
      sin: Number(entry.redactions?.sin) || 0,
      card: Number(entry.redactions?.card) || 0,
      ohip: Number(entry.redactions?.ohip) || 0,
      ramq: Number(entry.redactions?.ramq) || 0,
    },
    note: entry.note || "",
  };

  const activity = [item, ...state.activity].slice(0, ACTIVITY_CAP);
  await chrome.storage.local.set({ [KEYS.activity]: activity });
  return item;
}

export async function clearActivity() {
  await chrome.storage.local.set({ [KEYS.activity]: [] });
}

export function activityToCsv(activity) {
  const header = [
    "timestamp",
    "vault",
    "host",
    "decision",
    "email",
    "phone",
    "sin",
    "card",
    "ohip",
    "ramq",
    "note",
  ];

  const rows = activity.map((item) => [
    item.timestamp,
    item.vaultName,
    item.host,
    item.decision,
    item.redactions?.email ?? 0,
    item.redactions?.phone ?? 0,
    item.redactions?.sin ?? 0,
    item.redactions?.card ?? 0,
    item.redactions?.ohip ?? 0,
    item.redactions?.ramq ?? 0,
    item.note || "",
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
