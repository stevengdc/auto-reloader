const OFFSCREEN_URL = "offscreen.html";
let reloadTimer;
let creatingOffscreen;

async function ensureOffscreen() {
  if (!chrome.offscreen) return;
  const url = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [url]
  });
  if (contexts.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["WORKERS"],
      justification: "Monitorizar alterações nos ficheiros de extensões escolhidos pelo utilizador."
    }).finally(() => {
      creatingOffscreen = null;
    });
  }
  await creatingOffscreen;
}

async function reloadDevelopmentExtensions(changedPaths) {
  const { extensionIds = [] } = await chrome.storage.local.get("extensionIds");
  const selectedIds = new Set(extensionIds);
  const extensions = await chrome.management.getAll();
  const targets = extensions.filter((extension) =>
    extension.id !== chrome.runtime.id &&
    extension.enabled &&
    extension.installType === "development" &&
    (!selectedIds.size || selectedIds.has(extension.id))
  );
  const results = [];

  for (const extension of targets) {
    try {
      await chrome.management.setEnabled(extension.id, false);
      await chrome.management.setEnabled(extension.id, true);
      results.push({ id: extension.id, name: extension.name, ok: true });
    } catch (error) {
      results.push({ id: extension.id, name: extension.name, ok: false, error: error.message });
    }
  }

  const event = {
    timestamp: Date.now(),
    changedPaths: changedPaths.slice(0, 20),
    results
  };
  await chrome.storage.local.set({ lastReload: event });
  await chrome.action.setBadgeText({ text: String(results.filter((result) => result.ok).length) });
  await chrome.action.setBadgeBackgroundColor({ color: "#28b979" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
}

chrome.runtime.onInstalled.addListener(() => ensureOffscreen().catch(() => {}));
chrome.runtime.onStartup.addListener(() => ensureOffscreen().catch(() => {}));
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "monitor-status" && message.target === "background") {
    chrome.storage.local.set({ monitorStatus: message.status });
    return false;
  }
  if (message.type === "ensure-monitor") {
    ensureOffscreen()
      .then(async () => {
        await chrome.runtime.sendMessage({ type: "folder-selected", target: "offscreen" });
        sendResponse({ ok: true });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "files-changed") {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => reloadDevelopmentExtensions(message.paths || []), 800);
  }
  return false;
});

ensureOffscreen().catch(() => {});
