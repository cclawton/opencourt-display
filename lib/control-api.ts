import type { RuntimeConfig } from './runtime-config';

export type RemoteProgramme = {
  programmeId: string;
  name: string;
  shortName: string;
  day: string;
  startTime: string;
  endTime: string;
  activities: string[];
};

export type RemoteDevice = {
  schemaVersion: number;
  deviceId: string;
  revision: number;
  pollIntervalSeconds: number;
  source: { type: 'image' | 'google_slides'; url: string };
  activeSelection: { kind: string; name?: string; programmeId?: string } | null;
  override: { name: string; programmeId: string; startedAt: string } | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type RemoteAsset = {
  assetId: string;
  name: string;
  mimeType: 'image/jpeg' | 'image/png';
  byteSize: number;
  width: number;
  height: number;
  publicUrl: string;
  sha256: string;
  status: 'pending' | 'ready';
  createdAt: string;
  createdBy: string;
};

async function request<T>(config: RuntimeConfig, token: string, path: string, init: RequestInit = {}): Promise<T> {
  if (!config.apiBaseUrl) throw new Error('The control API is not configured for this site.');
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body as T;
}

export async function loadAdminState(config: RuntimeConfig, token: string) {
  const [programmeResponse, deviceResponse, assetResponse] = await Promise.all([
    request<{ programmes: RemoteProgramme[] }>(config, token, '/admin/programmes'),
    request<{ device: RemoteDevice }>(config, token, `/admin/devices/${encodeURIComponent(config.deviceId)}`),
    request<{ assets: RemoteAsset[] }>(config, token, '/admin/assets'),
  ]);
  return { programmes: programmeResponse.programmes, device: deviceResponse.device, assets: assetResponse.assets };
}

export async function issueDeviceAction(config: RuntimeConfig, token: string, action: Record<string, unknown>) {
  const response = await request<{ device: RemoteDevice }>(config, token, `/admin/devices/${encodeURIComponent(config.deviceId)}/actions`, {
    method: 'POST',
    body: JSON.stringify(action),
  });
  return response.device;
}

export async function uploadDisplayImage(
  config: RuntimeConfig,
  token: string,
  file: File,
  dimensions: { width: number; height: number },
) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  const sha256 = Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
  const checksumBase64 = btoa(String.fromCharCode(...digest));
  const created = await request<{ asset: RemoteAsset; uploadUrl: string; uploadHeaders: Record<string, string> }>(config, token, '/admin/assets/uploads', {
    method: 'POST',
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type,
      byteSize: file.size,
      width: dimensions.width,
      height: dimensions.height,
      sha256,
    }),
  });
  const uploadResponse = await fetch(created.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      ...created.uploadHeaders,
      'content-type': file.type,
      'x-amz-checksum-sha256': checksumBase64,
    },
  });
  if (!uploadResponse.ok) throw new Error(`Image upload failed (${uploadResponse.status})`);
  const completed = await request<{ asset: RemoteAsset }>(config, token, `/admin/assets/${encodeURIComponent(created.asset.assetId)}/complete`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return completed.asset;
}
