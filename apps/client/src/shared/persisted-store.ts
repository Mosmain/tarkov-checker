import type { z } from 'zod';

/**
 * Reactive ref backed by localStorage, validated against a zod schema on read.
 *
 * Each persisted field owns its own localStorage key (convention: "tc.<area>.<name>"),
 * so adding/removing a field never breaks unrelated state — there is no monolithic
 * blob to version. Corrupt or schema-incompatible data falls back to `defaultValue`
 * silently; the bad entry is left in place so a future schema can re-validate it
 * (e.g. after a rollback). If you need to force a reset, change the key.
 */
export function persistedRef<T extends z.ZodTypeAny>(
  key: string,
  schema: T,
  defaultValue: z.infer<T>,
): Ref<z.infer<T>> {
  let initial = defaultValue;
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      try {
        const parsed = schema.safeParse(JSON.parse(raw));
        if (parsed.success) initial = parsed.data as z.infer<T>;
      } catch {
        // Malformed JSON — fall through to default.
      }
    }
  }
  const r = ref<z.infer<T>>(initial) as Ref<z.infer<T>>;
  watch(
    r,
    (value) => {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, JSON.stringify(value));
    },
    { deep: true },
  );
  return r;
}
