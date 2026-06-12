<script setup lang="ts">
import { useI18nStore } from '@/features/i18n/store';

const { apiLang } = storeToRefs(useI18nStore());
const { t } = useI18n();

const langOptions = computed(() => [
  { label: 'EN', value: 'en' as const },
  { label: 'RU', value: 'ru' as const },
]);
</script>

<template>
  <SelectButton
    v-model="apiLang"
    :options="langOptions"
    option-label="label"
    option-value="value"
    :allow-empty="false"
    :aria-label="t('language')"
    fluid
  />
</template>
