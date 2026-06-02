<script setup lang="ts">
interface Floor {
  readonly id: string;
  readonly label: string;
}

const props = defineProps<{
  floors: ReadonlyArray<Floor>;
  current: string | null;
}>();

const { t } = useI18n();

// Touch devices (phone) need bigger tap targets than the small mouse buttons.
const coarse = useMediaQuery('(pointer: coarse)');

const emit = defineEmits<{
  (e: 'select', id: string): void;
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const currentLabel = computed(() => {
  const match = props.floors.find((f) => f.id === props.current);
  return match?.label ?? props.floors[0]?.label ?? '';
});

function toggle(): void {
  open.value = !open.value;
}
function select(id: string): void {
  emit('select', id);
  open.value = false;
}
function onDocumentClick(event: MouseEvent): void {
  if (!open.value) return;
  if (root.value && !root.value.contains(event.target as Node)) {
    open.value = false;
  }
}
function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) open.value = false;
}
onMounted(() => {
  document.addEventListener('mousedown', onDocumentClick);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentClick);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div ref="root" class="relative">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="open"
        class="absolute bottom-12 left-0 flex flex-col"
        :class="coarse ? 'gap-2' : 'gap-1.5'"
        role="listbox"
        aria-orientation="vertical"
        :aria-label="t('floor')"
      >
        <Button
          v-for="floor in floors"
          :key="floor.id"
          rounded
          :size="coarse ? undefined : 'small'"
          :class="coarse ? 'min-h-[44px] min-w-[44px]' : ''"
          :severity="floor.id === current ? 'primary' : 'secondary'"
          :label="floor.label"
          role="option"
          :aria-selected="floor.id === current"
          :aria-label="'Floor ' + floor.label"
          @click="select(floor.id)"
        />
      </div>
    </Transition>

    <Button
      :size="coarse ? undefined : 'small'"
      severity="secondary"
      class="!bg-surface-800/80 hover:!bg-surface-800 !border-surface-700 backdrop-blur"
      :class="coarse ? 'min-h-[44px]' : ''"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-label="t('floor')"
      @click="toggle"
    >
      {{ t('floor') }}: {{ currentLabel }}
    </Button>
  </div>
</template>
