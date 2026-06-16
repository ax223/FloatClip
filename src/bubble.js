import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";

const SETTINGS_KEY = "floatclip.settings";
const DEFAULT_SETTINGS = {
  iconSrc: "/default-bubble.svg",
  iconSize: 46,
  iconRadius: 50,
  iconOpacity: 100,
  listSide: "right",
};

const bubble = document.querySelector("#bubble");
const icon = document.querySelector("#bubbleIcon");
const currentWindow = getCurrentWindow();
let pointerStart = null;
let isDragging = false;

applySettings(loadSettings());

bubble.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;

  pointerStart = { x: event.screenX, y: event.screenY };
  isDragging = false;
});

bubble.addEventListener("pointermove", async (event) => {
  if (!pointerStart || isDragging) return;

  const distance = Math.hypot(event.screenX - pointerStart.x, event.screenY - pointerStart.y);
  if (distance <= 4) return;

  isDragging = true;
  try {
    await currentWindow.startDragging();
  } catch {}
});

bubble.addEventListener("pointerup", async (event) => {
  if (event.button !== 0 || !pointerStart) return;

  const shouldToggle = !isDragging;
  pointerStart = null;
  isDragging = false;

  if (shouldToggle) {
    await invoke("toggle_panel");
  }
});

bubble.addEventListener("contextmenu", async (event) => {
  event.preventDefault();
  await invoke("popup_bubble_menu");
});

listen("settings-changed", (event) => applySettings(event.payload ?? loadSettings()));

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function applySettings(settings) {
  const iconSize = clampIconSize(settings.iconSize);
  icon.src = normalizeIconSrc(settings.iconSrc);
  bubble.style.width = `${iconSize}px`;
  bubble.style.height = `${iconSize}px`;
  bubble.style.borderRadius = `${settings.iconRadius}%`;
  icon.style.borderRadius = `${settings.iconRadius}%`;
  bubble.style.opacity = String(clampPercent(settings.iconOpacity) / 100);
}

function clampPercent(value) {
  return Math.min(100, Math.max(20, Number(value) || DEFAULT_SETTINGS.iconOpacity));
}

function clampIconSize(value) {
  return Math.min(52, Math.max(32, Number(value) || DEFAULT_SETTINGS.iconSize));
}

function normalizeIconSrc(src) {
  if (!src || src.startsWith("/") || src.startsWith("http") || src.startsWith("data:")) {
    return src || DEFAULT_SETTINGS.iconSrc;
  }

  return convertFileSrc(src);
}
