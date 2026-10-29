const DB_NAME = "extension-auto-reloader";
const STORE_NAME = "handles";
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", ".idea", ".vscode"]);
let previousFiles = new Map();
let monitoring = false;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getDirectoryHandle() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get("root");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function scanDirectory(directory, prefix = "") {
  const files = new Map();
  for await (const [name, handle] of directory.entries()) {
    if (name.startsWith(".") || name.endsWith("~")) continue;
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      if (IGNORED_DIRECTORIES.has(name)) continue;
      const nested = await scanDirectory(handle, relativePath);
      for (const [path, signature] of nested) files.set(path, signature);
      continue;
    }
    try {
      const file = await handle.getFile();
      files.set(relativePath, `${file.lastModified}:${file.size}`);
    } catch {
      // O ficheiro pode estar temporariamente bloqueado durante uma gravação.
    }
  }
  return files;
}

function changedPaths(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path));
}

async function poll() {
  if (monitoring) return;
  monitoring = true;
  try {
    const directory = await getDirectoryHandle();
    if (!directory || await directory.queryPermission({ mode: "read" }) !== "granted") {
      previousFiles = new Map();
      return;
    }
    const currentFiles = await scanDirectory(directory);
    if (previousFiles.size) {
      const paths = changedPaths(previousFiles, currentFiles);
      if (paths.length) chrome.runtime.sendMessage({ type: "files-changed", paths });
    }
    previousFiles = currentFiles;
    await chrome.runtime.sendMessage({
      type: "monitor-status",
      target: "background",
      status: { active: true, files: currentFiles.size, checkedAt: Date.now() }
    });
  } catch (error) {
    await chrome.runtime.sendMessage({
      type: "monitor-status",
      target: "background",
      status: { active: false, error: error.message, checkedAt: Date.now() }
    });
  } finally {
    monitoring = false;
  }
}

setInterval(poll, 1500);
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "folder-selected" || message.target !== "offscreen") return;
  previousFiles = new Map();
  poll();
});
poll();
