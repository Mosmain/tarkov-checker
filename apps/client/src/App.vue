<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import Message from "primevue/message";
import { useConfirm } from "primevue/useconfirm";
import MapView from "./components/MapView.vue";
import MapQuickMenu from "./components/MapQuickMenu.vue";

// SettingsPanel pulls in ~11 PrimeVue components (Drawer, Select, MultiSelect,
// Slider, ToggleSwitch, ...) plus the tarkov.dev fetch logic. None of it is
// needed for first paint — defer it to its own chunk so the map renders sooner.
const SettingsPanel = defineAsyncComponent(() => import("./components/SettingsPanel.vue"));
import { useServerTransport } from "./composables/useServerTransport";
import { useSettingsStore } from "./stores/settings";
import { useTauriOverlay } from "./composables/useTauriOverlay";
import { useGlobalShortcut } from "./composables/useGlobalShortcut";
import { useUiText } from "./i18n";
import { formatHotkeyParts } from "./utils/hotkey";

const settings = useSettingsStore();
const {
  mapCode,
  overlayClickThrough,
  apiLang,
  lockHotkey,
  zoomInHotkey,
  zoomOutHotkey,
  floorUpHotkey,
  floorDownHotkey,
} = storeToRefs(settings);

const mapDisplayName = ref<string>("…");
const mapError = ref<string | null>(null);
const extractsError = ref<string | null>(null);

// Browser/PWA mode talks to the LAN Node server on :3000; Tauri mode
// shortcuts the WS layer and listens for Rust-emitted events directly.
const wsUrl = `ws://${window.location.hostname}:3000/ws`;
const { status, lastMessage } = useServerTransport(wsUrl);
const overlay = useTauriOverlay();
const { isTauri } = overlay;
const t = useUiText();
const confirm = useConfirm();

// Lock / click-through hotkey is stored as a Tauri accelerator string in the
// settings store; the bottom-right indicator below shows it as a Kbd row via
// `formatHotkeyParts`.
const lockHotkeyParts = computed(() => formatHotkeyParts(lockHotkey.value));

// MapView's imperative methods are exposed via defineExpose so the global
// hotkeys below can drive zoom and floor navigation from anywhere.
const mapViewRef = ref<InstanceType<typeof MapView> | null>(null);

// Register all five global shortcuts. The composable handles re-registration
// when the store value changes and rolls back on failure.
useGlobalShortcut(isTauri, lockHotkey, () => {
  overlayClickThrough.value = !overlayClickThrough.value;
});
useGlobalShortcut(isTauri, zoomInHotkey, () => mapViewRef.value?.zoomIn());
useGlobalShortcut(isTauri, zoomOutHotkey, () => mapViewRef.value?.zoomOut());
useGlobalShortcut(isTauri, floorUpHotkey, () => mapViewRef.value?.nextFloor());
useGlobalShortcut(isTauri, floorDownHotkey, () => mapViewRef.value?.prevFloor());

if (isTauri) {
  // Start session interactive — persisted lock state from previous session is
  // intentionally ignored so the app never boots into an unrecoverable state
  // if the hotkey somehow stops working.
  overlayClickThrough.value = false;
  void overlay.setClickThrough(false);

  watch(overlayClickThrough, (locked) => void overlay.setClickThrough(locked));

  // Enables the rounded-corner clip on <body>; CSS rule lives in styles.css.
  document.documentElement.classList.add("overlay-window");
}

const TRAY_ID = "tarkov-checker-tray";

// Holds the live tray handle so the i18n watcher can re-set its menu
// without recreating the whole icon.
type TrayHandle = Awaited<ReturnType<typeof import("@tauri-apps/api/tray").TrayIcon.new>>;
let trayRef: TrayHandle | null = null;

async function buildTrayMenu(): Promise<
  Awaited<ReturnType<typeof import("@tauri-apps/api/menu").Menu.new>>
> {
  const [{ Menu }, { getCurrentWindow }] = await Promise.all([
    import("@tauri-apps/api/menu"),
    import("@tauri-apps/api/window"),
  ]);
  return Menu.new({
    items: [
      {
        id: "toggle-lock",
        text: t.value.tray.toggleLock,
        action: () => {
          overlayClickThrough.value = !overlayClickThrough.value;
        },
      },
      {
        id: "show",
        text: t.value.tray.showWindow,
        action: async () => {
          const win = getCurrentWindow();
          await win.show();
          await win.setFocus();
        },
      },
      { item: "Separator" },
      {
        id: "quit",
        text: t.value.tray.quit,
        action: async () => {
          await getCurrentWindow().close();
        },
      },
    ],
  });
}

onMounted(async () => {
  if (!isTauri) return;


  // System tray icon — backup channel for users whose hotkey is taken or
  // who dragged the window off-screen. Menu labels follow the active i18n
  // bundle and are refreshed by the apiLang watcher below.
  try {
    const [{ TrayIcon }, { defaultWindowIcon }] = await Promise.all([
      import("@tauri-apps/api/tray"),
      import("@tauri-apps/api/app"),
    ]);

    const icon = await defaultWindowIcon();
    trayRef = await TrayIcon.new({
      id: TRAY_ID,
      icon: icon ?? undefined,
      menu: await buildTrayMenu(),
      tooltip: t.value.tray.tooltip,
      showMenuOnLeftClick: true,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[tray] creation failed:", err);
  }
});

// Rebuild tray menu + tooltip when the user switches language.
watch(apiLang, async () => {
  if (!isTauri || !trayRef) return;
  try {
    await trayRef.setMenu(await buildTrayMenu());
    await trayRef.setTooltip(t.value.tray.tooltip);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[tray] i18n refresh failed:", err);
  }
});

onBeforeUnmount(async () => {
  if (!isTauri) return;
  // Global shortcut cleanup is handled inside useGlobalShortcut composables.
  const { TrayIcon } = await import("@tauri-apps/api/tray");
  await TrayIcon.removeById(TRAY_ID);
  trayRef = null;
});

function confirmClose(): void {
  if (!isTauri) return;
  confirm.require({
    message: t.value.closeConfirm.message,
    header: t.value.closeConfirm.title,
    icon: "pi pi-times-circle",
    acceptLabel: t.value.closeConfirm.accept,
    rejectLabel: t.value.closeConfirm.reject,
    acceptClass: "p-button-danger",
    accept: () => {
      void (async () => {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().close();
      })();
    },
  });
}

const quickMenu = ref<InstanceType<typeof MapQuickMenu> | null>(null);

// Open the quick transparency panel when the user right-clicks anywhere on
// the map area. Tauri-only — in the browser we let the native context menu
// behave normally (the panel controls are overlay-specific anyway).
// Buttons, the drag pill, drawer, and lock cluster naturally fall outside
// `.leaflet-container`, so they're excluded automatically.
function onMapContextMenu(event: MouseEvent): void {
  if (!isTauri) return;
  const target = event.target as HTMLElement | null;
  if (!target?.closest(".leaflet-container")) return;
  event.preventDefault();
  quickMenu.value?.open(event.clientX, event.clientY);
}

async function startDrag(event: MouseEvent): Promise<void> {
  if (!isTauri) return;
  if (event.button !== 0) return; // left button only
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

const statusIconClass = computed(() => {
  switch (status.value) {
    case "open":
      return "pi pi-circle-fill text-green-500";
    case "connecting":
      return "pi pi-circle-fill text-amber-400 animate-pulse";
    case "closed":
      return "pi pi-times-circle text-red-500";
    default:
      return "pi pi-circle text-surface-500";
  }
});
</script>

<template>
  <ConfirmDialog />
  <MapQuickMenu ref="quickMenu" />
  <div
    class="relative h-screen w-screen text-surface-0"
    :class="isTauri ? '' : 'bg-surface-950'"
    @contextmenu="onMapContextMenu"
  >
    <MapView
      ref="mapViewRef"
      :key="mapCode"
      :map-code="mapCode"
      :last-message="lastMessage"
      @map-name="mapDisplayName = $event"
      @map-error="mapError = $event"
      @extracts-error="extractsError = $event"
    />

    <div class="absolute top-3 right-3 z-[1000] flex items-center gap-2">
      <span
        class="inline-flex items-center gap-2 rounded-md bg-surface-800/70 px-3 py-1 text-sm font-medium text-surface-0 backdrop-blur select-none"
        :class="isTauri ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'"
        @mousedown="startDrag"
      >
        <i
          :class="['text-[10px] pointer-events-none', statusIconClass]"
          :title="'ws: ' + status"
          aria-hidden="true"
        />
        <span class="pointer-events-none">{{ mapDisplayName }}</span>
      </span>
      <SettingsPanel v-if="!overlayClickThrough" />
      <Button
        v-if="isTauri && !overlayClickThrough"
        rounded
        severity="secondary"
        class="!bg-surface-800/80 hover:!bg-red-900 !border-surface-700 backdrop-blur"
        aria-label="Close"
        @click="confirmClose"
      >
        <template #icon>
          <i class="pi pi-times text-sm" />
        </template>
      </Button>
    </div>

    <div
      v-if="mapError || extractsError"
      class="pointer-events-none absolute top-14 inset-x-3 z-[1000] flex flex-col items-center gap-1"
    >
      <Message v-if="mapError" severity="error" size="small" :closable="false">
        Map load error: {{ mapError }}
      </Message>
      <Message v-if="extractsError" severity="warn" size="small" :closable="false">
        Extracts: {{ extractsError }}
      </Message>
    </div>

    <div
      v-if="isTauri"
      class="absolute bottom-3 right-3 z-[1000] flex items-center gap-2"
    >
      <span
        class="pointer-events-none inline-flex items-center gap-1 rounded-md bg-surface-800/70 px-2 py-1 text-[10px] font-semibold tracking-wider backdrop-blur"
      >
        <kbd
          v-for="(part, idx) in lockHotkeyParts"
          :key="idx"
          class="inline-flex items-center"
        >
          <span class="rounded border border-surface-600 bg-surface-900 px-1.5 py-0.5 font-mono">
            {{ part }}
          </span>
          <span v-if="idx < lockHotkeyParts.length - 1" class="px-1 opacity-60">+</span>
        </kbd>
      </span>
      <Button
        rounded
        :severity="overlayClickThrough ? 'primary' : 'secondary'"
        class="!bg-surface-800/80 hover:!bg-surface-800 !border-surface-700 backdrop-blur"
        :aria-label="overlayClickThrough ? 'Locked' : 'Lock interaction'"
        @click="overlayClickThrough = true"
      >
        <template #icon>
          <i :class="overlayClickThrough ? 'pi pi-lock' : 'pi pi-lock-open'" />
        </template>
      </Button>
    </div>
  </div>
</template>
