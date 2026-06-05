<script setup lang="ts">
import { useSettingsSections } from '@/features/settings/registry';
import { useOverlayStore } from '@/features/overlay/store';
import { useLayerVisibility } from '../composables/useLayerVisibility';

const props = defineProps<{
  floors?: ReadonlyArray<{ id: string; label: string }>;
  currentFloor?: string | null;
}>();
const emit = defineEmits<{ (e: 'selectFloor', id: string): void }>();

const { t } = useI18n();
const sections = useSettingsSections('layers');

// Map is the base map selector (a prerequisite, not a toggleable layer) — it
// gets its own rail icon at the top. Everything else is a real layer, grouped
// by its registry `subgroup` into rail categories.
const baseSection = computed(() => sections.value.find((s) => s.id === 'map') ?? null);
const layerSections = computed(() => sections.value.filter((s) => s.id !== 'map'));

// Category order + icon. Empty categories (loot/quests until their layers ship)
// render as dimmed, disabled icons — visible future landing zones.
const CATEGORY_META = [
  { key: 'player', icon: 'pi-user' },
  { key: 'loot', icon: 'pi-box' },
  { key: 'quests', icon: 'pi-flag' },
] as const;

const categories = computed(() =>
  CATEGORY_META.map((c) => ({
    key: c.key,
    icon: c.icon,
    label: t(`settingsGroups.${c.key}`),
    sections: layerSections.value.filter((s) => s.subgroup === c.key),
  })),
);

// Own the visibility refs in setup scope (persistedRef installs a watch — keep
// that out of render). Cached, so the template lookups below are free.
const layerVis = useLayerVisibility;
layerSections.value.forEach((s) => layerVis(s.id));

const openId = ref<string | null>(null);
const expanded = ref<string | null>(null);
const railRef = ref<HTMLElement | null>(null);
const flyoutRef = ref<HTMLElement | null>(null);

// Hide the whole rail (animated) while the overlay is click-through-locked —
// it can't be interacted with then, and a clean map reads better.
const { clickThrough } = storeToRefs(useOverlayStore());
const railVisible = computed(() => !clickThrough.value);

function toggle(id: string): void {
  openId.value = openId.value === id ? null : id;
  expanded.value = null;
}

onClickOutside(flyoutRef, (e) => {
  // Rail buttons handle their own open/close — don't double-close on them.
  if (railRef.value?.contains(e.target as Node)) return;
  openId.value = null;
});

// On lock, drop any open flyout (the rail itself animates away via <Transition>).
watch(clickThrough, (locked) => {
  if (locked) openId.value = null;
});

// The overlay is a transient surface: when focus leaves it (e.g. clicking back
// into the game), dismiss the flyout so layer config doesn't linger on screen.
useEventListener(window, 'blur', () => {
  openId.value = null;
});

const openCategory = computed(() => categories.value.find((c) => c.key === openId.value) ?? null);
const isMapOpen = computed(() => openId.value === 'map');

// Floor stepper at the rail's bottom (multi-floor maps only). Floors are ordered
// top-to-bottom (highest first, index 0 = top), so "up" steps toward index 0.
const floorList = computed(() => props.floors ?? []);
const hasFloors = computed(() => floorList.value.length > 1);
const floorIndex = computed(() => floorList.value.findIndex((f) => f.id === props.currentFloor));
const currentFloorLabel = computed(
  () => floorList.value[Math.max(0, floorIndex.value)]?.label ?? '',
);
const canFloorUp = computed(() => floorIndex.value > 0);
const canFloorDown = computed(
  () => floorIndex.value >= 0 && floorIndex.value < floorList.value.length - 1,
);
function stepFloor(delta: number): void {
  const i = floorIndex.value < 0 ? 0 : floorIndex.value;
  const target = floorList.value[i + delta];
  if (target) emit('selectFloor', target.id);
}
</script>

<template>
  <Transition name="rail">
    <div
      v-if="railVisible"
      ref="railRef"
      class="layer-rail border-surface-700 bg-surface-900/85 absolute left-0 top-1/2 z-[1100] flex -translate-y-1/2 flex-col gap-1 rounded-r-xl border border-l-0 p-1 backdrop-blur"
    >
      <button
        v-if="baseSection"
        v-tooltip.right="{ value: t('map'), disabled: openId !== null }"
        type="button"
        class="rail-btn"
        :class="{ 'rail-btn--active': isMapOpen }"
        :aria-label="t('map')"
        @click="toggle('map')"
      >
        <i class="pi pi-map" />
      </button>
      <div class="bg-surface-700 my-0.5 h-px" />
      <button
        v-for="c in categories"
        :key="c.key"
        v-tooltip.right="{ value: c.label, disabled: openId !== null }"
        type="button"
        class="rail-btn"
        :class="{ 'rail-btn--active': openId === c.key, 'rail-btn--empty': c.sections.length === 0 }"
        :disabled="c.sections.length === 0"
        :aria-label="c.label"
        @click="toggle(c.key)"
      >
        <i class="pi" :class="c.icon" />
      </button>

      <!-- Floor stepper (multi-floor maps): glanceable current floor + ▲/▼.
           Vertical, in-rail — replaces the bottom-left popup that collided
           with the rail. Fast path is still the floor-up/down hotkeys. -->
      <template v-if="hasFloors">
        <div class="bg-surface-700 my-0.5 h-px" />
        <button
          type="button"
          class="rail-btn"
          :disabled="!canFloorUp"
          :aria-label="t('floor') + ' +'"
          @click="stepFloor(-1)"
        >
          <i class="pi pi-chevron-up text-sm" />
        </button>
        <div
          v-tooltip.right="{ value: t('floorWheelHint'), disabled: openId !== null }"
          class="flex h-5 items-center justify-center text-xs font-semibold tabular-nums opacity-80"
        >
          {{ currentFloorLabel }}
        </div>
        <button
          type="button"
          class="rail-btn"
          :disabled="!canFloorDown"
          :aria-label="t('floor') + ' -'"
          @click="stepFloor(1)"
        >
          <i class="pi pi-chevron-down text-sm" />
        </button>
      </template>

      <!-- Flyout positioned relative to the rail (vertically centred on it), NOT
           the viewport — `position: fixed` + getBoundingClientRect drifted in the
           Tauri WebView2 overlay. No nested overlays remain inside it (map is an
           inline Listbox; section controls are inline), so no Teleport needed. -->
      <div
        v-if="openId"
        ref="flyoutRef"
        class="border-surface-700 bg-surface-900/95 absolute left-full top-1/2 ml-1.5 max-h-[80dvh] w-60 -translate-y-1/2 overflow-y-auto rounded-xl border p-3 shadow-xl backdrop-blur"
      >
        <template v-if="isMapOpen && baseSection">
          <p class="mb-2 text-[10px] font-semibold uppercase tracking-wider opacity-50">
            {{ t('map') }}
          </p>
          <component :is="baseSection.component" />
        </template>
        <template v-else-if="openCategory">
          <p class="mb-2 text-[10px] font-semibold uppercase tracking-wider opacity-50">
            {{ openCategory.label }}
          </p>
          <div
            v-for="s in openCategory.sections"
            :key="s.id"
            class="border-surface-800 border-b py-1.5 last:border-0"
          >
            <div class="flex items-center gap-2">
              <ToggleSwitch
                :model-value="layerVis(s.id).value"
                @update:model-value="(v: boolean) => (layerVis(s.id).value = v)"
              />
              <span class="flex-1 truncate text-sm">{{ t(s.titleKey) }}</span>
              <button
                type="button"
                class="hover:bg-surface-800 flex h-8 w-8 shrink-0 items-center justify-center rounded opacity-70 hover:opacity-100"
                :class="{ 'text-primary-400 bg-surface-800 !opacity-100': expanded === s.id }"
                :aria-label="t('settings')"
                @click="expanded = expanded === s.id ? null : s.id"
              >
                <i class="pi pi-cog text-sm" />
              </button>
            </div>
            <div v-if="expanded === s.id" class="mt-2 pl-1">
              <component :is="s.component" />
            </div>
          </div>
        </template>
      </div>
    </div>
  </Transition>

  <!-- Locked: the rail (and its floor stepper) is hidden, but floors are still
       changed via the floor-up/down hotkeys — keep a minimal read-only floor
       readout so the current level stays glanceable while click-through is on. -->
  <div
    v-if="clickThrough && hasFloors"
    class="sa-bottom sa-left border-surface-700 bg-surface-900/85 absolute z-[1100] flex items-center gap-1.5 rounded-md border px-2 py-1 backdrop-blur"
  >
    <i class="pi pi-clone text-[10px] opacity-50" />
    <span class="text-xs font-semibold tabular-nums">{{ currentFloorLabel }}</span>
  </div>
</template>

<style scoped>
.rail-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  color: var(--p-surface-300);
  transition:
    background-color 0.12s,
    color 0.12s;
}
.rail-btn:hover {
  background-color: var(--p-surface-800);
  color: var(--p-surface-0);
}
.rail-btn--active {
  background-color: color-mix(in srgb, var(--p-primary-500) 22%, transparent);
  color: var(--p-primary-300);
}
.rail-btn--empty {
  opacity: 0.3;
  cursor: default;
}
.rail-btn:disabled {
  opacity: 0.25;
  cursor: default;
}
.rail-btn:disabled:hover {
  background-color: transparent;
  color: var(--p-surface-300);
}

/* Rail slide/fade when the overlay locks/unlocks. */
.rail-enter-active,
.rail-leave-active {
  transition:
    opacity 0.18s ease,
    left 0.18s ease;
}
.rail-enter-from,
.rail-leave-to {
  opacity: 0;
  left: -3rem;
}
</style>
