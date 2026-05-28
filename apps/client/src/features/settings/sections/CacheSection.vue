<script setup lang="ts">
import { useExtractsCacheControl } from "../../server/composables/useExtractsCacheControl";

const { cacheRefreshing, cacheError, cacheRelativeAge, refreshCache } =
  useExtractsCacheControl();
const { t } = useI18n();
</script>

<template>
  <Fieldset :legend="t('cache.heading')">
    <div class="flex items-center justify-between gap-2">
      <div class="text-xs opacity-70">
        {{ t("cache.lastUpdated") }}: <span class="opacity-100">{{ cacheRelativeAge }}</span>
      </div>
      <Button
        :label="cacheRefreshing ? t('cache.refreshing') : t('cache.refresh')"
        size="small"
        severity="secondary"
        outlined
        :loading="cacheRefreshing"
        :disabled="cacheRefreshing"
        @click="refreshCache"
      />
    </div>
    <Message v-if="cacheError" severity="error" size="small" :closable="false" class="mt-2">
      {{ cacheError }}
    </Message>
    <p class="mt-2 text-[10px] leading-relaxed opacity-50">{{ t("cache.hint") }}</p>
  </Fieldset>
</template>
