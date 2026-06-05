<script setup lang="ts">
import {
  captureHotkey,
  formatHotkeyParts,
  HOTKEY_SUSPEND_EVENT,
  HOTKEY_RESUME_EVENT,
} from '../lib/hotkey';

const props = defineProps<{
  /** Current accelerator string (e.g. "CommandOrControl+Alt+L"). */
  modelValue: string;
  /** Human label for the action this hotkey performs. */
  label: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const { t } = useI18n();

const recording = ref(false);
const error = ref<'invalid' | 'altgr' | null>(null);

const displayParts = computed(() => formatHotkeyParts(props.modelValue));

// Module-level guard so only one recorder is active across all instances —
// if a recorder is already listening, starting another one stops the first.
// Without this, every recorder's window-keydown handler would fire on the
// same keystroke and write the same combo to multiple settings.
function startRecording(): void {
  if (recording.value) return;
  currentRecorder?.cancel();
  currentRecorder = { cancel: stopRecording };
  recording.value = true;
  error.value = null;
  // Drop all OS bindings so the captured combo reaches us instead of firing.
  window.dispatchEvent(new Event(HOTKEY_SUSPEND_EVENT));
  window.addEventListener('keydown', onKey, { capture: true });
}

function stopRecording(): void {
  if (!recording.value) return;
  recording.value = false;
  window.removeEventListener('keydown', onKey, { capture: true });
  // Re-claim every binding (also re-applies an unchanged re-record).
  window.dispatchEvent(new Event(HOTKEY_RESUME_EVENT));
  if (currentRecorder?.cancel === stopRecording) currentRecorder = null;
}

function onKey(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
  const result = captureHotkey(event);
  if (result.cancelled) {
    error.value = null;
    stopRecording();
    return;
  }
  if (result.error === 'altgr') {
    error.value = 'altgr';
    return;
  }
  if (result.error === 'no-modifier' || result.error === 'bad-main-key') {
    error.value = 'invalid';
    return;
  }
  if (result.combo) {
    emit('update:modelValue', result.combo);
    error.value = null;
    // stopRecording() resumes registration, re-claiming the combo even when the
    // value is unchanged (a same-value write never trips the registration watch).
    stopRecording();
  }
}

onBeforeUnmount(() => stopRecording());
</script>

<script lang="ts">
// Shared across all HotkeyRecorder instances in the app.
let currentRecorder: { cancel: () => void } | null = null;
</script>

<template>
  <div>
    <p class="mb-1 text-xs opacity-60">{{ label }}</p>
    <!-- Combo chip + Change button on ONE line so the button is unambiguously
         bound to the binding it edits (label sits on its own line above). -->
    <div class="flex items-center justify-between gap-2">
      <div
        class="flex min-w-0 items-center gap-1 overflow-hidden rounded-md bg-surface-900/60 px-2 py-1.5 text-[11px] font-semibold tracking-wider"
        :class="recording ? 'ring-2 ring-primary' : ''"
      >
        <template v-if="recording">
          <span class="truncate opacity-70">{{ t('hotkeys.recordingPrompt') }}</span>
        </template>
        <template v-else>
          <span v-for="(part, idx) in displayParts" :key="idx" class="inline-flex items-center">
            <span class="rounded border border-surface-600 bg-surface-900 px-1.5 py-0.5 font-mono">
              {{ part }}
            </span>
            <span v-if="idx < displayParts.length - 1" class="px-1 opacity-60">+</span>
          </span>
        </template>
      </div>
      <Button
        :label="recording ? t('hotkeys.recording') : t('hotkeys.record')"
        size="small"
        severity="secondary"
        :outlined="!recording"
        :disabled="recording"
        class="shrink-0"
        @click="startRecording"
      />
    </div>
    <p v-if="error" class="mt-1.5 text-[10px] leading-relaxed text-amber-400">
      {{ t(error === 'altgr' ? 'hotkeys.altgr' : 'hotkeys.invalid') }}
    </p>
  </div>
</template>
