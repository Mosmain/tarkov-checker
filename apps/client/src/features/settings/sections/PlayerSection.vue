<script setup lang="ts">
import { useMapSettingsStore } from "../../map/store";
import { useUiText } from "../../i18n";

const { playerFollow } = storeToRefs(useMapSettingsStore());
const t = useUiText();

const playerFollowOptions = computed(() => [
  { label: t.value.playerFollowOptions.off, value: "off" as const },
  { label: t.value.playerFollowOptions.sm, value: "sm" as const },
  { label: t.value.playerFollowOptions.md, value: "md" as const },
  { label: t.value.playerFollowOptions.lg, value: "lg" as const },
]);
</script>

<template>
  <Fieldset :legend="t.player">
    <p class="mb-1.5 text-xs opacity-60">{{ t.playerFollow }}</p>
    <SelectButton
      v-model="playerFollow"
      :options="playerFollowOptions"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      size="small"
      class="w-full"
    />
    <p class="mt-1.5 text-[10px] leading-relaxed opacity-50">{{ t.playerFollowHint }}</p>
  </Fieldset>
</template>
