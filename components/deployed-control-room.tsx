'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ImageIcon,
  Info,
  Monitor,
  Pencil,
  Presentation,
  RefreshCw,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';

import { GoogleSignIn, signOutGoogle } from '@/components/google-sign-in';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createSlideshowContent,
  createControlRoomSession,
  createConvenor,
  deleteContent,
  deleteConvenor,
  deleteControlRoomSession,
  issueDeviceAction,
  loadControlRoomState,
  listConvenors,
  listPublicConvenors,
  updateContent,
  updateDeviceSchedule,
  uploadContentImage,
  type RemoteContent,
  type RemoteDevice,
  type ControlActor,
  type Convenor,
} from '@/lib/control-api';
import {
  clearConvenorSignIn,
  confirmConvenorCode,
  requestConvenorCode,
} from '@/lib/convenor-auth';
import type { RuntimeConfig } from '@/lib/runtime-config';

type Section = 'displays' | 'content' | 'schedule' | 'users';
type Editor = {
  mode: 'create-slideshow' | 'create-image' | 'edit';
  contentId?: string;
} | null;
type ScheduleEntry = {
  day: string;
  startTime: string;
  endTime: string;
  contentId: string;
};
const weekdays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const SESSION_STORAGE_KEY = 'opencourt-control-session';

function scheduledContentId(device: RemoteDevice | null) {
  if (device?.mode !== 'schedule' || !device.schedule) return undefined;
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: device.schedule.timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const day = value('weekday');
  const time = `${value('hour')}:${value('minute')}`;
  return (
    device.schedule.entries.find(
      (entry) =>
        entry.day === day && entry.startTime <= time && time < entry.endTime,
    )?.contentId ?? device.schedule.fallback.contentId
  );
}

function friendlyError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : 'Something went wrong. Please try again.';
  const messages: Record<string, string> = {
    content_is_currently_on_a_display:
      'Choose different content for the TV before deleting this item.',
    invalid_google_slides_url:
      'Paste a valid Google Slides sharing or published URL.',
    invalid_content_title: 'Enter a title between 2 and 100 characters.',
    invalid_email_address: 'Enter a valid email address.',
    uploaded_image_does_not_match:
      'The uploaded image could not be verified. Please choose it again.',
    display_changed_retry:
      'Someone else changed the TV at the same time. Please try again.',
  };
  return messages[message] ?? message.replaceAll('_', ' ');
}

function isExpiredSession(error: unknown) {
  return error instanceof Error && error.message === 'session_expired';
}

function imageDimensions(file: File) {
  return createImageBitmap(file).then((bitmap) => {
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  });
}

export function DeployedControlRoom({ config }: { config: RuntimeConfig }) {
  const [token, setToken] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : window.localStorage.getItem(SESSION_STORAGE_KEY),
  );
  const [section, setSection] = useState<Section>('displays');
  const [content, setContent] = useState<RemoteContent[]>([]);
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [device, setDevice] = useState<RemoteDevice | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Editor>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [scheduleFallbackId, setScheduleFallbackId] = useState('');
  const [actor, setActor] = useState<ControlActor | null>(null);
  const [convenors, setConvenors] = useState<Convenor[]>([]);
  const [selectedConvenor, setSelectedConvenor] = useState('');
  const [convenorDelivery, setConvenorDelivery] = useState<'sms' | 'email'>(
    'sms',
  );
  const [codeRequested, setCodeRequested] = useState(false);
  const [oneTimeCode, setOneTimeCode] = useState('');
  const [convenorName, setConvenorName] = useState('');
  const [convenorPhone, setConvenorPhone] = useState('');
  const [convenorEmail, setConvenorEmail] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const load = useCallback(
    async (credential: string) => {
      setError('');
      try {
        const state = await loadControlRoomState(config, credential);
        const loadedDevice =
          state.devices.find((item) => item.deviceId === device?.deviceId) ??
          state.device;
        setContent(state.content);
        setDevices(state.devices);
        setDevice(
          (current) =>
            state.devices.find((item) => item.deviceId === current?.deviceId) ??
            loadedDevice,
        );
        setActor(state.actor);
        if (state.actor.role === 'admin')
          setConvenors(await listConvenors(config, credential));
        else setSection('displays');
        setScheduleEntries(
          loadedDevice.schedule?.entries.map(
            ({ day, startTime, endTime, contentId }) => ({
              day,
              startTime,
              endTime,
              contentId,
            }),
          ) ?? [],
        );
        setScheduleFallbackId(
          loadedDevice.schedule?.fallback.contentId ??
            state.content.find((item) => item.title === 'Honours Board')
              ?.contentId ??
            '',
        );
        setSelectedId(
          loadedDevice.mode === 'schedule'
            ? '__schedule__'
            : loadedDevice.activeSelection?.contentId ||
                state.content.find(
                  (item) => item.source?.url === loadedDevice.source.url,
                )?.contentId ||
                state.content[0]?.contentId ||
                '',
        );
      } catch (loadError) {
        setError(friendlyError(loadError));
        throw loadError;
      }
    },
    [config, device?.deviceId],
  );

  useEffect(() => {
    if (token) return;
    void listPublicConvenors(config)
      .then((items) => {
        setConvenors(items);
        setSelectedConvenor((current) => current || items[0]?.username || '');
        if (items[0]?.deliveryMethods?.includes('email'))
          setConvenorDelivery('email');
      })
      .catch(() => undefined);
  }, [config, token]);

  useEffect(() => {
    if (!token) return;
    const timeout = window.setTimeout(
      () =>
        void load(token).catch((loadError) => {
          if (!isExpiredSession(loadError)) return;
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          setToken(null);
        }),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, [load, token]);

  useEffect(() => {
    if (!token) return;
    const interval = window.setInterval(() => {
      void load(token).catch((loadError) => {
        if (!isExpiredSession(loadError)) return;
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        setToken(null);
      });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [load, token]);

  useEffect(() => {
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  const currentContent = useMemo(
    () =>
      content.find((item) => item.contentId === scheduledContentId(device)) ??
      content.find(
        (item) => item.contentId === device?.activeSelection?.contentId,
      ) ??
      content.find((item) => item.source?.url === device?.source.url),
    [content, device],
  );
  const slideshows = content.filter((item) => item.type === 'slideshow');
  const images = content.filter((item) => item.type === 'image');
  const selectedConvenorAccount = convenors.find(
    (item) => item.username === selectedConvenor,
  );

  function deviceName(item: RemoteDevice) {
    return (
      config.devices.find((configured) => configured.deviceId === item.deviceId)
        ?.name ?? item.deviceId
    );
  }

  function contentShownBy(item: RemoteContent) {
    return devices
      .filter((display) => {
        const selected =
          display.mode === 'schedule'
            ? scheduledContentId(display)
            : (display.activeSelection?.contentId ??
              content.find(
                (candidate) => candidate.source?.url === display.source.url,
              )?.contentId);
        return selected === item.contentId;
      })
      .map(deviceName);
  }

  function selectDevice(next: RemoteDevice) {
    setDevice(next);
    setShowDiagnostics(false);
    setScheduleEntries(
      next.schedule?.entries.map(({ day, startTime, endTime, contentId }) => ({
        day,
        startTime,
        endTime,
        contentId,
      })) ?? [],
    );
    setScheduleFallbackId(next.schedule?.fallback.contentId ?? '');
    setSelectedId(
      next.mode === 'schedule'
        ? '__schedule__'
        : next.activeSelection?.contentId ||
            content.find((item) => item.source?.url === next.source.url)
              ?.contentId ||
            '',
    );
  }

  function updateScheduleEntry(index: number, update: Partial<ScheduleEntry>) {
    setScheduleEntries((entries) =>
      entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...update } : entry,
      ),
    );
  }

  const run = useCallback(
    async (operation: () => Promise<void>, success: string) => {
      setBusy(true);
      setMessage('');
      setError('');
      try {
        await operation();
        setMessage(success);
        if (token) await load(token);
      } catch (operationError) {
        setError(friendlyError(operationError));
      } finally {
        setBusy(false);
      }
    },
    [load, token],
  );

  function closeEditor() {
    setEditor(null);
    setTitle('');
    setUrl('');
    setFile(null);
  }

  function startEdit(item: RemoteContent) {
    setEditor({ mode: 'edit', contentId: item.contentId });
    setTitle(item.title);
    setUrl(item.type === 'slideshow' ? (item.source?.url ?? '') : '');
    setFile(null);
  }

  async function saveEditor() {
    if (!token || !editor) return;
    if (editor.mode === 'create-slideshow') {
      await run(async () => {
        await createSlideshowContent(config, token, title, url);
        closeEditor();
      }, 'Slideshow added.');
      return;
    }
    if (editor.mode === 'create-image') {
      if (!file) {
        setError('Choose a JPEG or PNG image.');
        return;
      }
      await run(async () => {
        const dimensions = await imageDimensions(file);
        await uploadContentImage(
          config,
          token,
          title || file.name,
          file,
          dimensions,
        );
        closeEditor();
      }, 'Image added.');
      return;
    }
    const item = content.find(
      (candidate) => candidate.contentId === editor.contentId,
    );
    if (!item) return;
    await run(async () => {
      await updateContent(config, token, item.contentId, {
        title,
        ...(item.type === 'slideshow' ? { url } : {}),
      });
      closeEditor();
    }, 'Content updated.');
  }

  async function replaceImage(item: RemoteContent, replacement: File) {
    if (!token) return;
    if (
      !['image/jpeg', 'image/png'].includes(replacement.type) ||
      replacement.size > 20 * 1024 * 1024
    ) {
      setError('Choose a JPEG or PNG no larger than 20 MB.');
      return;
    }
    await run(async () => {
      const dimensions = await imageDimensions(replacement);
      await uploadContentImage(
        config,
        token,
        item.title,
        replacement,
        dimensions,
        item.contentId,
      );
    }, `${item.title} replaced.`);
  }

  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center bg-court-ink px-4 text-court-ink">
        <Card className="w-full max-w-md border-0 bg-white ring-0">
          <CardHeader>
            <div className="mb-3 grid size-11 place-items-center rounded-full bg-tennis font-black">
              OC
            </div>
            <CardTitle className="font-display text-2xl">OpenCourt</CardTitle>
            <CardDescription>
              Sign in with the club Google account to control the TVs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GoogleSignIn
              clientId={config.googleClientId}
              onCredential={async (credential) => {
                try {
                  const session = await createControlRoomSession(
                    config,
                    credential,
                  );
                  window.localStorage.setItem(
                    SESSION_STORAGE_KEY,
                    session.token,
                  );
                  setToken(session.token);
                  await load(session.token);
                } catch (signInError) {
                  setError(friendlyError(signInError));
                }
              }}
            />
            {convenors.length > 0 && (
              <div className="space-y-3 border-t border-black/10 pt-4">
                <p className="text-sm font-bold">Competition convenor</p>
                <Label htmlFor="convenor-name">Your name</Label>
                <select
                  className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-sm"
                  disabled={codeRequested || busy}
                  id="convenor-name"
                  onChange={(event) => {
                    const username = event.target.value;
                    const account = convenors.find(
                      (item) => item.username === username,
                    );
                    setSelectedConvenor(username);
                    setConvenorDelivery(
                      account?.deliveryMethods?.includes('email')
                        ? 'email'
                        : 'sms',
                    );
                  }}
                  value={selectedConvenor}
                >
                  {convenors.map((item) => (
                    <option key={item.username} value={item.username}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {codeRequested ? (
                  <>
                    <Label htmlFor="one-time-code">
                      Code sent by{' '}
                      {convenorDelivery === 'email' ? 'email' : 'SMS'}
                    </Label>
                    <Input
                      autoComplete="one-time-code"
                      id="one-time-code"
                      inputMode="numeric"
                      onChange={(event) => setOneTimeCode(event.target.value)}
                      value={oneTimeCode}
                    />
                    <Button
                      className="w-full bg-club-green text-white hover:bg-club-green/90"
                      disabled={busy || oneTimeCode.trim().length < 6}
                      onClick={() =>
                        void run(async () => {
                          const identityToken = await confirmConvenorCode(
                            config,
                            oneTimeCode,
                          );
                          const session = await createControlRoomSession(
                            config,
                            identityToken,
                          );
                          window.localStorage.setItem(
                            SESSION_STORAGE_KEY,
                            session.token,
                          );
                          setToken(session.token);
                          await clearConvenorSignIn();
                        }, 'Signed in.')
                      }
                    >
                      Sign in
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3">
                    {(selectedConvenorAccount?.deliveryMethods?.length ?? 0) >
                      1 && (
                      <div className="space-y-2">
                        <Label htmlFor="convenor-delivery">Send code by</Label>
                        <select
                          className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-sm"
                          id="convenor-delivery"
                          onChange={(event) =>
                            setConvenorDelivery(
                              event.target.value as 'sms' | 'email',
                            )
                          }
                          value={convenorDelivery}
                        >
                          {selectedConvenorAccount?.deliveryMethods?.includes(
                            'email',
                          ) && <option value="email">Email</option>}
                          {selectedConvenorAccount?.deliveryMethods?.includes(
                            'sms',
                          ) && <option value="sms">SMS</option>}
                        </select>
                      </div>
                    )}
                    <Button
                      className="w-full bg-club-green text-white hover:bg-club-green/90"
                      disabled={busy || !selectedConvenor}
                      onClick={() =>
                        void run(
                          async () => {
                            await requestConvenorCode(
                              config,
                              selectedConvenor,
                              convenorDelivery,
                            );
                            setCodeRequested(true);
                          },
                          `Code sent by ${convenorDelivery === 'email' ? 'email' : 'SMS'}.`,
                        )
                      }
                    >
                      Send me a code
                    </Button>
                  </div>
                )}
              </div>
            )}
            {error && <p className="text-sm text-red-700">{error}</p>}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-100 text-court-ink">
      <header className="border-b border-black/10 bg-court-ink text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-tennis text-sm font-black text-court-ink">
              OC
            </div>
            <div>
              <p className="font-display font-bold">OpenCourt</p>
              <p className="text-xs text-white/55">Heatherdale Tennis Club</p>
            </div>
          </div>
          <Button
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
            onClick={() => {
              signOutGoogle();
              void deleteControlRoomSession(config, token).catch(
                () => undefined,
              );
              window.localStorage.removeItem(SESSION_STORAGE_KEY);
              setToken(null);
              setContent([]);
              setDevice(null);
              setActor(null);
              setCodeRequested(false);
              setOneTimeCode('');
            }}
            variant="outline"
          >
            Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-9">
        <nav
          aria-label="Control room sections"
          className="mb-6 inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5"
        >
          <button
            className={`rounded-lg px-5 py-2 text-sm font-bold ${section === 'displays' ? 'bg-club-green text-white' : 'text-court-ink/60 hover:text-court-ink'}`}
            onClick={() => setSection('displays')}
          >
            Displays
          </button>
          {actor?.role === 'admin' && (
            <button
              className={`rounded-lg px-5 py-2 text-sm font-bold ${section === 'content' ? 'bg-club-green text-white' : 'text-court-ink/60 hover:text-court-ink'}`}
              onClick={() => setSection('content')}
            >
              Content
            </button>
          )}
          {actor?.role === 'admin' && (
            <button
              className={`rounded-lg px-5 py-2 text-sm font-bold ${section === 'users' ? 'bg-club-green text-white' : 'text-court-ink/60 hover:text-court-ink'}`}
              onClick={() => setSection('users')}
            >
              Users
            </button>
          )}
          {actor?.role === 'admin' && (
            <button
              className={`rounded-lg px-5 py-2 text-sm font-bold ${section === 'schedule' ? 'bg-club-green text-white' : 'text-court-ink/60 hover:text-court-ink'}`}
              onClick={() => setSection('schedule')}
            >
              Schedule
            </button>
          )}
        </nav>

        {(message || error) && (
          <output
            className={`mb-5 block rounded-xl px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'}`}
          >
            {error || message}
          </output>
        )}

        {section === 'displays' ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {devices.map((item) => {
                const name =
                  config.devices.find(
                    (configured) => configured.deviceId === item.deviceId,
                  )?.name ?? item.deviceId;
                return (
                  <button
                    className={`rounded-xl bg-white p-4 text-left ring-2 transition ${device?.deviceId === item.deviceId ? 'ring-club-green' : 'ring-transparent hover:ring-club-green/25'}`}
                    key={item.deviceId}
                    onClick={() => selectDevice(item)}
                    type="button"
                  >
                    <span className="flex items-center gap-2 font-bold">
                      <Monitor className="size-5 text-club-green" /> {name}
                    </span>
                    <span className="mt-1 block text-sm text-court-ink/55">
                      {item.lastConnectedAt
                        ? `Last connected ${new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.lastConnectedAt))}`
                        : 'No heartbeat received yet'}
                    </span>
                  </button>
                );
              })}
            </div>
            <Card className="border-0 bg-white ring-0">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Monitor className="text-club-green" />{' '}
                    {config.devices.find(
                      (item) => item.deviceId === device?.deviceId,
                    )?.name ?? device?.deviceId}
                  </CardTitle>
                  <Button
                    aria-label={`${config.devices.find((item) => item.deviceId === device?.deviceId)?.name ?? device?.deviceId} information`}
                    onClick={() => setShowDiagnostics((visible) => !visible)}
                    size="icon"
                    variant="outline"
                  >
                    <Info />
                  </Button>
                </div>
                <CardDescription>
                  Currently showing:{' '}
                  <strong className="text-court-ink">
                    {currentContent?.title ??
                      device?.activeSelection?.name ??
                      'Unknown'}
                    {device?.mode === 'schedule' && ' (Schedule)'}
                  </strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="max-w-xl space-y-4">
                {showDiagnostics && (
                  <div className="space-y-4 rounded-xl bg-stone-50 p-4 text-sm ring-1 ring-black/5">
                    <div>
                      <h3 className="font-bold">Connection</h3>
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                        <dt className="text-court-ink/55">Last connected</dt>
                        <dd>
                          {device?.lastConnectedAt
                            ? new Intl.DateTimeFormat('en-AU', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              }).format(new Date(device.lastConnectedAt))
                            : 'No heartbeat received yet'}
                        </dd>
                        <dt className="text-court-ink/55">IP address</dt>
                        <dd>
                          {device?.diagnostics?.network.primaryIp || 'Unknown'}
                        </dd>
                        <dt className="text-court-ink/55">Hostname</dt>
                        <dd>
                          {device?.diagnostics?.system.hostname || 'Unknown'}
                        </dd>
                      </dl>
                    </div>
                    <div>
                      <h3 className="font-bold">Hardware</h3>
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                        <dt className="text-court-ink/55">Model</dt>
                        <dd>
                          {device?.diagnostics?.hardware.model || 'Unknown'}
                        </dd>
                        <dt className="text-court-ink/55">Architecture</dt>
                        <dd>
                          {device?.diagnostics?.hardware.architecture ||
                            'Unknown'}
                        </dd>
                        <dt className="text-court-ink/55">Processor</dt>
                        <dd>
                          {device?.diagnostics
                            ? `${device.diagnostics.hardware.cpuCount} cores`
                            : 'Unknown'}
                        </dd>
                        <dt className="text-court-ink/55">Memory</dt>
                        <dd>
                          {device?.diagnostics
                            ? `${device.diagnostics.hardware.memoryMiB} MiB`
                            : 'Unknown'}
                        </dd>
                        <dt className="text-court-ink/55">Storage free</dt>
                        <dd>
                          {device?.diagnostics
                            ? `${device.diagnostics.hardware.storageFreeGiB} of ${device.diagnostics.hardware.storageTotalGiB} GiB`
                            : 'Unknown'}
                        </dd>
                      </dl>
                    </div>
                    <div>
                      <h3 className="font-bold">Software</h3>
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                        <dt className="text-court-ink/55">Operating system</dt>
                        <dd>
                          {device?.diagnostics?.system.operatingSystem ||
                            'Unknown'}
                        </dd>
                        <dt className="text-court-ink/55">Kernel</dt>
                        <dd>
                          {device?.diagnostics?.system.kernel || 'Unknown'}
                        </dd>
                        <dt className="text-court-ink/55">Player</dt>
                        <dd>
                          {device?.diagnostics?.system.playerVersion ||
                            'Unknown'}
                        </dd>
                        <dt className="text-court-ink/55">Config revision</dt>
                        <dd>
                          {device?.diagnostics?.revision ??
                            device?.revision ??
                            'Unknown'}
                        </dd>
                      </dl>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="display-content">Choose what to show</Label>
                  <select
                    className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-sm"
                    id="display-content"
                    onChange={(event) => setSelectedId(event.target.value)}
                    value={selectedId}
                  >
                    <option disabled value="">
                      Choose content
                    </option>
                    {device?.schedule && (
                      <option value="__schedule__">Schedule</option>
                    )}
                    <optgroup label="Slideshows">
                      {slideshows.map((item) => (
                        <option key={item.contentId} value={item.contentId}>
                          {item.title}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Still images">
                      {images.map((item) => (
                        <option key={item.contentId} value={item.contentId}>
                          {item.title}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="bg-club-green text-white hover:bg-club-green/90"
                    disabled={busy || !selectedId}
                    onClick={() =>
                      run(
                        async () => {
                          const updated = await issueDeviceAction(
                            config,
                            token,
                            device?.deviceId ?? config.deviceId,
                            selectedId === '__schedule__'
                              ? { action: 'return_to_schedule' }
                              : {
                                  action: 'show_content',
                                  contentId: selectedId,
                                },
                          );
                          setDevice(updated);
                        },
                        selectedId === '__schedule__'
                          ? 'TV returned to its schedule.'
                          : 'TV updated. The new content should appear within one minute.',
                      )
                    }
                  >
                    <Monitor /> Show on TV
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const updated = await issueDeviceAction(
                          config,
                          token,
                          device?.deviceId ?? config.deviceId,
                          { action: 'refresh' },
                        );
                        setDevice(updated);
                      }, 'TV refresh requested. It should reload within one minute.')
                    }
                    className="bg-club-green text-white hover:bg-club-green/90"
                  >
                    <RefreshCw className={busy ? 'animate-spin' : ''} /> Refresh
                    TV
                  </Button>
                </div>
                <p className="text-xs text-court-ink/50">
                  Updated a Google Slides presentation? Use Refresh TV to show
                  the latest changes.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : section === 'users' ? (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-black">Users</h1>
              <p className="text-sm text-court-ink/55">
                Add up to five competition convenors. They can change and
                refresh the TV display.
              </p>
            </div>
            <Card className="border-0 bg-white ring-0">
              <CardContent className="space-y-4 pt-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="convenor-new-name">Name</Label>
                    <Input
                      id="convenor-new-name"
                      onChange={(event) => setConvenorName(event.target.value)}
                      value={convenorName}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="convenor-new-email">Email address</Label>
                    <Input
                      id="convenor-new-email"
                      onChange={(event) => setConvenorEmail(event.target.value)}
                      placeholder="name@example.com"
                      type="email"
                      value={convenorEmail}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="convenor-new-phone">Mobile number</Label>
                    <Input
                      id="convenor-new-phone"
                      onChange={(event) => setConvenorPhone(event.target.value)}
                      placeholder="+61404123456"
                      type="tel"
                      value={convenorPhone}
                    />
                  </div>
                </div>
                <Button
                  className="bg-club-green text-white hover:bg-club-green/90"
                  disabled={busy || convenors.length >= 5}
                  onClick={() =>
                    void run(async () => {
                      if (!token) return;
                      await createConvenor(config, token, {
                        name: convenorName,
                        phoneNumber: convenorPhone,
                        email: convenorEmail || undefined,
                      });
                      setConvenorName('');
                      setConvenorPhone('');
                      setConvenorEmail('');
                    }, 'Convenor added.')
                  }
                >
                  <UserPlus /> Add convenor
                </Button>
                <div className="divide-y divide-black/5">
                  {convenors.map((item) => (
                    <div
                      className="flex items-center justify-between gap-4 py-3"
                      key={item.username}
                    >
                      <div>
                        <p className="font-bold">{item.name}</p>
                        <p className="text-sm text-court-ink/55">
                          {item.phoneNumber}
                        </p>
                        {item.email && (
                          <p className="text-sm text-court-ink/55">
                            {item.email}
                          </p>
                        )}
                      </div>
                      <Button
                        aria-label={`Delete ${item.name}`}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            if (token)
                              await deleteConvenor(
                                config,
                                token,
                                item.username,
                              );
                          }, 'Convenor deleted.')
                        }
                        size="sm"
                        variant="outline"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : section === 'schedule' ? (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-black">Schedule</h1>
              <p className="text-sm text-court-ink/55">
                Choose what the TV shows each week. Times use
                Australia/Melbourne local time.
              </p>
            </div>
            <Card className="border-0 bg-white ring-0">
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="schedule-fallback">All other times</Label>
                  <select
                    className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-sm"
                    id="schedule-fallback"
                    onChange={(event) =>
                      setScheduleFallbackId(event.target.value)
                    }
                    value={scheduleFallbackId}
                  >
                    <option disabled value="">
                      Choose content
                    </option>
                    {content.map((item) => (
                      <option key={item.contentId} value={item.contentId}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-3">
                  {scheduleEntries.map((entry, index) => (
                    <div
                      className="grid gap-2 rounded-xl border border-black/10 p-3 sm:grid-cols-[1fr_7rem_7rem_1fr_auto]"
                      key={`${index}-${entry.day}-${entry.startTime}`}
                    >
                      <select
                        aria-label={`Schedule day ${index + 1}`}
                        className="h-10 rounded-lg border border-black/15 bg-white px-2 text-sm"
                        onChange={(event) =>
                          updateScheduleEntry(index, {
                            day: event.target.value,
                          })
                        }
                        value={entry.day}
                      >
                        {weekdays.map((day) => (
                          <option key={day}>{day}</option>
                        ))}
                      </select>
                      <Input
                        aria-label={`Schedule start ${index + 1}`}
                        onChange={(event) =>
                          updateScheduleEntry(index, {
                            startTime: event.target.value,
                          })
                        }
                        type="time"
                        value={entry.startTime}
                      />
                      <Input
                        aria-label={`Schedule end ${index + 1}`}
                        onChange={(event) =>
                          updateScheduleEntry(index, {
                            endTime: event.target.value,
                          })
                        }
                        type="time"
                        value={entry.endTime}
                      />
                      <select
                        aria-label={`Schedule content ${index + 1}`}
                        className="h-10 rounded-lg border border-black/15 bg-white px-2 text-sm"
                        onChange={(event) =>
                          updateScheduleEntry(index, {
                            contentId: event.target.value,
                          })
                        }
                        value={entry.contentId}
                      >
                        {content.map((item) => (
                          <option key={item.contentId} value={item.contentId}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                      <Button
                        aria-label={`Remove schedule entry ${index + 1}`}
                        onClick={() =>
                          setScheduleEntries((entries) =>
                            entries.filter(
                              (_, entryIndex) => entryIndex !== index,
                            ),
                          )
                        }
                        size="sm"
                        variant="outline"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  {!scheduleEntries.length && (
                    <p className="text-sm text-court-ink/55">
                      No scheduled times yet. The fallback content will show all
                      week.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="bg-club-green text-white hover:bg-club-green/90"
                    disabled={!content.length || busy}
                    onClick={() =>
                      setScheduleEntries((entries) => [
                        ...entries,
                        {
                          day: 'Monday',
                          startTime: '09:00',
                          endTime: '10:00',
                          contentId: content[0]?.contentId ?? '',
                        },
                      ])
                    }
                  >
                    Add time
                  </Button>
                  <Button
                    className="bg-club-green text-white hover:bg-club-green/90"
                    disabled={busy || !scheduleFallbackId}
                    onClick={() =>
                      run(async () => {
                        const updated = await updateDeviceSchedule(
                          config,
                          token,
                          device?.deviceId ?? config.deviceId,
                          {
                            fallbackContentId: scheduleFallbackId,
                            entries: scheduleEntries,
                          },
                        );
                        setDevice(updated);
                      }, 'Schedule saved. Choose Schedule on Displays to use it.')
                    }
                  >
                    <CalendarDays /> Save schedule
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h1 className="font-display text-2xl font-black">Content</h1>
                <p className="text-sm text-court-ink/55">
                  Manage the slideshows and still images available to every
                  display.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  className="bg-club-green text-white hover:bg-club-green/90"
                  onClick={() => {
                    closeEditor();
                    setEditor({ mode: 'create-slideshow' });
                  }}
                >
                  <Presentation /> Add public Google Slides presentation
                </Button>
                <Button
                  className="bg-club-green text-white hover:bg-club-green/90"
                  onClick={() => {
                    closeEditor();
                    setEditor({ mode: 'create-image' });
                  }}
                >
                  <ImageIcon /> Add image
                </Button>
              </div>
            </div>

            {editor && (
              <Card className="border-club-green/30 bg-white ring-1 ring-club-green/10">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {editor.mode === 'create-slideshow'
                      ? 'Add public Google Slides presentation'
                      : editor.mode === 'create-image'
                        ? 'Add image'
                        : 'Edit content'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="content-title">Title</Label>
                    <Input
                      id="content-title"
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={
                        editor.mode === 'create-image'
                          ? 'Honours Board'
                          : 'Saturday Morning'
                      }
                      value={title}
                    />
                  </div>
                  {(editor.mode === 'create-slideshow' ||
                    (editor.mode === 'edit' &&
                      content.find(
                        (item) => item.contentId === editor.contentId,
                      )?.type === 'slideshow')) && (
                    <div className="space-y-2">
                      {editor.mode === 'create-slideshow' && (
                        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-court-ink/75">
                          <p className="font-bold text-court-ink">
                            Share a Google Slides presentation publicly
                          </p>
                          <ol className="mt-2 list-decimal space-y-1 pl-5">
                            <li>Open the presentation and select Share.</li>
                            <li>
                              Under General access, choose Anyone with the link.
                            </li>
                            <li>Set access to Viewer.</li>
                            <li>Select Copy link, then Done.</li>
                            <li>Paste the copied link below.</li>
                          </ol>
                        </div>
                      )}
                      <Label htmlFor="content-url">Google Slides URL</Label>
                      <Input
                        id="content-url"
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="https://docs.google.com/presentation/d/..."
                        value={url}
                      />
                    </div>
                  )}
                  {editor.mode === 'create-image' && (
                    <div className="space-y-2">
                      <Label htmlFor="content-file">Image file</Label>
                      <Input
                        accept="image/jpeg,image/png"
                        id="content-file"
                        onChange={(event) =>
                          setFile(event.target.files?.[0] ?? null)
                        }
                        type="file"
                      />
                      <p className="text-xs text-court-ink/45">
                        JPEG or PNG, up to 20 MB.
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      className="bg-club-green text-white hover:bg-club-green/90"
                      disabled={busy}
                      onClick={() => void saveEditor()}
                    >
                      Save
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={closeEditor}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-0 bg-white ring-0">
              <CardContent className="divide-y divide-black/5 p-0">
                {content.map((item) => {
                  const displays = contentShownBy(item);
                  return (
                    <article
                      className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                      key={item.contentId}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-green-50 text-club-green">
                          {item.type === 'slideshow' ? (
                            <Presentation className="size-5" />
                          ) : (
                            <ImageIcon className="size-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-bold">{item.title}</p>
                            {displays.map((displayName) => (
                              <Badge
                                className="bg-club-green text-white"
                                key={`${item.contentId}-${displayName}`}
                              >
                                On {displayName}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-court-ink/45">
                            {item.type === 'slideshow'
                              ? 'Slideshow'
                              : item.width && item.height
                                ? `Still image · ${item.width}×${item.height}`
                                : 'Still image'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={busy}
                          onClick={() => startEdit(item)}
                          size="sm"
                          variant="outline"
                        >
                          <Pencil /> Edit
                        </Button>
                        {item.type === 'image' && (
                          <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-medium hover:bg-stone-50">
                            <Upload className="size-4" /> Replace
                            <input
                              accept="image/jpeg,image/png"
                              className="sr-only"
                              disabled={busy}
                              onChange={(event) => {
                                const replacement = event.target.files?.[0];
                                if (replacement)
                                  void replaceImage(item, replacement);
                                event.target.value = '';
                              }}
                              type="file"
                            />
                          </label>
                        )}
                        <Button
                          disabled={busy || displays.length > 0}
                          onClick={() => {
                            if (!window.confirm(`Delete “${item.title}”?`))
                              return;
                            void run(async () => {
                              await deleteContent(
                                config,
                                token,
                                item.contentId,
                              );
                            }, `${item.title} deleted.`);
                          }}
                          size="sm"
                          variant="outline"
                        >
                          <Trash2 /> Delete
                        </Button>
                      </div>
                    </article>
                  );
                })}
                {!content.length && (
                  <p className="p-6 text-sm text-court-ink/50">
                    No content has been added yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
