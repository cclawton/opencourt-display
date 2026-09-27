'use client';

/* oxlint-disable react/react-compiler, next/no-img-element -- browser-only configuration and original-resolution display assets are intentional. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cloud,
  Eye,
  ImageIcon,
  KeyRound,
  Laptop,
  Maximize2,
  Monitor,
  Plus,
  Presentation,
  Radio,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Upload,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleSignIn, signOutGoogle } from '@/components/google-sign-in';
import { issueDeviceAction, loadAdminState, uploadDisplayImage, type RemoteAsset, type RemoteDevice, type RemoteProgramme } from '@/lib/control-api';
import { getRuntimeConfig } from '@/lib/runtime-config';

type View = 'display' | 'control' | 'setup';
type DisplayMode = 'cached' | 'native';

type Programme = {
  id: string;
  name: string;
  shortName: string;
  day: string;
  time: string;
  activities: string[];
};

const programmes: Programme[] = [
  { id: 'sat-am', name: 'Saturday Morning', shortName: 'Sat AM', day: 'Saturday', time: '7:00 am – 12:30 pm', activities: ['Juniors'] },
  { id: 'sat-pm', name: 'Saturday Afternoon', shortName: 'Sat PM', day: 'Saturday', time: '12:30 pm – 7:00 pm', activities: ['Pennant', 'Seniors'] },
  { id: 'mon-night', name: 'Monday Night', shortName: 'Mon PM', day: 'Monday', time: '5:30 pm – 11:00 pm', activities: ['Night competition'] },
  { id: 'tue-mid', name: 'Tuesday Mid-week Ladies', shortName: 'Tue AM', day: 'Tuesday', time: '9:00 am – 3:00 pm', activities: ['Mid-week ladies'] },
  { id: 'tue-night', name: 'Tuesday Night', shortName: 'Tue PM', day: 'Tuesday', time: '5:30 pm – 11:00 pm', activities: ['Night competition'] },
  { id: 'wed-night', name: 'Wednesday Night', shortName: 'Wed PM', day: 'Wednesday', time: '5:30 pm – 11:00 pm', activities: ['Night competition'] },
  { id: 'thu-mid', name: 'Thursday Mid-week Ladies', shortName: 'Thu AM', day: 'Thursday', time: '9:00 am – 3:00 pm', activities: ['Mid-week ladies'] },
  { id: 'thu-night', name: 'Thursday Night', shortName: 'Thu PM', day: 'Thursday', time: '5:30 pm – 11:00 pm', activities: ['Night competition'] },
];

const setupSteps: Array<[number, string, LucideIcon]> = [
  [1, 'Connect Wi-Fi', Wifi],
  [2, 'Create administrator', KeyRound],
  [3, 'Connect Google Slides', Presentation],
  [4, 'Confirm display', Monitor],
];

const morningAllocations = [
  ['1', 'OR 11', 'Heatherdale', 'Box Hill'],
  ['2', 'OR 11', 'Heatherdale', 'Box Hill'],
  ['3', 'OR 19', 'Heatherdale', 'Eaglemont Blue'],
  ['4', 'OR 19', 'Heatherdale', 'Eaglemont Blue'],
  ['5', 'OR 21', 'Heatherdale', 'E’Croydon-Kilsyth'],
  ['6', 'OR 21', 'Heatherdale', 'E’Croydon-Kilsyth'],
  ['7', 'OR 24', 'Heatherdale', 'Kew'],
  ['8', 'OR 24', 'Heatherdale', 'Kew'],
];

const afternoonAllocations = [
  ['1', 'Pennant 2', 'Heatherdale', 'Royal South Yarra'],
  ['2', 'Pennant 2', 'Heatherdale', 'Royal South Yarra'],
  ['3', 'Pennant 7', 'Heatherdale', 'Donvale'],
  ['4', 'Pennant 7', 'Heatherdale', 'Donvale'],
  ['5', 'Seniors A', 'Heatherdale', 'North Ringwood'],
  ['6', 'Seniors A', 'Heatherdale', 'North Ringwood'],
  ['7', 'Seniors C', 'Heatherdale', 'Mitcham'],
  ['8', 'Seniors C', 'Heatherdale', 'Mitcham'],
];

function normaliseSlidesUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed.includes('docs.google.com/presentation')) return '';
  if (trimmed.includes('/embed')) return trimmed;
  if (trimmed.includes('/d/e/')) {
    return trimmed.replace(/\/pub.*$/, '/embed?start=true&loop=true&delayms=10000');
  }
  const match = trimmed.match(/\/presentation\/d\/([^/]+)/);
  return match ? `https://docs.google.com/presentation/d/${match[1]}/embed?start=true&loop=true&delayms=10000` : '';
}

function formatRefreshTime(date: Date) {
  return new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(date);
}

export default function Home() {
  const runtimeConfig = useMemo(getRuntimeConfig, []);
  const deployedControlRoom = Boolean(runtimeConfig.apiBaseUrl);
  const [view, setView] = useState<View>(() => deployedControlRoom ? 'control' : 'display');
  const [activeId, setActiveId] = useState('sat-am');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('cached');
  const [slidesUrl, setSlidesUrl] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [specialEvent, setSpecialEvent] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  const [setupComplete, setSetupComplete] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [deviceMode, setDeviceMode] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [remoteProgrammes, setRemoteProgrammes] = useState<RemoteProgramme[]>([]);
  const [remoteAssets, setRemoteAssets] = useState<RemoteAsset[]>([]);
  const [remoteDevice, setRemoteDevice] = useState<RemoteDevice | null>(null);
  const [adminMessage, setAdminMessage] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);

  const loadRemoteState = useCallback(async (token: string) => {
    setAdminError('');
    try {
      const state = await loadAdminState(runtimeConfig, token);
      setRemoteProgrammes(state.programmes);
      setRemoteDevice(state.device);
      setRemoteAssets(state.assets);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Unable to load the control plane.');
    }
  }, [runtimeConfig]);

  const onCredential = useCallback((token: string) => {
    setAuthToken(token);
    void loadRemoteState(token);
  }, [loadRemoteState]);

  const runRemoteAction = useCallback(async (action: Record<string, unknown>) => {
    if (!authToken) {
      setAdminError('Sign in with an approved Google Workspace account first.');
      return;
    }
    setAdminBusy(true);
    setAdminMessage('');
    setAdminError('');
    try {
      const device = await issueDeviceAction(runtimeConfig, authToken, action);
      setRemoteDevice(device);
      setAdminMessage(`Updated revision ${device.revision}. The Pi will poll within ${device.pollIntervalSeconds} seconds.`);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Unable to update the display.');
    } finally {
      setAdminBusy(false);
    }
  }, [authToken, runtimeConfig]);

  const uploadImage = useCallback(async (file: File) => {
    if (!authToken) {
      setAdminError('Sign in with an approved Google Workspace account first.');
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 20 * 1024 * 1024) {
      setAdminError('Choose a JPEG or PNG no larger than 20 MB.');
      return;
    }
    setAdminBusy(true);
    setAdminMessage('Checking and uploading image…');
    setAdminError('');
    try {
      const bitmap = await createImageBitmap(file);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      const asset = await uploadDisplayImage(runtimeConfig, authToken, file, dimensions);
      setRemoteAssets((current) => [asset, ...current.filter((item) => item.assetId !== asset.assetId)]);
      setAdminMessage(`Uploaded ${asset.name} at ${asset.width}×${asset.height}. Choose how to display it below.`);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Unable to upload the image.');
      setAdminMessage('');
    } finally {
      setAdminBusy(false);
    }
  }, [authToken, runtimeConfig]);

  useEffect(() => {
    setLastRefresh(new Date());
    const search = new URLSearchParams(window.location.search);
    const presentationId = search.get('presentation');
    const publishedId = search.get('published');
    const isDevice = search.get('device') === '1';
    setDeviceMode(isDevice);
    if (presentationId && /^[a-zA-Z0-9_-]+$/.test(presentationId)) {
      setSlidesUrl(`https://docs.google.com/presentation/d/${presentationId}/edit`);
      setDisplayMode('native');
    } else if (publishedId && /^[a-zA-Z0-9_-]+$/.test(publishedId)) {
      setSlidesUrl(`https://docs.google.com/presentation/d/e/${publishedId}/pub`);
      setDisplayMode('native');
    }
    if (!presentationId && !publishedId) {
      const stored = window.localStorage.getItem('opencourt-demo-config');
      if (!stored) return;
      try {
        const config = JSON.parse(stored) as { slidesUrl?: string; displayMode?: DisplayMode };
        if (config.slidesUrl) setSlidesUrl(config.slidesUrl);
        if (config.displayMode) setDisplayMode(config.displayMode);
      } catch {
        window.localStorage.removeItem('opencourt-demo-config');
      }
    }
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    const timer = window.setInterval(() => {
      setLastRefresh(new Date());
      setRefreshVersion((version) => version + 1);
    }, 120_000);
    return () => window.clearInterval(timer);
  }, []);

  const active = useMemo(
    () => programmes.find((programme) => programme.id === activeId) ?? programmes[0],
    [activeId],
  );
  const allocations = activeId === 'sat-pm' ? afternoonAllocations : morningAllocations;
  const embedUrl = normaliseSlidesUrl(slidesUrl);

  function refreshDisplay() {
    setRefreshing(true);
    window.setTimeout(() => {
      setLastRefresh(new Date());
      setRefreshVersion((version) => version + 1);
      setRefreshing(false);
    }, 850);
  }

  function saveSource() {
    window.localStorage.setItem('opencourt-demo-config', JSON.stringify({ slidesUrl, displayMode }));
    refreshDisplay();
  }

  function enterFullscreen() {
    void document.documentElement.requestFullscreen?.();
  }

  return (
    <main className="min-h-screen bg-court-ink text-white">
      {!deviceMode && (
        <AppHeader
          activeView={view}
          deployedControlRoom={deployedControlRoom}
          onFullscreen={enterFullscreen}
          onNavigate={setView}
          onRefresh={refreshDisplay}
          refreshing={refreshing}
        />
      )}

      {view === 'display' && (
        <DisplayView
          active={active}
          allocations={allocations}
          displayMode={displayMode}
          embedUrl={embedUrl}
          lastRefresh={lastRefresh}
          refreshVersion={refreshVersion}
          specialEvent={specialEvent}
        />
      )}

      {view === 'control' && (
        <ControlView
          activeId={activeId}
          adminBusy={adminBusy}
          adminError={adminError}
          adminMessage={adminMessage}
          authToken={authToken}
          deployedControlRoom={deployedControlRoom}
          displayMode={displayMode}
          lastRefresh={lastRefresh}
          onAddEvent={() => setSpecialEvent((current) => !current)}
          onDisplayMode={setDisplayMode}
          onPreview={(id) => {
            setActiveId(id);
            setView('display');
          }}
          onRefresh={refreshDisplay}
          onRemoteAction={runRemoteAction}
          onUploadImage={uploadImage}
          onSignOut={() => {
            signOutGoogle();
            setAuthToken(null);
            setRemoteDevice(null);
            setRemoteProgrammes([]);
            setRemoteAssets([]);
          }}
          onSaveSource={saveSource}
          onCredential={onCredential}
          remoteDevice={remoteDevice}
          remoteAssets={remoteAssets}
          remoteProgrammes={remoteProgrammes}
          refreshing={refreshing}
          setSlidesUrl={setSlidesUrl}
          slidesUrl={slidesUrl}
          specialEvent={specialEvent}
        />
      )}

      {view === 'setup' && (
        <SetupView
          complete={setupComplete}
          onBack={() => setSetupStep((step) => Math.max(1, step - 1))}
          onComplete={() => setSetupComplete(true)}
          onNext={() => setSetupStep((step) => Math.min(4, step + 1))}
          onOpenDisplay={() => setView('display')}
          step={setupStep}
        />
      )}
    </main>
  );
}

function AppHeader({
  activeView,
  deployedControlRoom,
  onFullscreen,
  onNavigate,
  onRefresh,
  refreshing,
}: {
  activeView: View;
  deployedControlRoom: boolean;
  onFullscreen: () => void;
  onNavigate: (view: View) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-white/10 bg-court-ink/95 px-4 py-3 backdrop-blur sm:px-7">
      <button className="flex items-center gap-3 text-left" onClick={() => onNavigate(deployedControlRoom ? 'control' : 'display')}>
        <div className="grid size-9 place-items-center rounded-full bg-tennis text-sm font-black text-court-ink">OC</div>
        <div>
          <p className="font-display text-sm font-bold leading-tight tracking-wide">OpenCourt Display</p>
          <p className="text-[11px] text-white/55">{deployedControlRoom ? 'Heatherdale Tennis Club' : 'Heatherdale demonstration'}</p>
        </div>
      </button>

      {!deployedControlRoom && <nav aria-label="Demo views" className="hidden items-center rounded-xl bg-white/[0.07] p-1 md:flex">
        {([
          ['display', 'TV display', Monitor],
          ['control', 'Control room', Settings2],
          ['setup', 'First boot', Laptop],
        ] as const).map(([id, label, Icon]) => (
          <button
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${activeView === id ? 'bg-white text-court-ink' : 'text-white/60 hover:text-white'}`}
            key={id}
            onClick={() => onNavigate(id)}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </nav>}

      {!deployedControlRoom && <div className="flex items-center gap-2">
        <Button aria-label="Refresh display" className="border-white/10 bg-white/10 text-white hover:bg-white/20" onClick={onRefresh} size="icon" variant="outline">
          <RefreshCw className={refreshing ? 'animate-spin' : ''} />
        </Button>
        <Button aria-label="Open display controls" className="border-white/10 bg-white/10 text-white hover:bg-white/20 md:hidden" onClick={() => onNavigate('control')} size="icon" variant="outline">
          <Settings2 />
        </Button>
        <Button aria-label="Enter fullscreen" className="border-white/10 bg-white/10 text-white hover:bg-white/20" onClick={onFullscreen} size="icon" variant="outline">
          <Maximize2 />
        </Button>
      </div>}
    </header>
  );
}

function DisplayView({
  active,
  allocations,
  displayMode,
  embedUrl,
  lastRefresh,
  refreshVersion,
  specialEvent,
}: {
  active: Programme;
  allocations: string[][];
  displayMode: DisplayMode;
  embedUrl: string;
  lastRefresh: Date | null;
  refreshVersion: number;
  specialEvent: boolean;
}) {
  const showNative = displayMode === 'native' && embedUrl;

  return (
    <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-[1500px] flex-col justify-center gap-3 p-3 sm:p-6 lg:p-9">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-white/55">
        <div className="flex items-center gap-2">
          <Badge className="border-emerald-300/20 bg-emerald-300/10 text-emerald-200" variant="outline"><Radio /> Live preview</Badge>
          <span>{displayMode === 'cached' ? 'Offline-ready display' : 'Native Google Slides'}</span>
        </div>
        <span>Last refreshed {lastRefresh ? formatRefreshTime(lastRefresh) : '—'} · checks every 2 minutes</span>
      </div>

      {specialEvent && (
        <div className="flex items-center justify-between rounded-xl border border-tennis/30 bg-tennis/10 px-4 py-3 text-sm text-tennis">
          <span><strong>One-off event ready:</strong> Club Championships will override the regular schedule on 14–15 November.</span>
          <Badge className="bg-tennis text-court-ink">Priority override</Badge>
        </div>
      )}

      {showNative ? (
        <div className="aspect-video w-full overflow-hidden rounded-[1.4rem] bg-black shadow-[0_30px_100px_rgba(0,0,0,.34)] ring-1 ring-white/15">
          <iframe allowFullScreen className="h-full w-full border-0" key={refreshVersion} src={embedUrl} title={`${active.name} Google Slides`} />
        </div>
      ) : (
        <AllocationBoard active={active} allocations={allocations} />
      )}
    </section>
  );
}

function AllocationBoard({ active, allocations }: { active: Programme; allocations: string[][] }) {
  return (
    <article className="w-full overflow-hidden rounded-[1.4rem] bg-display shadow-[0_30px_100px_rgba(0,0,0,.34)] ring-1 ring-white/15">
      <div className="flex flex-col justify-between gap-5 border-b-4 border-club-green px-5 py-5 text-court-ink sm:flex-row sm:items-center sm:px-8 lg:px-12 lg:py-7">
        <div className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-club-green font-display text-2xl font-black italic text-white lg:size-16">H</div>
          <div>
            <p className="font-display text-xl font-black uppercase tracking-tight text-club-green lg:text-3xl">Heatherdale</p>
            <p className="text-sm font-semibold tracking-[0.2em] text-club-gold lg:text-base">TENNIS CLUB</p>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-court-ink/45">Court allocations</p>
          <h1 className="font-display text-2xl font-black tracking-tight text-club-green sm:text-3xl lg:text-5xl">{active.name}</h1>
          <div className="mt-1 flex flex-wrap gap-2 sm:justify-end">
            {active.activities.map((activity) => <span className="text-sm font-semibold text-court-ink/60 lg:text-base" key={activity}>{activity}</span>)}
            <span className="text-sm font-semibold text-court-ink/35">· 5 September 2026</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto p-3 sm:p-6 lg:p-8">
        <table className="w-full min-w-[620px] border-collapse text-left text-court-ink">
          <thead>
            <tr className="bg-club-green text-white">
              <th className="w-24 rounded-l-xl px-4 py-3 text-center text-xs font-bold uppercase tracking-wider lg:py-4 lg:text-lg">Court</th>
              <th className="w-44 px-4 py-3 text-xs font-bold uppercase tracking-wider lg:py-4 lg:text-lg">Section</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider lg:py-4 lg:text-lg">Home team</th>
              <th className="rounded-r-xl px-4 py-3 text-xs font-bold uppercase tracking-wider lg:py-4 lg:text-lg">Away team</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map(([court, section, home, away]) => (
              <tr className="border-b border-club-gold/35 last:border-0" key={court}>
                <td className="px-4 py-2 text-center font-display text-lg font-black text-club-green lg:py-3 lg:text-2xl">{court}</td>
                <td className="px-4 py-2 font-bold text-club-green lg:py-3 lg:text-xl">{section}</td>
                <td className="px-4 py-2 font-semibold lg:py-3 lg:text-xl">{home}</td>
                <td className="px-4 py-2 font-semibold lg:py-3 lg:text-xl">{away}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function ControlView({
  activeId,
  adminBusy,
  adminError,
  adminMessage,
  authToken,
  deployedControlRoom,
  displayMode,
  lastRefresh,
  onAddEvent,
  onDisplayMode,
  onPreview,
  onRefresh,
  onRemoteAction,
  onUploadImage,
  onSignOut,
  onSaveSource,
  onCredential,
  remoteDevice,
  remoteAssets,
  remoteProgrammes,
  refreshing,
  setSlidesUrl,
  slidesUrl,
  specialEvent,
}: {
  activeId: string;
  adminBusy: boolean;
  adminError: string;
  adminMessage: string;
  authToken: string | null;
  deployedControlRoom: boolean;
  displayMode: DisplayMode;
  lastRefresh: Date | null;
  onAddEvent: () => void;
  onDisplayMode: (mode: DisplayMode) => void;
  onPreview: (id: string) => void;
  onRefresh: () => void;
  onRemoteAction: (action: Record<string, unknown>) => void;
  onUploadImage: (file: File) => void;
  onSignOut: () => void;
  onSaveSource: () => void;
  onCredential: (token: string) => void;
  remoteDevice: RemoteDevice | null;
  remoteAssets: RemoteAsset[];
  remoteProgrammes: RemoteProgramme[];
  refreshing: boolean;
  setSlidesUrl: (value: string) => void;
  slidesUrl: string;
  specialEvent: boolean;
}) {
  const [eventName, setEventName] = useState('Club Championships');
  const programmeIds = new Set(remoteProgrammes.map((programme) => programme.programmeId));
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-7 lg:py-12">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Badge className="mb-3 bg-tennis text-court-ink">{deployedControlRoom ? 'Committee control' : 'Committee demo'}</Badge>
          <h1 className="font-display text-3xl font-black tracking-tight sm:text-5xl">{deployedControlRoom ? 'Clubhouse display' : 'Control room'}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">{deployedControlRoom ? 'Choose what appears on the TV. Changes normally arrive within one minute.' : 'Manage what the clubhouse TV shows without touching the Raspberry Pi. Changes are revisioned, audited and applied on its next poll.'}</p>
        </div>
        {!deployedControlRoom && <Button className="bg-tennis text-court-ink hover:bg-tennis/85" onClick={onRefresh} size="lg">
          <RefreshCw className={refreshing ? 'animate-spin' : ''} /> Refresh TV now
        </Button>}
      </div>

      <Card className="mb-5 border-0 bg-white text-court-ink ring-0">
        {(!deployedControlRoom || !authToken) && <CardHeader className="border-b border-black/5">
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="text-club-green" /> Committee access</CardTitle>
          <CardDescription>{deployedControlRoom ? 'Sign in with the club Google account to continue.' : 'Only approved Google Workspace accounts can change a display. The ID token is verified by the AWS control API and held in memory by this browser.'}</CardDescription>
        </CardHeader>}
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          {authToken ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="bg-emerald-100 text-emerald-800">Signed in</Badge>
              <Button onClick={onSignOut} variant="outline">Sign out</Button>
            </div>
          ) : (
            <GoogleSignIn clientId={getRuntimeConfig().googleClientId} onCredential={onCredential} />
          )}
          <div className="max-w-xl text-right text-xs text-court-ink/50">
            {adminMessage && <p className="text-emerald-700">{adminMessage}</p>}
            {adminError && <p className="text-red-700">{adminError}</p>}
          </div>
        </CardContent>
      </Card>

      {(!deployedControlRoom || authToken) && <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <Card className="border-0 bg-white text-court-ink ring-0">
          <CardHeader className="border-b border-black/5">
            <CardTitle className="flex items-center gap-2 text-xl"><CalendarDays className="text-club-green" /> {deployedControlRoom ? 'Court allocations' : 'Weekly display schedule'}</CardTitle>
            <CardDescription>{deployedControlRoom ? 'Choose the allocation to show on the TV.' : 'Eight recurring court-allocation sessions. Previewing a session does not change its saved schedule.'}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {programmes.map((programme) => {
              const remoteProgramme = remoteProgrammes.find((item) => item.programmeId === programme.id);
              return (
                <div className={`group flex items-center justify-between gap-2 rounded-xl border p-3 transition hover:border-club-green/40 hover:bg-green-50 ${programme.id === activeId ? 'border-club-green/40 bg-green-50' : 'border-black/8'}`} key={programme.id}>
                  <button className="min-w-0 flex-1 text-left" disabled={deployedControlRoom} onClick={() => onPreview(programme.id)}>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{programme.name}</span>
                      {!deployedControlRoom && programme.id === activeId && <Badge className="bg-club-green text-white">Preview</Badge>}
                    </div>
                    {!deployedControlRoom && <p className="mt-1 text-xs text-court-ink/50">{programme.time} · {programme.activities.join(' + ')}</p>}
                  </button>
                  <div className="flex items-center gap-1">
                    {!deployedControlRoom && <Eye className="hidden size-4 text-court-ink/25 transition group-hover:text-club-green sm:block" />}
                    {authToken && programmeIds.has(programme.id) && remoteProgramme && (
                      <Button disabled={adminBusy} onClick={() => onRemoteAction({ action: 'show_programme', programmeId: remoteProgramme.programmeId })} size="sm">Show now</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <Card className="border-0 bg-[#123a2e] text-white ring-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Monitor className="text-tennis" /> Clubhouse TV</CardTitle>
              <CardDescription className="text-white/55">{deployedControlRoom ? 'Current cloud selection' : 'Raspberry Pi 400 · HDMI display'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!deployedControlRoom && <StatusRow icon={Wifi} label="Network" value="Connected" />}
              {!deployedControlRoom && <StatusRow icon={CheckCircle2} label="Player" value="Healthy" />}
              {!deployedControlRoom && <StatusRow icon={Clock3} label="Revision" value={remoteDevice ? String(remoteDevice.revision) : 'Sign in to inspect'} />}
              <StatusRow icon={Cloud} label={deployedControlRoom ? 'Showing' : 'Source'} value={remoteDevice?.activeSelection?.name ?? (lastRefresh ? formatRefreshTime(lastRefresh) : 'Waiting')} />
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button disabled={!authToken || adminBusy} onClick={() => onRemoteAction({ action: 'return_to_schedule' })} size="sm" variant="secondary">Restore default</Button>
                <Button disabled={!authToken || adminBusy} onClick={() => onRemoteAction({ action: 'show_honours' })} size="sm" variant="secondary">Show honours</Button>
                <Button className="col-span-2" disabled={!authToken || adminBusy} onClick={() => onRemoteAction({ action: 'refresh' })} size="sm" variant="outline"><RefreshCw /> Refresh TV now</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-white text-court-ink ring-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Plus className="text-club-green" /> One-off events</CardTitle>
              <CardDescription>Overrides and additions take priority over the usual weekly programme.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Input onChange={(event) => setEventName(event.target.value)} value={eventName} />
                <Button className="w-full" disabled={!authToken || adminBusy || !remoteDevice} onClick={() => {
                  const selected = remoteDevice?.activeSelection?.programmeId ?? activeId;
                  onAddEvent();
                  onRemoteAction({ action: 'set_event_override', programmeId: selected, eventName });
                }} variant={specialEvent ? 'secondary' : 'outline'}>
                  {specialEvent ? <><Check /> Club Championships added</> : <><Plus /> Show as event override</>}
                </Button>
                {!authToken && <p className="text-xs text-court-ink/45">Sign in to publish an override.</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 bg-white text-court-ink ring-0 lg:col-span-2">
          <CardHeader className="border-b border-black/5">
            <CardTitle className="flex items-center gap-2 text-xl"><ImageIcon className="text-club-green" /> Image library</CardTitle>
            <CardDescription>Upload a JPEG or PNG once, then show it immediately on the TV. An exact 3840×2160 image can also become the permanent honours-board source.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-black/15 bg-stone-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 font-bold"><Upload className="size-4 text-club-green" /> Add a display image</p>
                <p className="mt-1 text-xs text-court-ink/50">JPEG or PNG, up to 20 MB. Images are verified before they appear in this library.</p>
              </div>
              <Input
                accept="image/jpeg,image/png"
                className="max-w-sm bg-white"
                disabled={!authToken || adminBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onUploadImage(file);
                  event.target.value = '';
                }}
                type="file"
              />
            </div>

            {remoteAssets.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {remoteAssets.map((asset) => {
                  const isFourK = asset.width === 3840 && asset.height === 2160;
                  const isActive = remoteDevice?.source.url === asset.publicUrl;
                  return (
                    <article className={`overflow-hidden rounded-xl border ${isActive ? 'border-club-green ring-2 ring-club-green/15' : 'border-black/10'}`} key={asset.assetId}>
                      <div className="aspect-video bg-court-ink/5">
                        <img alt={asset.name} className="h-full w-full object-contain" loading="lazy" src={asset.publicUrl} />
                      </div>
                      <div className="space-y-3 p-3">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-bold" title={asset.name}>{asset.name}</p>
                            {isActive && <Badge className="shrink-0 bg-club-green text-white">On TV</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-court-ink/45">{asset.width}×{asset.height} · {(asset.byteSize / 1024 / 1024).toFixed(1)} MB</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button disabled={!authToken || adminBusy} onClick={() => onRemoteAction({ action: 'show_image', assetId: asset.assetId })} size="sm">Show now</Button>
                          <Button disabled={!authToken || adminBusy || !isFourK} onClick={() => onRemoteAction({ action: 'set_honours_image', assetId: asset.assetId })} size="sm" variant="outline">Use as honours</Button>
                        </div>
                        {!isFourK && <p className="text-[11px] leading-4 text-court-ink/40">Temporary display only. The honours source must be exactly 3840×2160.</p>}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-stone-50 p-5 text-sm text-court-ink/50">{authToken ? 'No uploaded images yet.' : 'Sign in to view and upload club display images.'}</p>
            )}
          </CardContent>
        </Card>

        {!deployedControlRoom && <Card className="border-0 bg-white text-court-ink ring-0 lg:col-span-2">
          <CardHeader className="border-b border-black/5">
            <CardTitle className="flex items-center gap-2 text-xl"><Presentation className="text-club-green" /> Google Slides source</CardTitle>
            <CardDescription>Paste a Google Slides sharing or published URL. In the installed player, private decks use a club-owned read-only service account.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <div className="space-y-2">
              <Label htmlFor="slides-url">Presentation URL</Label>
              <Input id="slides-url" onChange={(event) => setSlidesUrl(event.target.value)} placeholder="https://docs.google.com/presentation/d/..." value={slidesUrl} />
              <p className="text-xs text-court-ink/45">No credentials are uploaded by this public demonstration.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['cached', 'Cached', 'Most reliable'],
                ['native', 'Native', 'Animations'],
              ] as const).map(([mode, label, detail]) => (
                <button className={`rounded-xl border p-3 text-left ${displayMode === mode ? 'border-club-green bg-green-50' : 'border-black/10'}`} key={mode} onClick={() => onDisplayMode(mode)}>
                  <span className="block text-sm font-bold">{label}</span>
                  <span className="text-xs text-court-ink/45">{detail}</span>
                </button>
              ))}
              <Button className="col-span-2 mt-1 bg-club-green text-white hover:bg-club-green/90" onClick={onSaveSource}>Save source</Button>
            </div>
          </CardContent>
        </Card>}
      </div>}
    </section>
  );
}

function StatusRow({ icon: Icon, label, value }: { icon: typeof Wifi; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-3 last:border-0 last:pb-0">
      <span className="flex items-center gap-2 text-sm text-white/55"><Icon className="size-4" /> {label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

function SetupView({
  complete,
  onBack,
  onComplete,
  onNext,
  onOpenDisplay,
  step,
}: {
  complete: boolean;
  onBack: () => void;
  onComplete: () => void;
  onNext: () => void;
  onOpenDisplay: () => void;
  step: number;
}) {
  if (complete) {
    return (
      <section className="mx-auto grid min-h-[calc(100vh-64px)] max-w-3xl place-items-center px-4 py-12">
        <Card className="w-full border-0 bg-white text-center text-court-ink ring-0">
          <CardContent className="py-12">
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-club-green text-white"><Check className="size-8" /></div>
            <Badge className="mb-3 bg-tennis text-court-ink">Setup complete</Badge>
            <h1 className="font-display text-3xl font-black">Your court display is ready</h1>
            <p className="mx-auto mt-3 max-w-lg text-court-ink/55">On a Raspberry Pi, this screen hands over to the full-screen player and automatically starts it again after every reboot.</p>
            <Button className="mt-7 bg-club-green text-white hover:bg-club-green/90" onClick={onOpenDisplay} size="lg">Open TV display <ChevronRight /></Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-7 lg:py-12">
      <div className="mb-8">
        <Badge className="mb-3 bg-tennis text-court-ink">Raspberry Pi first boot preview</Badge>
        <h1 className="font-display text-3xl font-black tracking-tight sm:text-5xl">Set up your club display</h1>
        <p className="mt-2 max-w-2xl text-white/55">A guided setup replaces terminal commands. Club secrets stay on the device and are never built into the downloadable image.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <Card className="border-0 bg-white/5 text-white ring-1 ring-white/10">
          <CardContent className="space-y-1">
            {setupSteps.map(([number, label, Icon]) => (
              <div className={`flex items-center gap-3 rounded-xl px-3 py-3 ${step === number ? 'bg-white text-court-ink' : Number(number) < step ? 'text-tennis' : 'text-white/40'}`} key={String(number)}>
                <div className={`grid size-8 place-items-center rounded-full ${step === number ? 'bg-tennis' : 'bg-white/10'}`}>
                  {Number(number) < step ? <Check className="size-4" /> : <Icon className="size-4" />}
                </div>
                <span className="text-sm font-bold">{label}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="min-h-[440px] border-0 bg-white text-court-ink ring-0">
          <CardHeader>
            <CardTitle className="text-2xl">{['', 'Connect this display', 'Create the club administrator', 'Choose the Google source', 'Ready to start'][step]}</CardTitle>
            <CardDescription>{['', 'Select the clubhouse network. The real device uses the Raspberry Pi wireless manager.', 'This account controls settings and immediate refreshes.', 'Google Slides remains the input for the first release.', 'Review the choices before starting kiosk mode.'][step]}</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-[300px] flex-col justify-between gap-8">
            <SetupStep step={step} />
            <div className="flex items-center justify-between border-t border-black/5 pt-5">
              <Button disabled={step === 1} onClick={onBack} variant="ghost"><ArrowLeft /> Back</Button>
              {step < 4 ? (
                <Button className="bg-club-green text-white hover:bg-club-green/90" onClick={onNext}>Continue <ChevronRight /></Button>
              ) : (
                <Button className="bg-club-green text-white hover:bg-club-green/90" onClick={onComplete}>Finish setup <Check /></Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function SetupStep({ step }: { step: number }) {
  if (step === 1) {
    return (
      <div className="space-y-3">
        {['Heatherdale Clubhouse', 'HTC-Committee', 'Guest Wi-Fi'].map((network, index) => (
          <button className={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${index === 0 ? 'border-club-green bg-green-50' : 'border-black/10'}`} key={network}>
            <span className="flex items-center gap-3"><Wifi className="size-4 text-club-green" /><span className="font-bold">{network}</span></span>
            {index === 0 ? <CheckCircle2 className="size-4 text-club-green" /> : <span className="text-xs text-court-ink/40">Secured</span>}
          </button>
        ))}
        <div className="space-y-2 pt-2"><Label htmlFor="wifi-password">Wi-Fi password</Label><Input id="wifi-password" placeholder="Enter network password" type="password" /></div>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="admin-name">Administrator name</Label><Input defaultValue="Club Display Admin" id="admin-name" /></div>
        <div className="space-y-2"><Label htmlFor="admin-password">Password</Label><Input id="admin-password" placeholder="At least 12 characters" type="password" /></div>
        <div className="space-y-2"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" placeholder="Repeat password" type="password" /></div>
        <div className="rounded-xl bg-green-50 p-4 text-sm text-club-green sm:col-span-2"><ShieldCheck className="mb-2 size-5" /><strong>One club-controlled account.</strong> Additional roles and committee accounts remain future work.</div>
      </div>
    );
  }
  if (step === 3) {
    return (
      <div className="space-y-4">
        <button className="flex w-full items-center justify-between rounded-xl border border-club-green bg-green-50 p-4 text-left"><span><strong className="block">Published Google Slides link</strong><span className="text-xs text-court-ink/50">Fastest setup for non-sensitive allocations</span></span><CheckCircle2 className="size-5 text-club-green" /></button>
        <button className="flex w-full items-center justify-between rounded-xl border border-black/10 p-4 text-left"><span><strong className="block">Private service account</strong><span className="text-xs text-court-ink/50">Read-only access and offline caching</span></span><ChevronRight className="size-4" /></button>
        <div className="space-y-2"><Label htmlFor="setup-slides-url">First presentation URL</Label><Input id="setup-slides-url" placeholder="https://docs.google.com/presentation/d/..." /></div>
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ReviewItem icon={Wifi} label="Network" value="Heatherdale Clubhouse" />
      <ReviewItem icon={KeyRound} label="Administrator" value="Club Display Admin" />
      <ReviewItem icon={Presentation} label="Content" value="Google Slides" />
      <ReviewItem icon={RefreshCw} label="Automatic refresh" value="Every 2 minutes" />
      <div className="rounded-xl border border-club-gold/30 bg-amber-50 p-4 text-sm text-amber-900 sm:col-span-2"><strong>Demo note:</strong> this walkthrough does not save passwords or connect to a network. The Raspberry Pi build performs these steps locally.</div>
    </div>
  );
}

function ReviewItem({ icon: Icon, label, value }: { icon: typeof Wifi; label: string; value: string }) {
  return <div className="rounded-xl border border-black/10 p-4"><Icon className="mb-3 size-5 text-club-green" /><span className="block text-xs uppercase tracking-wider text-court-ink/40">{label}</span><strong className="mt-1 block">{value}</strong></div>;
}
