'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageIcon, Monitor, Pencil, Presentation, RefreshCw, Trash2, Upload } from 'lucide-react';

import { GoogleSignIn, signOutGoogle } from '@/components/google-sign-in';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createSlideshowContent,
  deleteContent,
  issueDeviceAction,
  loadControlRoomState,
  updateContent,
  uploadContentImage,
  type RemoteContent,
  type RemoteDevice,
} from '@/lib/control-api';
import type { RuntimeConfig } from '@/lib/runtime-config';

type Section = 'displays' | 'content';
type Editor = { mode: 'create-slideshow' | 'create-image' | 'edit'; contentId?: string } | null;

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  const messages: Record<string, string> = {
    content_is_currently_on_a_display: 'Choose different content for the TV before deleting this item.',
    invalid_google_slides_url: 'Paste a valid Google Slides sharing or published URL.',
    invalid_content_title: 'Enter a title between 2 and 100 characters.',
    uploaded_image_does_not_match: 'The uploaded image could not be verified. Please choose it again.',
    display_changed_retry: 'Someone else changed the TV at the same time. Please try again.',
  };
  return messages[message] ?? message.replaceAll('_', ' ');
}

function imageDimensions(file: File) {
  return createImageBitmap(file).then((bitmap) => {
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  });
}

export function DeployedControlRoom({ config }: { config: RuntimeConfig }) {
  const [token, setToken] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('displays');
  const [content, setContent] = useState<RemoteContent[]>([]);
  const [device, setDevice] = useState<RemoteDevice | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Editor>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async (credential: string) => {
    setError('');
    try {
      const state = await loadControlRoomState(config, credential);
      setContent(state.content);
      setDevice(state.device);
      setSelectedId((current) => current || state.device.activeSelection?.contentId || state.content.find((item) => item.source?.url === state.device.source.url)?.contentId || state.content[0]?.contentId || '');
    } catch (loadError) {
      setError(friendlyError(loadError));
    }
  }, [config]);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  const currentContent = useMemo(
    () => content.find((item) => item.contentId === device?.activeSelection?.contentId)
      ?? content.find((item) => item.source?.url === device?.source.url),
    [content, device],
  );
  const slideshows = content.filter((item) => item.type === 'slideshow');
  const images = content.filter((item) => item.type === 'image');

  const run = useCallback(async (operation: () => Promise<void>, success: string) => {
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
  }, [load, token]);

  function closeEditor() {
    setEditor(null);
    setTitle('');
    setUrl('');
    setFile(null);
  }

  function startEdit(item: RemoteContent) {
    setEditor({ mode: 'edit', contentId: item.contentId });
    setTitle(item.title);
    setUrl(item.type === 'slideshow' ? item.source?.url ?? '' : '');
    setFile(null);
  }

  async function saveEditor() {
    if (!token || !editor) return;
    if (editor.mode === 'create-slideshow') {
      await run(async () => { await createSlideshowContent(config, token, title, url); closeEditor(); }, 'Slideshow added.');
      return;
    }
    if (editor.mode === 'create-image') {
      if (!file) {
        setError('Choose a JPEG or PNG image.');
        return;
      }
      await run(async () => {
        const dimensions = await imageDimensions(file);
        await uploadContentImage(config, token, title || file.name, file, dimensions);
        closeEditor();
      }, 'Image added.');
      return;
    }
    const item = content.find((candidate) => candidate.contentId === editor.contentId);
    if (!item) return;
    await run(async () => {
      await updateContent(config, token, item.contentId, { title, ...(item.type === 'slideshow' ? { url } : {}) });
      closeEditor();
    }, 'Content updated.');
  }

  async function replaceImage(item: RemoteContent, replacement: File) {
    if (!token) return;
    if (!['image/jpeg', 'image/png'].includes(replacement.type) || replacement.size > 20 * 1024 * 1024) {
      setError('Choose a JPEG or PNG no larger than 20 MB.');
      return;
    }
    await run(async () => {
      const dimensions = await imageDimensions(replacement);
      await uploadContentImage(config, token, item.title, replacement, dimensions, item.contentId);
    }, `${item.title} replaced.`);
  }

  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center bg-court-ink px-4 text-court-ink">
        <Card className="w-full max-w-md border-0 bg-white ring-0">
          <CardHeader>
            <div className="mb-3 grid size-11 place-items-center rounded-full bg-tennis font-black">OC</div>
            <CardTitle className="font-display text-2xl">OpenCourt</CardTitle>
            <CardDescription>Sign in with the club Google account to control the TVs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GoogleSignIn clientId={config.googleClientId} onCredential={(credential) => { setToken(credential); void load(credential); }} />
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
            <div className="grid size-9 place-items-center rounded-full bg-tennis text-sm font-black text-court-ink">OC</div>
            <div>
              <p className="font-display font-bold">OpenCourt</p>
              <p className="text-xs text-white/55">Heatherdale Tennis Club</p>
            </div>
          </div>
          <Button className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => { signOutGoogle(); setToken(null); setContent([]); setDevice(null); }} variant="outline">Sign out</Button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-9">
        <nav aria-label="Control room sections" className="mb-6 inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5">
          <button className={`rounded-lg px-5 py-2 text-sm font-bold ${section === 'displays' ? 'bg-club-green text-white' : 'text-court-ink/60 hover:text-court-ink'}`} onClick={() => setSection('displays')}>Displays</button>
          <button className={`rounded-lg px-5 py-2 text-sm font-bold ${section === 'content' ? 'bg-club-green text-white' : 'text-court-ink/60 hover:text-court-ink'}`} onClick={() => setSection('content')}>Content</button>
        </nav>

        {(message || error) && (
          <output className={`mb-5 block rounded-xl px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'}`}>
            {error || message}
          </output>
        )}

        {section === 'displays' ? (
          <Card className="border-0 bg-white ring-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl"><Monitor className="text-club-green" /> Clubhouse TV</CardTitle>
              <CardDescription>Currently showing: <strong className="text-court-ink">{currentContent?.title ?? device?.activeSelection?.name ?? 'Unknown'}</strong></CardDescription>
            </CardHeader>
            <CardContent className="max-w-xl space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display-content">Choose what to show</Label>
                <select className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-sm" id="display-content" onChange={(event) => setSelectedId(event.target.value)} value={selectedId}>
                  <option disabled value="">Choose content</option>
                  <optgroup label="Slideshows">
                    {slideshows.map((item) => <option key={item.contentId} value={item.contentId}>{item.title}</option>)}
                  </optgroup>
                  <optgroup label="Still images">
                    {images.map((item) => <option key={item.contentId} value={item.contentId}>{item.title}</option>)}
                  </optgroup>
                </select>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="bg-club-green text-white hover:bg-club-green/90" disabled={busy || !selectedId} onClick={() => run(async () => {
                  const updated = await issueDeviceAction(config, token, { action: 'show_content', contentId: selectedId });
                  setDevice(updated);
                }, 'TV updated. The new content should appear within one minute.')}>
                  <Monitor /> Show on TV
                </Button>
                <Button disabled={busy} onClick={() => run(async () => {
                  const updated = await issueDeviceAction(config, token, { action: 'refresh' });
                  setDevice(updated);
                }, 'TV refresh requested. It should reload within one minute.')} variant="outline">
                  <RefreshCw className={busy ? 'animate-spin' : ''} /> Refresh TV
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h1 className="font-display text-2xl font-black">Content</h1>
                <p className="text-sm text-court-ink/55">Manage the slideshows and still images available to every display.</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => { closeEditor(); setEditor({ mode: 'create-slideshow' }); }} variant="outline"><Presentation /> Add slideshow</Button>
                <Button className="bg-club-green text-white hover:bg-club-green/90" onClick={() => { closeEditor(); setEditor({ mode: 'create-image' }); }}><ImageIcon /> Add image</Button>
              </div>
            </div>

            {editor && (
              <Card className="border-club-green/30 bg-white ring-1 ring-club-green/10">
                <CardHeader>
                  <CardTitle className="text-lg">{editor.mode === 'create-slideshow' ? 'Add slideshow' : editor.mode === 'create-image' ? 'Add image' : 'Edit content'}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="content-title">Title</Label>
                    <Input id="content-title" onChange={(event) => setTitle(event.target.value)} placeholder={editor.mode === 'create-image' ? 'Honours Board' : 'Saturday Morning'} value={title} />
                  </div>
                  {(editor.mode === 'create-slideshow' || (editor.mode === 'edit' && content.find((item) => item.contentId === editor.contentId)?.type === 'slideshow')) && (
                    <div className="space-y-2">
                      <Label htmlFor="content-url">Google Slides URL</Label>
                      <Input id="content-url" onChange={(event) => setUrl(event.target.value)} placeholder="https://docs.google.com/presentation/d/..." value={url} />
                    </div>
                  )}
                  {editor.mode === 'create-image' && (
                    <div className="space-y-2">
                      <Label htmlFor="content-file">Image file</Label>
                      <Input accept="image/jpeg,image/png" id="content-file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" />
                      <p className="text-xs text-court-ink/45">JPEG or PNG, up to 20 MB.</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button className="bg-club-green text-white hover:bg-club-green/90" disabled={busy} onClick={() => void saveEditor()}>Save</Button>
                    <Button disabled={busy} onClick={closeEditor} variant="outline">Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-0 bg-white ring-0">
              <CardContent className="divide-y divide-black/5 p-0">
                {content.map((item) => {
                  const active = currentContent?.contentId === item.contentId;
                  return (
                    <article className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between" key={item.contentId}>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-green-50 text-club-green">{item.type === 'slideshow' ? <Presentation className="size-5" /> : <ImageIcon className="size-5" />}</div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-bold">{item.title}</p>
                            {active && <Badge className="bg-club-green text-white">On TV</Badge>}
                          </div>
                          <p className="text-xs text-court-ink/45">{item.type === 'slideshow' ? 'Slideshow' : item.width && item.height ? `Still image · ${item.width}×${item.height}` : 'Still image'}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button disabled={busy} onClick={() => startEdit(item)} size="sm" variant="outline"><Pencil /> Edit</Button>
                        {item.type === 'image' && (
                          <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-medium hover:bg-stone-50">
                            <Upload className="size-4" /> Replace
                            <input accept="image/jpeg,image/png" className="sr-only" disabled={busy} onChange={(event) => {
                              const replacement = event.target.files?.[0];
                              if (replacement) void replaceImage(item, replacement);
                              event.target.value = '';
                            }} type="file" />
                          </label>
                        )}
                        <Button disabled={busy || active} onClick={() => {
                          if (!window.confirm(`Delete “${item.title}”?`)) return;
                          void run(async () => { await deleteContent(config, token, item.contentId); }, `${item.title} deleted.`);
                        }} size="sm" variant="outline"><Trash2 /> Delete</Button>
                      </div>
                    </article>
                  );
                })}
                {!content.length && <p className="p-6 text-sm text-court-ink/50">No content has been added yet.</p>}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
