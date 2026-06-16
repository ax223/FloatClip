import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Image } from "@tauri-apps/api/image";
import { readImage, readText, writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager";
import "./styles.css";

const SETTINGS_KEY = "floatclip.settings";
const DEFAULT_SETTINGS = {
  iconSrc: "/default-bubble.svg",
  iconSize: 46,
  iconRadius: 50,
  iconOpacity: 100,
  listSide: "right",
};

const MAX_CLIPS = 80;
const MAX_IMAGE_CLIPS = 30;
const MAX_TEXT_CHARS = 120_000;

let clips = [];
let settings = loadSettings();
let activeId = null;

document.querySelector("#app").innerHTML = `
  <main id="panelShell" class="panel-shell" tabindex="0">
    <textarea id="pasteSink" class="paste-sink" aria-hidden="true"></textarea>
    <section id="preview" class="preview-pane"></section>
    <section class="history-pane">
      <div class="history-title">\u5386\u53f2\u8bb0\u5f55</div>
      <div id="list" class="history-list"></div>
    </section>
  </main>
  <div id="toast" class="toast">\u5df2\u5199\u5165\u526a\u8d34\u677f</div>
`;

const shell = document.querySelector("#panelShell");
const list = document.querySelector("#list");
const preview = document.querySelector("#preview");
const toast = document.querySelector("#toast");
const pasteSink = document.querySelector("#pasteSink");
let previewToken = 0;

applySettings(settings);
initHistory();
setPanelVisible(false);
document.addEventListener("paste", handlePaste);
document.addEventListener("keydown", handlePasteShortcut);

async function initHistory() {
  localStorage.removeItem("floatclip.history");

  try {
    const saved = await invoke("load_history");
    clips = normalizeClips(Array.isArray(saved) ? saved : []);
  } catch {
    clips = [];
  }

  activeId = clips[0]?.id ?? null;
  render();
}

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function applySettings(nextSettings) {
  settings = { ...DEFAULT_SETTINGS, ...nextSettings };
  shell.classList.toggle("list-left", settings.listSide === "left");
  shell.classList.toggle("list-right", settings.listSide !== "left");
}

async function persist() {
  await invoke("save_history", { clips: clips.map(toStoredClip) });
}

async function addClip(item) {
  const clip = await prepareClipForStorage({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...item,
  });

  if (!clip) return;

  clips = [clip, ...clips];
  await pruneClips();
  activeId = clips[0].id;
  await persist();
  render();
}

function render() {
  renderList();
  renderPreview(clips.find((item) => item.id === activeId) ?? clips[0]);
}

function renderList() {
  list.innerHTML = "";

  clips.forEach((item, index) => {
    const row = document.createElement("button");
    row.className = `clip-row ${item.id === activeId ? "active" : ""}`;
    row.type = "button";
    row.innerHTML = `
      <span class="clip-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="clip-main">${renderRowPreview(item, index)}</span>
      <span class="delete-btn" title="\u5220\u9664">x</span>
    `;

    row.addEventListener("mouseenter", () => {
      activeId = item.id;
      renderPreview(item);
      document.querySelectorAll(".clip-row").forEach((el) => el.classList.remove("active"));
      row.classList.add("active");
    });

    row.addEventListener("click", async () => {
      try {
        await writeItemToClipboard(item);
        showToast("\u5df2\u5199\u5165\u526a\u8d34\u677f");
        window.setTimeout(() => {
          invoke("hide_panel");
        }, 120);
      } catch (error) {
        console.error(error);
        showToast("\u5199\u5165\u526a\u8d34\u677f\u5931\u8d25");
      }
    });

    row.querySelector(".delete-btn").addEventListener("click", async (event) => {
      event.stopPropagation();
      await cleanupClip(item);
      clips = clips.filter((clip) => clip.id !== item.id);
      activeId = clips[0]?.id ?? null;
      await persist();
      render();
    });

    list.appendChild(row);
  });
}

function renderRowPreview(item, index) {
  if (item.type === "text") {
    return `<span>${escapeHtml(item.text.slice(0, 28))}</span>`;
  }

  if (item.type === "image") {
    return `<span>[${escapeHtml("\u56fe\u7247")}] ${String(index + 1).padStart(2, "0")}</span>`;
  }

  return `<span>${escapeHtml(item.paths.map(fileName).join(", "))}</span>`;
}

function renderPreview(item) {
  const token = ++previewToken;

  if (!item) {
    preview.innerHTML = `<div class="empty-state">\u6682\u65e0\u526a\u8d34\u677f\u8bb0\u5f55</div>`;
    return;
  }

  if (item.type === "text") {
    preview.innerHTML = `
      <div class="preview-label">\u6587\u672c</div>
      <pre class="text-preview">${escapeHtml(item.text)}</pre>
    `;
    return;
  }

  if (item.type === "image") {
    preview.innerHTML = `
      <div class="preview-label">\u56fe\u7247</div>
      <div class="image-stage"><div class="empty-state">\u52a0\u8f7d\u56fe\u7247...</div></div>
    `;
    renderImagePreview(item, token);
    return;
  }

  preview.innerHTML = `
    <div class="preview-label">\u6587\u4ef6</div>
    <div class="file-preview">
      ${item.paths.map((path) => `<div>${escapeHtml(path)}</div>`).join("")}
    </div>
  `;
}

async function writeItemToClipboard(item) {
  if (item.type === "text") {
    await writeText(item.text);
    return;
  }

  if (item.type === "image") {
    if (item.filePath) {
      const image = await Image.fromPath(item.filePath);
      await writeImage(image);
      return;
    }

    if (item.src) {
      await writeImage(item.src);
      return;
    }

    throw new Error("image clip missing filePath/src");
  }

  await invoke("write_files_to_clipboard", { paths: item.paths });
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1200);
}

function fileName(path) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

listen("settings-changed", (event) => applySettings(event.payload ?? loadSettings()));
listen("panel-opened", () => {
  setPanelVisible(false);
  requestAnimationFrame(() => {
    setPanelVisible(true);
    focusPasteSink();
  });
});
listen("panel-closing", () => setPanelVisible(false));
listen("clipboard-written", () => showToast("\u5df2\u5199\u5165\u526a\u8d34\u677f"));

function setPanelVisible(isVisible) {
  shell.classList.toggle("visible", isVisible);
}

async function handlePaste(event) {
  const item = await readPastedClip(event);
  if (!item) return;

  event.preventDefault();
  await addClip(item);
  showToast("\u5df2\u6dfb\u52a0\u5230\u5386\u53f2");
}

async function handlePasteShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "v") return;

  event.preventDefault();

  const item = await readSystemClipboardClip();
  if (!item) {
    showToast("\u526a\u8d34\u677f\u65e0\u53ef\u8bc6\u522b\u5185\u5bb9");
    return;
  }

  await addClip(item);
  showToast("\u5df2\u6dfb\u52a0\u5230\u5386\u53f2");
}

function normalizeClips(saved) {
  return saved
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      if (item.type === "text") {
        return {
          id: String(item.id || crypto.randomUUID()),
          type: "text",
          text: String(item.text || "").slice(0, MAX_TEXT_CHARS),
          createdAt: Number(item.createdAt || Date.now()),
        };
      }

      if (item.type === "image" && item.filePath) {
        return {
          id: String(item.id || crypto.randomUUID()),
          type: "image",
          filePath: String(item.filePath),
          label: String(item.label || "\u56fe\u7247"),
          createdAt: Number(item.createdAt || Date.now()),
        };
      }

      if (item.type === "file" && Array.isArray(item.paths)) {
        return {
          id: String(item.id || crypto.randomUUID()),
          type: "file",
          paths: item.paths.map(String).slice(0, 100),
          createdAt: Number(item.createdAt || Date.now()),
        };
      }

      return null;
    })
    .filter(Boolean)
    .slice(0, MAX_CLIPS);
}

async function prepareClipForStorage(item) {
  if (item.type === "text") {
    return { ...item, text: String(item.text || "").slice(0, MAX_TEXT_CHARS) };
  }

  if (item.type === "image") {
    if (item.src?.startsWith("data:")) {
      const filePath = await invoke("persist_image_data_url", {
        id: item.id,
        dataUrl: item.src,
      });
      return {
        id: item.id,
        type: "image",
        filePath,
        label: item.label || "\u7c98\u8d34\u56fe\u7247",
        createdAt: item.createdAt,
      };
    }

    if (item.filePath) {
      return item;
    }

    return null;
  }

  if (item.type === "file") {
    return { ...item, paths: Array.from(new Set(item.paths.map(String))).slice(0, 100) };
  }

  return null;
}

async function pruneClips() {
  const kept = [];
  const removed = [];
  let imageCount = 0;

  for (const clip of clips) {
    const overCount = kept.length >= MAX_CLIPS;
    const overImages = clip.type === "image" && imageCount >= MAX_IMAGE_CLIPS;

    if (overCount || overImages) {
      removed.push(clip);
      continue;
    }

    if (clip.type === "image") imageCount += 1;
    kept.push(clip);
  }

  clips = kept;
  await Promise.all(removed.map(cleanupClip));
}

async function cleanupClip(item) {
  if (item?.type === "image" && item.filePath) {
    try {
      await invoke("delete_local_file", { path: item.filePath });
    } catch {}
  }
}

function toStoredClip(item) {
  if (item.type === "image") {
    return {
      id: item.id,
      type: item.type,
      filePath: item.filePath,
      label: item.label,
      createdAt: item.createdAt,
    };
  }

  if (item.type === "text") {
    return {
      id: item.id,
      type: item.type,
      text: item.text,
      createdAt: item.createdAt,
    };
  }

  return {
    id: item.id,
    type: item.type,
    paths: item.paths,
    createdAt: item.createdAt,
  };
}

function clipImageSrc(item) {
  if (item.src) return item.src;
  if (item.filePath) return convertFileSrc(item.filePath);
  return "";
}

async function renderImagePreview(item, token) {
  try {
    const src = item.filePath
      ? await invoke("read_image_as_data_url", { path: item.filePath })
      : clipImageSrc(item);

    if (token !== previewToken) return;

    preview.innerHTML = `
      <div class="preview-label">\u56fe\u7247</div>
      <div class="image-stage"><img class="image-preview" src="${src}" alt="" /></div>
    `;
  } catch (error) {
    console.error(error);
    if (token !== previewToken) return;

    preview.innerHTML = `
      <div class="preview-label">\u56fe\u7247</div>
      <div class="empty-state">\u56fe\u7247\u9884\u89c8\u52a0\u8f7d\u5931\u8d25</div>
    `;
  }
}

async function readPastedClip(event) {
  const data = event.clipboardData;

  try {
    const paths = await invoke("read_files_from_clipboard");
    if (Array.isArray(paths) && paths.length > 0) {
      return { type: "file", paths };
    }
  } catch {}

  const files = Array.from(data?.files ?? []);
  const imageFile = files.find((file) => file.type.startsWith("image/"));
  if (imageFile) {
    return {
      type: "image",
      src: await readFileAsDataUrl(imageFile),
      label: imageFile.name || "\u7c98\u8d34\u56fe\u7247",
    };
  }

  if (files.length > 0) {
    return {
      type: "file",
      paths: files.map((file) => file.name || "\u672a\u547d\u540d\u6587\u4ef6"),
    };
  }

  const items = Array.from(data?.items ?? []);
  const imageItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));
  const imageBlob = imageItem?.getAsFile();
  if (imageBlob) {
    return {
      type: "image",
      src: await readFileAsDataUrl(imageBlob),
      label: "\u7c98\u8d34\u56fe\u7247",
    };
  }

  const text = data?.getData("text/plain");
  if (text) {
    return { type: "text", text };
  }

  return null;
}

async function readSystemClipboardClip() {
  try {
    const paths = await invoke("read_files_from_clipboard");
    if (Array.isArray(paths) && paths.length > 0) {
      return { type: "file", paths };
    }
  } catch {}

  try {
    const image = await readImage();
    const size = await image.size();
    const rgba = await image.rgba();
    if (size.width > 0 && size.height > 0 && rgba.length > 0) {
      return {
        type: "image",
        src: rgbaToPngDataUrl(rgba, size.width, size.height),
        label: "\u7c98\u8d34\u56fe\u7247",
      };
    }
  } catch {}

  try {
    const text = await readText();
    if (text) {
      return { type: "text", text };
    }
  } catch {}

  return null;
}

function focusPasteSink() {
  pasteSink.focus({ preventScroll: true });
}

function rgbaToPngDataUrl(rgba, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const pixels = new Uint8ClampedArray(rgba);
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas.toDataURL("image/png");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}
