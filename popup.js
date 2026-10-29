const DB_NAME = "extension-auto-reloader";
const STORE_NAME = "handles";
const $ = (selector) => document.querySelector(selector);

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandle(handle) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(handle, "root");
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getHandle() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get("root");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function refresh() {
  const handle = await getHandle();
  const permission = handle ? await handle.queryPermission({ mode: "read" }) : "prompt";
  const { monitorStatus, lastReload } = await chrome.storage.local.get(["monitorStatus", "lastReload"]);
  const active = permission === "granted" && monitorStatus?.active;
  $("#dot").classList.toggle("on", active);
  $("#statusTitle").textContent = active ? "A monitorizar" : (handle ? "Monitorização pausada" : "Configuração necessária");
  $("#statusDetail").textContent = active
    ? `${monitorStatus.files} ficheiros · verificado ${new Date(monitorStatus.checkedAt).toLocaleTimeString()}`
    : "Escolha ou volte a autorizar a pasta das extensões.";
  $("#start").hidden = !handle || permission === "granted";
  if (lastReload) {
    $("#last").hidden = false;
    const succeeded = lastReload.results.filter((result) => result.ok).length;
    $("#lastDetail").textContent = `${new Date(lastReload.timestamp).toLocaleString()} · ${succeeded} extensões recarregadas`;
  }
}

async function loadExtensionIds() {
  const { extensionIds = [] } = await chrome.storage.local.get("extensionIds");
  $("#extensionIds").value = extensionIds.join("\n");
}

function parseExtensionIds(value) {
  return [...new Set(value.split(/[\s,;]+/).map((id) => id.trim()).filter(Boolean))];
}

$("#browser").textContent = /Edg\//.test(navigator.userAgent) ? "Microsoft Edge" : "Google Chrome";
$("#choose").addEventListener("click", async () => {
  const handle = await showDirectoryPicker({ mode: "read", id: "extensions-root" });
  await saveHandle(handle);
  await chrome.runtime.sendMessage({ type: "ensure-monitor" });
  setTimeout(refresh, 600);
});
$("#start").addEventListener("click", async () => {
  const handle = await getHandle();
  if (handle && await handle.requestPermission({ mode: "read" }) === "granted") {
    await chrome.runtime.sendMessage({ type: "ensure-monitor" });
    setTimeout(refresh, 600);
  }
});
$("#saveIds").addEventListener("click", async () => {
  const extensionIds = parseExtensionIds($("#extensionIds").value);
  const invalidIds = extensionIds.filter((id) => !/^[a-p]{32}$/.test(id));
  if (invalidIds.length) {
    $("#idsStatus").textContent = `ID inválido: ${invalidIds[0]}`;
    $("#idsStatus").classList.add("error");
    return;
  }
  await chrome.storage.local.set({ extensionIds });
  $("#extensionIds").value = extensionIds.join("\n");
  $("#idsStatus").textContent = extensionIds.length
    ? `${extensionIds.length} extensão(ões) selecionada(s).`
    : "Lista vazia: todas as extensões de desenvolvimento serão recarregadas.";
  $("#idsStatus").classList.remove("error");
});
chrome.storage.onChanged.addListener(refresh);
refresh();
loadExtensionIds();
