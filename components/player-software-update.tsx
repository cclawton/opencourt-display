'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { RemoteDevice } from '@/lib/control-api';
import type { RuntimeConfig } from '@/lib/runtime-config';

type Release = { release: string; title: string; architecture: string; rollbackOnly?: boolean; rollbackFrom?: string[] };
const messages = {
  downloading: 'Downloading software…', checking: 'Checking the download…',
  restarting: 'Restarting the display…', complete: 'Software update complete.',
  failed: 'Update failed. The previous working software has been kept or restored.',
};

export function PlayerSoftwareUpdate({ config, token, deviceId, displayName }: {
  config: RuntimeConfig; token: string; deviceId: string; displayName: string;
}) {
  const [device, setDevice] = useState<RemoteDevice | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    let cancelled = false;
    const request = async (path: string) => {
      const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, '')}${path}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      if (!response.ok) throw new Error('Software update information is unavailable. Please try again later.');
      return response.json();
    };
    const refresh = async () => {
      try {
        const result = await request(`/admin/devices/${encodeURIComponent(deviceId)}`);
        if (!cancelled) { setDevice(result.device); setClock(Date.now()); setError(''); }
      } catch (failure) { if (!cancelled) setError((failure as Error).message); }
    };
    void request('/admin/player-releases').then(result => {
      if (!cancelled) setReleases(result.releases);
    }).catch(failure => { if (!cancelled) setError(failure.message); });
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [config.apiBaseUrl, token, deviceId]);

  const capable = device?.capabilities?.remote_player_updates === 1;
  const command = device?.softwareUpdate;
  const report = device?.softwareReport?.request === command?.request ? device?.softwareReport : null;
  const pending = !!command && Date.parse(command.expiresAt) > clock &&
    !['complete', 'failed'].includes(report?.status ?? '');
  const previous = releases.find(release => release.rollbackOnly &&
    release.architecture === device?.diagnostics?.hardware.architecture &&
    release.rollbackFrom?.includes(device?.diagnostics?.system.playerVersion ?? ''));
  const available = releases.filter(release => !release.rollbackOnly && release.architecture === device?.diagnostics?.hardware.architecture &&
    release.release !== device?.diagnostics?.system.playerVersion);

  async function update(action: 'update' | 'rollback' = 'update') {
    const target = action === 'rollback' ? previous?.release : selected;
    const prompt = action === 'rollback' ? `Restore the previous software on ${displayName}?` : `Update software on ${displayName}?`;
    if (!device || !target || !window.confirm(`${prompt} Its picture will briefly restart. Its content and schedule will be kept.`)) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, '')}/admin/devices/${encodeURIComponent(deviceId)}/software`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ release: target, previousRequest: command?.request ?? null,
          ...(action === 'rollback' ? { action } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error((body.error ?? 'Update could not be requested.').replaceAll('_', ' '));
      setDevice({ ...device, softwareUpdate: { request: body.request, release: body.release, action,
        requestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() } });
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  return <section aria-label="Display software" className="space-y-3 rounded-xl border border-black/10 p-4">
    <h3 className="font-bold">Display software</h3>
    <p className="text-sm">Installed: {device?.diagnostics?.system.playerVersion || 'Checking…'}</p>
    {command && <output className="block text-sm">{report ? report.status === 'complete' && command.action === 'rollback' ? 'Previous software restored.' : messages[report.status] : pending ? 'Waiting for this display to connect and start the update…' : 'The update request expired. You can request it again.'}</output>}
    {device && !capable ? <p className="text-sm">This display needs a one-time installation at the club before it can receive remote software updates.</p> : capable && !available.length ? <p className="text-sm">No other software releases are available for this display.</p> : capable ? <>
      <label className="block text-sm" htmlFor="player-release">Software version</label>
      <select id="player-release" className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-sm" value={selected} onChange={event => setSelected(event.target.value)} disabled={busy || pending}>
        <option value="">Choose a version</option>
        {available.map(release => <option key={release.release} value={release.release}>{release.title || release.release}</option>)}
      </select>
      <Button disabled={!selected || busy || pending} onClick={() => void update()}>Update this display</Button>
      <p className="text-sm">Only {displayName} will update. Its picture will briefly restart.</p>
    </> : null}
    {capable && previous && <div className="space-y-2">
      <Button variant="outline" disabled={busy || pending} onClick={() => void update('rollback')}>Restore previous version</Button>
      <p className="text-sm">Use this if the new software causes a problem. Content and schedules will be kept.</p>
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
