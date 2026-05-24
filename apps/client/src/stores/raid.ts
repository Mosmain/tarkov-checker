import { defineStore } from "pinia";
import { ref } from "vue";
import { mapDisplayName, type TarkovMapCode } from "@shared/maps";

export const useRaidStore = defineStore("raid", () => {
  const currentMapCode = ref<TarkovMapCode | null>(null);
  const inRaid = ref(false);

  function setMap(code: TarkovMapCode): void {
    currentMapCode.value = code;
  }

  function clearMap(): void {
    currentMapCode.value = null;
    inRaid.value = false;
  }

  function displayName(): string {
    return currentMapCode.value ? mapDisplayName(currentMapCode.value) : "No raid";
  }

  return { currentMapCode, inRaid, setMap, clearMap, displayName };
});
