import {
  VAULTS,
  getState,
  signIn,
  signOut,
  setActiveVault,
  setPretendCanadaOnly,
} from "./lib/storage.js";

const els = {
  signedOut: document.getElementById("signed-out"),
  signedIn: document.getElementById("signed-in"),
  name: document.getElementById("name"),
  signIn: document.getElementById("sign-in"),
  signInError: document.getElementById("sign-in-error"),
  signOut: document.getElementById("sign-out"),
  who: document.getElementById("who"),
  vault: document.getElementById("vault"),
  canadaOnly: document.getElementById("canada-only"),
  activity: document.getElementById("activity"),
  activityEmpty: document.getElementById("activity-empty"),
};

function fillVaults(activeVaultId) {
  els.vault.innerHTML = "";
  for (const vault of VAULTS) {
    const option = document.createElement("option");
    option.value = vault.id;
    option.textContent = vault.name;
    option.selected = vault.id === activeVaultId;
    els.vault.append(option);
  }
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function renderActivity(activity) {
  const recent = activity.slice(0, 5);
  els.activity.innerHTML = "";
  els.activityEmpty.hidden = recent.length > 0;

  for (const item of recent) {
    const li = document.createElement("li");
    const counts = item.redactions || {};
    const countText = `email ${counts.email || 0} · phone ${counts.phone || 0} · sin ${counts.sin || 0} · card ${counts.card || 0}`;
    li.innerHTML = `<div><strong>${item.decision}</strong> · ${item.host}</div>
      <div class="meta">${formatTime(item.timestamp)} · ${item.vaultName}<br>${countText}</div>`;
    els.activity.append(li);
  }
}

async function render() {
  const state = await getState();
  const signedIn = Boolean(state.session?.name);

  els.signedOut.classList.toggle("hidden", signedIn);
  els.signedIn.classList.toggle("hidden", !signedIn);

  if (signedIn) {
    els.who.textContent = state.session.name;
    fillVaults(state.activeVaultId);
    els.canadaOnly.checked = state.pretendCanadaOnly;
  }

  renderActivity(state.activity);
}

els.signIn.addEventListener("click", async () => {
  els.signInError.hidden = true;
  try {
    await signIn(els.name.value);
    els.name.value = "";
    await render();
  } catch (error) {
    els.signInError.textContent = error.message;
    els.signInError.hidden = false;
  }
});

els.name.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    els.signIn.click();
  }
});

els.signOut.addEventListener("click", async () => {
  await signOut();
  await render();
});

els.vault.addEventListener("change", async () => {
  await setActiveVault(els.vault.value);
});

els.canadaOnly.addEventListener("change", async () => {
  await setPretendCanadaOnly(els.canadaOnly.checked);
});

chrome.storage.onChanged.addListener(render);
render();
