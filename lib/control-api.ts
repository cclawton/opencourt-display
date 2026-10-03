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
  activeSelection: {
    kind: string;
    name?: string;
    programmeId?: string;
    contentId?: string;
    contentType?: 'slideshow' | 'image';
  } | null;
  override: { name: string; programmeId: string; startedAt: string } | null;
  updatedAt: string | null;
  updatedBy: string | null;
  lastConnectedAt: string | null;
  diagnostics: {
    hardware: {
      model: string;
      architecture: string;
      cpuCount: number;
      memoryMiB: number;
      storageTotalGiB: number;
      storageFreeGiB: number;
    };
    system: {
      hostname: string;
      operatingSystem: string;
      kernel: string;
      uptimeSeconds: number;
      playerVersion: string;
    };
    network: { primaryIp: string };
    revision: number | null;
  } | null;
  mode?: 'manual' | 'schedule';
  schedule?: {
    timezone: 'Australia/Melbourne';
    fallback: {
      contentId: string;
      name: string;
      source: RemoteDevice['source'];
    };
    entries: {
      day: string;
      startTime: string;
      endTime: string;
      contentId: string;
      name: string;
      source: RemoteDevice['source'];
    }[];
  } | null;
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

export type RemoteContent = {
  contentId: string;
  title: string;
  type: 'slideshow' | 'image';
  provider: string;
  status: 'pending' | 'ready';
  source: { type: 'image' | 'google_slides'; url: string } | null;
  mimeType: 'image/jpeg' | 'image/png' | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ControlActor = {
  name: string;
  email: string;
  role: 'admin' | 'convenor';
};

export type Convenor = {
  username: string;
  name: string;
  phoneNumber?: string;
  enabled?: boolean;
};

async function request<T>(
  config: RuntimeConfig,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!config.apiBaseUrl)
    throw new Error('The control API is not configured for this site.');
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (init.body) headers.set('content-type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });
  } catch {
    throw new Error(
      'The control service could not be reached. Reload this page and try again.',
    );
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error ?? `Request failed (${response.status})`);
  return body as T;
}

export async function createControlRoomSession(
  config: RuntimeConfig,
  googleCredential: string,
) {
  return request<{ token: string; expiresAt: string }>(
    config,
    googleCredential,
    '/auth/session',
    { method: 'POST' },
  );
}

export async function deleteControlRoomSession(
  config: RuntimeConfig,
  token: string,
) {
  await request<{ deleted: boolean }>(config, token, '/auth/session', {
    method: 'DELETE',
  });
}

export async function loadAdminState(config: RuntimeConfig, token: string) {
  const [programmeResponse, deviceResponse, assetResponse] = await Promise.all([
    request<{ programmes: RemoteProgramme[] }>(
      config,
      token,
      '/admin/programmes',
    ),
    request<{ device: RemoteDevice }>(
      config,
      token,
      `/admin/devices/${encodeURIComponent(config.deviceId)}`,
    ),
    request<{ assets: RemoteAsset[] }>(config, token, '/admin/assets'),
  ]);
  return {
    programmes: programmeResponse.programmes,
    device: deviceResponse.device,
    assets: assetResponse.assets,
  };
}

export async function loadControlRoomState(
  config: RuntimeConfig,
  token: string,
) {
  const [contentResponse, deviceResponses, actorResponse] = await Promise.all([
    request<{ content: RemoteContent[] }>(config, token, '/admin/content'),
    Promise.all(
      config.devices.map(({ deviceId }) =>
        request<{ device: RemoteDevice }>(
          config,
          token,
          `/admin/devices/${encodeURIComponent(deviceId)}`,
        ),
      ),
    ),
    request<{ actor: ControlActor }>(config, token, '/auth/me'),
  ]);
  return {
    content: contentResponse.content,
    device: deviceResponses[0].device,
    devices: deviceResponses.map((response) => response.device),
    actor: actorResponse.actor,
  };
}

export async function listPublicConvenors(config: RuntimeConfig) {
  const response = await fetch(`${config.apiBaseUrl}/auth/convenors`);
  if (!response.ok) throw new Error('Unable to load competition convenors.');
  return ((await response.json()) as { convenors: Convenor[] }).convenors;
}

export async function listConvenors(config: RuntimeConfig, token: string) {
  return (
    await request<{ convenors: Convenor[] }>(config, token, '/admin/convenors')
  ).convenors;
}

export async function createConvenor(
  config: RuntimeConfig,
  token: string,
  value: { name: string; phoneNumber: string },
) {
  return (
    await request<{ convenor: Convenor }>(config, token, '/admin/convenors', {
      method: 'POST',
      body: JSON.stringify(value),
    })
  ).convenor;
}

export async function deleteConvenor(
  config: RuntimeConfig,
  token: string,
  username: string,
) {
  await request<{ deleted: boolean }>(
    config,
    token,
    `/admin/convenors/${encodeURIComponent(username)}`,
    { method: 'DELETE' },
  );
}

export async function issueDeviceAction(
  config: RuntimeConfig,
  token: string,
  deviceId: string,
  action: Record<string, unknown>,
) {
  const response = await request<{ device: RemoteDevice }>(
    config,
    token,
    `/admin/devices/${encodeURIComponent(deviceId)}/actions`,
    {
      method: 'POST',
      body: JSON.stringify(action),
    },
  );
  return response.device;
}

export async function updateDeviceSchedule(
  config: RuntimeConfig,
  token: string,
  deviceId: string,
  schedule: {
    fallbackContentId: string;
    entries: {
      day: string;
      startTime: string;
      endTime: string;
      contentId: string;
    }[];
  },
) {
  const response = await request<{ device: RemoteDevice }>(
    config,
    token,
    `/admin/devices/${encodeURIComponent(deviceId)}/schedule`,
    {
      method: 'PUT',
      body: JSON.stringify(schedule),
    },
  );
  return response.device;
}

export async function uploadDisplayImage(
  config: RuntimeConfig,
  token: string,
  file: File,
  dimensions: { width: number; height: number },
) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
  );
  const sha256 = Array.from(digest, (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  const created = await request<{
    asset: RemoteAsset;
    uploadUrl: string;
    uploadHeaders: Record<string, string>;
  }>(config, token, '/admin/assets/uploads', {
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
    },
  });
  if (!uploadResponse.ok)
    throw new Error(`Image upload failed (${uploadResponse.status})`);
  const completed = await request<{ asset: RemoteAsset }>(
    config,
    token,
    `/admin/assets/${encodeURIComponent(created.asset.assetId)}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
  return completed.asset;
}

export async function createSlideshowContent(
  config: RuntimeConfig,
  token: string,
  title: string,
  url: string,
) {
  const response = await request<{ content: RemoteContent }>(
    config,
    token,
    '/admin/content',
    {
      method: 'POST',
      body: JSON.stringify({ type: 'slideshow', title, url }),
    },
  );
  return response.content;
}

export async function updateContent(
  config: RuntimeConfig,
  token: string,
  contentId: string,
  values: { title: string; url?: string },
) {
  const response = await request<{ content: RemoteContent }>(
    config,
    token,
    `/admin/content/${encodeURIComponent(contentId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(values),
    },
  );
  return response.content;
}

export async function deleteContent(
  config: RuntimeConfig,
  token: string,
  contentId: string,
) {
  await request<{ deleted: true }>(
    config,
    token,
    `/admin/content/${encodeURIComponent(contentId)}`,
    { method: 'DELETE' },
  );
}

export async function uploadContentImage(
  config: RuntimeConfig,
  token: string,
  title: string,
  file: File,
  dimensions: { width: number; height: number },
  contentId?: string,
) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
  );
  const sha256 = Array.from(digest, (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  const created = await request<{
    content: RemoteContent;
    uploadUrl: string;
    uploadHeaders: Record<string, string>;
  }>(config, token, '/admin/content/images/uploads', {
    method: 'POST',
    body: JSON.stringify({
      contentId,
      title,
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
    },
  });
  if (!uploadResponse.ok)
    throw new Error(`Image upload failed (${uploadResponse.status})`);
  const completed = await request<{ content: RemoteContent }>(
    config,
    token,
    `/admin/content/${encodeURIComponent(created.content.contentId)}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
  return completed.content;
}
