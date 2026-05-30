<script setup lang="ts">
interface Props {
  mapError: string | null;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'dismissMap'): void;
  (e: 'retry'): void;
}>();
</script>

<template>
  <div
    v-if="mapError"
    class="pointer-events-none absolute top-14 inset-x-3 z-[1000] flex flex-col items-center gap-1"
  >
    <Message
      severity="error"
      size="small"
      closable
      class="pointer-events-auto"
      @close="emit('dismissMap')"
    >
      <div class="flex items-center gap-2">
        <span>Map load error: {{ mapError }}</span>
        <Button size="small" severity="contrast" text @click="emit('retry')">Retry</Button>
      </div>
    </Message>
  </div>
</template>
