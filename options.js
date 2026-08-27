import {
  getState,
  addActivity,
  clearActivity,
  activityToCsv,
} from "./lib/storage.js";

const els = {
  status: document.getElementById("status"),
  rows: document.getElementById("rows"),
  empty: document.getElementById("empty"),
  sample: document.getElementById("sample"),
  json: document.getElementById("json"),
  csv: document.getElementById("csv"),
  clear: document.getElementById("clear"),
};

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function download(filename, mime, body) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function render() {
  const state = await getState();
  const { activity, session, activeVault } = state;

  const who = session?.name ? `Signed in as ${session.name}` : "Not signed in";
  els.status.textContent = `${who} · active vault: ${activeVault.name} · ${activity.length} event${activity.length === 1 ? "" : "s"}`;

  els.rows.innerHTML = "";
  els.empty.hidden = activity.length > 0;

  for (const item of activity) {
    const tr = document.createElement("tr");
    const counts = item.redactions || {};
    tr.innerHTML = `
      <td>${formatTime(item.timestamp)}</td>
      <td>${item.vaultName}</td>
      <td>${item.host}</td>
      <td>${item.decision}</td>
      <td>${counts.email || 0}</td>
      <td>${counts.phone || 0}</td>
      <td>${counts.sin || 0}</td>
      <td>${counts.card || 0}</td>
      <td>${counts.ohip || 0}</td>
      <td>${counts.ramq || 0}</td>
    `;
    els.rows.append(tr);
  }
}

els.sample.addEventListener("click", async () => {
  const state = await getState();
  await addActivity({
    vaultId: state.activeVaultId,
    vaultName: state.activeVault.name,
    host: "chatgpt.com",
    decision: "sample — Sent after redaction",
    redactions: { email: 1, phone: 1, sin: 0, card: 0 },
    note: "Demo row so the monthly report download is visible before composer hooks land.",
  });
  await render();
});

els.json.addEventListener("click", async () => {
  const { activity } = await getState();
  download(
    "northgate-activity.json",
    "application/json",
    JSON.stringify(activity, null, 2)
  );
});

els.csv.addEventListener("click", async () => {
  const { activity } = await getState();
  download("northgate-activity.csv", "text/csv", activityToCsv(activity));
});

els.clear.addEventListener("click", async () => {
  await clearActivity();
  await render();
});

render();
