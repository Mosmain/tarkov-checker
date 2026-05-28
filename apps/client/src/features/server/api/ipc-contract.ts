import type { ServerConfigResponse, ServerConfigUpdate } from "@shared/config-api";
import type { ExtractsCacheResponse } from "@shared/tarkov-api";

/**
 * The full set of Tauri IPC commands the Rust side exposes (see
 * `apps/desktop/src-tauri/src/commands.rs`). Adding a new command means
 * adding one entry here — `callBackend` then enforces correct args and
 * return type at every call site.
 *
 * Args of `undefined` mean the command takes no payload. The runtime call
 * passes nothing for `args`, but TS still requires the key to be declared
 * for the inferred-key narrowing to work.
 */
export interface IpcContract {
  get_config: {
    args: undefined;
    result: ServerConfigResponse;
  };
  update_config: {
    args: { patch: ServerConfigUpdate };
    result: ServerConfigResponse;
  };
  get_extracts: {
    args: { lang: string; refresh?: boolean };
    result: ExtractsCacheResponse;
  };
}

export type IpcCommand = keyof IpcContract;
