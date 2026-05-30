import {
  serverConfigResponseSchema,
  type ServerConfigResponse,
  type ServerConfigUpdate,
} from '@shared/config-api';
import { callBackend } from './transport';

const parseConfig = (d: unknown): ServerConfigResponse => serverConfigResponseSchema.parse(d);

export function fetchServerConfig(): Promise<ServerConfigResponse> {
  return callBackend({
    tauri: { cmd: 'get_config' },
    http: { method: 'GET', path: '/api/config' },
    parse: parseConfig,
  });
}

export function putServerConfig(patch: ServerConfigUpdate): Promise<ServerConfigResponse> {
  return callBackend({
    tauri: { cmd: 'update_config', args: { patch } },
    http: { method: 'PUT', path: '/api/config', body: patch },
    parse: parseConfig,
  });
}
