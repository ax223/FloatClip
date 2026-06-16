import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import "./styles.css";

const SETTINGS_KEY = "floatclip.settings";
const DEFAULT_SETTINGS = {
  iconSrc: "/default-bubble.svg",
  iconSize: 46,
  iconRadius: 50,
  iconOpacity: 100,
  listSide: "right",
};

let settings = loadSettings();

document.querySelector("#settings").innerHTML = `
  <main class="settings-shell">
    <header class="settings-header">
      <strong>\u8bbe\u7f6e</strong>
    </header>

    <section class="setting-row icon-row">
      <img id="iconPreview" class="settings-icon-preview" alt="" />
      <button id="chooseIcon" class="setting-button" type="button">\u9009\u62e9\u56fe\u6807</button>
    </section>

    <label class="setting-row stacked">
      <span>\u56fe\u6807\u5927\u5c0f</span>
      <div class="range-line">
        <input id="iconSize" type="range" min="32" max="52" step="1" />
        <output id="sizeValue"></output>
      </div>
    </label>

    <label class="setting-row stacked">
      <span>\u56fe\u6807\u5706\u89d2</span>
      <div class="range-line">
        <input id="iconRadius" type="range" min="0" max="50" step="1" />
        <output id="radiusValue"></output>
      </div>
    </label>

    <label class="setting-row stacked">
      <span>\u56fe\u6807\u900f\u660e\u5ea6</span>
      <div class="range-line">
        <input id="iconOpacity" type="range" min="20" max="100" step="1" />
        <output id="opacityValue"></output>
      </div>
    </label>

    <section class="setting-row">
      <span>\u5f00\u673a\u542f\u52a8</span>
      <button id="autostartToggle" class="switch" type="button" role="switch" aria-checked="false">
        <span></span>
      </button>
    </section>

    <section class="setting-row stacked">
      <span>\u5217\u8868\u4f4d\u7f6e</span>
      <div class="segmented">
        <button id="listLeft" type="button">\u5de6\u4fa7</button>
        <button id="listRight" type="button">\u53f3\u4fa7</button>
      </div>
    </section>
  </main>
`;

const iconPreview = document.querySelector("#iconPreview");
const chooseIcon = document.querySelector("#chooseIcon");
const sizeInput = document.querySelector("#iconSize");
const sizeValue = document.querySelector("#sizeValue");
const radiusInput = document.querySelector("#iconRadius");
const radiusValue = document.querySelector("#radiusValue");
const opacityInput = document.querySelector("#iconOpacity");
const opacityValue = document.querySelector("#opacityValue");
const autostartToggle = document.querySelector("#autostartToggle");
const listLeft = document.querySelector("#listLeft");
const listRight = document.querySelector("#listRight");

renderSettings();
syncAutostart();

chooseIcon.addEventListener("click", async () => {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
  });

  if (typeof selected === "string" && selected) {
    const iconSrc = await invoke("read_icon_as_data_url", { path: selected });
    updateSettings({ iconSrc, iconPath: selected });
  }
});

radiusInput.addEventListener("input", () => {
  updateSettings({ iconRadius: Number(radiusInput.value) });
});

sizeInput.addEventListener("input", () => {
  updateSettings({ iconSize: Number(sizeInput.value) });
});

opacityInput.addEventListener("input", () => {
  updateSettings({ iconOpacity: Number(opacityInput.value) });
});

autostartToggle.addEventListener("click", async () => {
  const nextEnabled = autostartToggle.getAttribute("aria-checked") !== "true";
  setAutostartToggle(nextEnabled, true);

  try {
    const actualEnabled = await invoke("set_autostart_enabled", { enabled: nextEnabled });
    setAutostartToggle(Boolean(actualEnabled), false);
  } catch (error) {
    console.error(error);
    setAutostartToggle(!nextEnabled, false);
  }
});

listLeft.addEventListener("click", () => updateSettings({ listSide: "left" }));
listRight.addEventListener("click", () => updateSettings({ listSide: "right" }));

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function updateSettings(next) {
  settings = { ...settings, ...next };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  renderSettings();
  emit("settings-changed", settings);
}

function renderSettings() {
  iconPreview.src = normalizeIconSrc(settings.iconSrc);
  iconPreview.style.width = `${clampIconSize(settings.iconSize)}px`;
  iconPreview.style.height = `${clampIconSize(settings.iconSize)}px`;
  iconPreview.style.borderRadius = `${settings.iconRadius}%`;
  iconPreview.style.opacity = String(clampPercent(settings.iconOpacity) / 100);
  sizeInput.value = String(clampIconSize(settings.iconSize));
  sizeValue.value = `${clampIconSize(settings.iconSize)}px`;
  radiusInput.value = String(settings.iconRadius);
  radiusValue.value = `${settings.iconRadius}%`;
  opacityInput.value = String(clampPercent(settings.iconOpacity));
  opacityValue.value = `${clampPercent(settings.iconOpacity)}%`;
  listLeft.classList.toggle("active", settings.listSide === "left");
  listRight.classList.toggle("active", settings.listSide !== "left");
}

async function syncAutostart() {
  setAutostartToggle(false, true);
  try {
    const enabled = await invoke("get_autostart_enabled");
    setAutostartToggle(Boolean(enabled), false);
  } catch (error) {
    console.error(error);
    setAutostartToggle(false, false);
  }
}

function setAutostartToggle(enabled, loading) {
  autostartToggle.classList.toggle("active", enabled);
  autostartToggle.classList.toggle("loading", loading);
  autostartToggle.disabled = loading;
  autostartToggle.setAttribute("aria-checked", String(enabled));
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
