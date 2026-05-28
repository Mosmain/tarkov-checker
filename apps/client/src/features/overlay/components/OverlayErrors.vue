<script setup lang="ts">
interface Props {
  mapError: string | null;
  extractsError: string | null;
}

defineProps<Props>();
</script>

<template>
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
</template>
