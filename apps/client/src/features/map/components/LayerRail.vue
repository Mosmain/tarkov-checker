<script setup lang="ts">
import { useMapLayers, type MapLayer } from '../layers/registry';
import { useOverlayLock } from '@/features/overlay/composables/useOverlayLock';
import { useLayerVisibility } from '../composables/useLayerVisibility';
import { setRailObstacle } from '../composables/useRailObstacle';
import { isTauri } from '@/shared/tauri';
import MapSection from '@/features/settings/sections/MapSection.vue';

const props = defineProps<{
  floors?: ReadonlyArray<{ id: string; label: string }>;
  currentFloor?: string | null;
}>();
const emit = defineEmits<{ (e: 'selectFloor', id: string): void }>();

const { t } = useI18n();
const mapLayers = useMapLayers();
const isDesktop = useMediaQuery('(min-width: 640px)');

// A layer's rail row can be context-gated (defaults to 'always'); the layer
// still mounts on the map regardless — this only hides the toggle row.
function available(l: MapLayer): boolean {
  const a = l.availability ?? 'always';
  if (a === 'always') return true;
  if (a === 'tauri') return isTauri;
  return isTauri || isDesktop.value;
}
const visibleLayers = computed(() => mapLayers.value.filter(available));

// Presentation metadata only — icon + order, plus the "future" categories we
// tease as dimmed placeholders. Which LAYERS fall under each comes from the
// registry's `category` field, not from here.
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
    layers: visibleLayers.value
      .filter((l) => l.category === c.key)
      .sort((a, b) => a.order - b.order),
  })),
);

// Own the visibility refs in setup scope (cached singletons; cheap thereafter).
const layerVis = useLayerVisibility;
visibleLayers.value.forEach((l) => layerVis(l.id));

// 'map' = base map selector flyout; otherwise a category key.
const openId = ref<string | null>(null);
const expanded = ref<string | null>(null);
const railRef = ref<HTMLElement | null>(null);
const flyoutRef = ref<HTMLElement | null>(null);

// Hide the rail (animated) while the overlay is click-through-locked.
const { locked, showControls } = useOverlayLock();
const railVisible = showControls;

function toggle(id: string): void {
  openId.value = openId.value === id ? null : id;
  expanded.value = null;
}

onClickOutside(flyoutRef, (e) => {
  if (railRef.value?.contains(e.target as Node)) return;
  openId.value = null;
});

watch(locked, (isLocked) => {
  if (isLocked) {
    openId.value = null;
    setRailObstacle(null); // arrows reflow to the true edge as the rail fades out
  }
});

useEventListener(window, 'blur', () => {
  openId.value = null;
});

// Publish the rail's rect (viewport coords) so edge-indicator layers can wrap
// around it without scraping the DOM. Republish whenever it appears or moves.
function publishRail(): void {
  const el = railRef.value;
  if (!el) {
    setRailObstacle(null);
    return;
  }
  const r = el.getBoundingClientRect();
  setRailObstacle({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width });
}
onMounted(publishRail);
useEventListener(window, 'resize', publishRail);
onBeforeUnmount(() => setRailObstacle(null));

const openCategory = computed(() => categories.value.find((c) => c.key === openId.value) ?? null);
const isMapOpen = computed(() => openId.value === 'map');

// Floor stepper at the rail's bottom (multi-floor maps only). Floors are ordered
// top-to-bottom (index 0 = top), so "up" steps toward index 0.
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
  <Transition name="rail" @after-enter="publishRail">
    <div
      v-if="railVisible"
      ref="railRef"
      class="layer-rail border-surface-700 bg-surface-900/85 absolute left-0 top-1/2 z-[1100] flex flex-col gap-1 rounded-r-xl border border-l-0 p-1 backdrop-blur"
    >
      <button
        v-tooltip.right="{ value: t('map'), disabled: openId !== null }"
        type="button"
        class="rail-btn"
        :class="{ 'rail-btn--active': isMapOpen }"
        :aria-label="t('map')"
        :aria-expanded="isMapOpen"
        @click="toggle('map')"
      >
        <i class="pi pi-map" aria-hidden="true" />
      </button>
      <div class="bg-surface-700 my-0.5 h-px" />
      <button
        v-for="c in categories"
        :key="c.key"
        v-tooltip.right="{ value: c.label, disabled: openId !== null }"
        type="button"
        class="rail-btn"
        :class="{ 'rail-btn--active': openId === c.key, 'rail-btn--empty': c.layers.length === 0 }"
        :disabled="c.layers.length === 0"
        :aria-label="c.label"
        :aria-expanded="openId === c.key"
        @click="toggle(c.key)"
      >
        <i class="pi" :class="c.icon" aria-hidden="true" />
      </button>

      <!-- Floor stepper (multi-floor maps): glanceable current floor + ▲/▼. -->
      <template v-if="hasFloors">
        <div class="bg-surface-700 my-0.5 h-px" />
        <button
          type="button"
          class="rail-btn"
          :disabled="!canFloorUp"
          :aria-label="t('floor') + ' +'"
          @click="stepFloor(-1)"
        >
          <i class="pi pi-chevron-up text-sm" aria-hidden="true" />
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
          <i class="pi pi-chevron-down text-sm" aria-hidden="true" />
        </button>
      </template>

      <!-- Flyout positioned relative to the rail (vertically centred), NOT
           `position: fixed` which drifted in the Tauri WebView2 overlay. No
           nested overlays inside (map = inline Listbox, sections inline). -->
      <div
        v-if="openId"
        ref="flyoutRef"
        class="layer-rail__flyout border-surface-700 bg-surface-900/95 absolute left-full top-1/2 ml-1.5 max-h-[80svh] w-60 overflow-y-auto rounded-xl border p-3 shadow-xl backdrop-blur"
      >
        <template v-if="isMapOpen">
          <p class="mb-2 text-[10px] font-semibold uppercase tracking-wider opacity-50">
            {{ t('map') }}
          </p>
          <MapSection />
        </template>
        <template v-else-if="openCategory">
          <p class="mb-2 text-[10px] font-semibold uppercase tracking-wider opacity-50">
            {{ openCategory.label }}
          </p>
          <div
            v-for="l in openCategory.layers"
            :key="l.id"
            class="border-surface-800 border-b py-1.5 last:border-0"
          >
            <div class="flex items-center gap-2">
              <ToggleSwitch
                :model-value="layerVis(l.id).value"
                :aria-label="t(l.titleKey)"
                @update:model-value="(v: boolean) => (layerVis(l.id).value = v)"
              />
              <span class="flex-1 truncate text-sm">{{ t(l.titleKey) }}</span>
              <button
                v-if="l.settingsComponent"
                type="button"
                class="hover:bg-surface-800 flex h-8 w-8 shrink-0 items-center justify-center rounded opacity-70 hover:opacity-100"
                :class="{ 'text-primary-400 bg-surface-800 !opacity-100': expanded === l.id }"
                :aria-label="`${t(l.titleKey)} – ${t('settings')}`"
                :aria-expanded="expanded === l.id"
                @click="expanded = expanded === l.id ? null : l.id"
              >
                <i class="pi pi-cog text-sm" aria-hidden="true" />
              </button>
            </div>
            <div v-if="l.settingsComponent && expanded === l.id" class="mt-2 pl-1">
              <component :is="l.settingsComponent" />
            </div>
          </div>
        </template>
      </div>
    </div>
  </Transition>

  <!-- Locked: rail hidden, but keep a read-only floor read-out so the current
       level stays glanceable while click-through is on. -->
  <div
    v-if="locked && hasFloors"
    class="sa-bottom sa-left border-surface-700 bg-surface-900/85 absolute z-[1100] flex items-center gap-1.5 rounded-md border px-2 py-1 backdrop-blur"
  >
    <i class="pi pi-clone text-[10px] opacity-50" aria-hidden="true" />
    <span class="text-xs font-semibold tabular-nums">{{ t('floor') }} {{ currentFloorLabel }}</span>
  </div>
</template>

<style scoped>
/* Vertical centring via a literal transform, NOT Tailwind's `-translate-y-1/2`.
   Tailwind v4's translate utilities rely on @property-registered `--tw-*` vars,
   which Safari < 16.4 (iOS 15) ignores — the composed `translate` declaration
   then turns invalid and centring silently breaks. A plain transform works on
   every Safari. (Paired with `top-1/2` in the template.) */
.layer-rail,
.layer-rail__flyout {
  transform: translateY(-50%);
}

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
.rail-btn:focus-visible {
  outline: 2px solid var(--p-primary-400);
  outline-offset: 2px;
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
