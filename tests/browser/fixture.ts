import { test as base, expect } from '@playwright/test';

export const titles = [
  'Saturday Morning',
  'Saturday Afternoon',
  'Monday Night',
  'Tuesday Mid-week Ladies',
  'Tuesday Night',
  'Wednesday Night',
  'Thursday Mid-week Ladies',
  'Thursday Night',
  'Honours Board',
];
export const test = base.extend<{
  actorRole: 'admin' | 'convenor';
  room: {
    writes: {
      method: string;
      path: string;
      body: Record<string, unknown> | null;
    }[];
    fail: (error: string) => void;
  };
}>({
  actorRole: ['admin', { option: true }],
  room: async ({ page, baseURL, actorRole }, provide) => {
    let content = titles.map((title, i) => ({
      contentId: `fixture-${i}`,
      title,
      type: i === 8 ? 'image' : 'slideshow',
      provider: i === 8 ? 'image' : 'google_slides',
      status: 'ready',
      source: {
        type: i === 8 ? 'image' : 'google_slides',
        url:
          i === 8
            ? `${baseURL}/fixture.jpg`
            : `https://docs.google.com/presentation/d/fixture-${i}/pub`,
      },
      width: i === 8 ? 3840 : null,
      height: i === 8 ? 2160 : null,
    }));
    const initialSelection: { contentId?: string; kind: string } = {
      contentId: content[8].contentId,
      kind: 'content',
    };
    let device = {
      deviceId: 'honours-board-tv',
      revision: 1,
      source: content[8].source,
      activeSelection: initialSelection,
      lastConnectedAt: '2026-10-03T01:02:03.000Z',
      diagnostics: {
        hardware: {
          model: 'Raspberry Pi 5 Model B',
          architecture: 'aarch64',
          cpuCount: 4,
          memoryMiB: 4096,
          storageTotalGiB: 32,
          storageFreeGiB: 20,
        },
        system: {
          hostname: 'opencourt-honours',
          operatingSystem: 'Raspberry Pi OS',
          kernel: '6.6.0',
          uptimeSeconds: 3600,
          playerVersion: '2026-10-03',
        },
        network: { primaryIp: '192.168.1.42' },
        revision: 1,
      },
      mode: 'manual',
      schedule: undefined as
        | undefined
        | {
            timezone: 'Australia/Melbourne';
            fallback: (typeof content)[number];
            entries: {
              day: string;
              startTime: string;
              endTime: string;
              contentId: string;
              title: string;
              source: (typeof content)[number]['source'];
            }[];
          },
    };
    const writes: {
      method: string;
      path: string;
      body: Record<string, unknown> | null;
    }[] = [];
    let failure = '';
    let pendingImage: (typeof content)[number] | undefined;
    let apiOrigin = '';
    const unexpected: string[] = [];
    // One fail-closed router: no API or upload write can reach production.
    await page.context().route('**/*', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const method = req.method();
      if (
        process.env.BROWSER_TEST_LOCAL === '1' &&
        url.pathname === '/runtime-config.js'
      )
        return route.fulfill({
          contentType: 'application/javascript',
          body: `window.OPENCOURT_WEB_CONFIG={apiBaseUrl:'https://api.fixture.invalid',googleClientId:'fixture.apps.googleusercontent.com',deviceId:'honours-board-tv',devices:[{deviceId:'honours-board-tv',name:'Bar Room TV'},{deviceId:'opencourt-kitchen',name:'Kitchen TV'}],cognitoUserPoolId:'ap-southeast-2_fixture',cognitoUserPoolClientId:'fixture-client'};`,
        });
      if (url.hostname === 'accounts.google.com') {
        if (url.pathname === '/gsi/client')
          return route.fulfill({
            contentType: 'application/javascript',
            body: `window.google={accounts:{id:{initialize(o){window.fixtureCallback=o.callback},renderButton(el){const b=document.createElement('button');b.textContent='Test committee sign in';b.onclick=()=>window.fixtureCallback({credential:'fixture-not-a-real-token'});el.appendChild(b)},disableAutoSelect(){}}}};`,
          });
        return route.abort();
      }
      if (url.pathname === '/fixture-upload/image.png' && method === 'PUT') {
        if (!req.headers()['x-amz-checksum-sha256'])
          unexpected.push('Missing SHA-256 checksum header on signed upload');
        return route.fulfill({ status: 200 });
      }
      if (url.pathname === '/auth/session' && method === 'POST') {
        if (req.headers().authorization !== 'Bearer fixture-not-a-real-token')
          unexpected.push('Missing Google authorization for session exchange');
        return route.fulfill({
          status: 201,
          json: {
            token: 'ocs_fixture-session',
            expiresAt: '2027-01-01T00:00:00.000Z',
          },
        });
      }
      if (url.pathname === '/auth/session' && method === 'DELETE')
        return route.fulfill({ json: { deleted: true } });
      if (url.pathname === '/auth/convenors' && method === 'GET')
        return route.fulfill({ json: { convenors: [] } });
      if (url.pathname === '/auth/me' && method === 'GET')
        return route.fulfill({
          json: {
            actor: {
              name: 'Club Admin',
              email: 'admin@example.test',
              role: actorRole,
            },
          },
        });
      if (url.pathname.startsWith('/admin/')) {
        apiOrigin = url.origin;
        if (req.headers().authorization !== 'Bearer ocs_fixture-session')
          unexpected.push('Missing fixture authorization');
        const body = req.postDataJSON();
        if (method !== 'GET') writes.push({ method, path: url.pathname, body });
        if (failure) {
          const error = failure;
          failure = '';
          return route.fulfill({ status: 409, json: { error } });
        }
        if (method === 'GET' && url.pathname === '/admin/content')
          return route.fulfill({ json: { content } });
        if (method === 'GET' && url.pathname === '/admin/convenors')
          return route.fulfill({ json: { convenors: [] } });
        if (
          method === 'GET' &&
          /^\/admin\/devices\/[^/]+$/.test(url.pathname)
        ) {
          const deviceId = decodeURIComponent(url.pathname.split('/').at(-1)!);
          return route.fulfill({
            json: {
              device:
                deviceId === 'opencourt-kitchen'
                  ? {
                      ...device,
                      deviceId,
                      lastConnectedAt: '2026-10-03T02:25:37.296Z',
                      diagnostics: {
                        ...device.diagnostics,
                        hardware: {
                          ...device.diagnostics.hardware,
                          model: 'Raspberry Pi 400 Rev 1.1',
                        },
                        system: {
                          ...device.diagnostics.system,
                          hostname: 'opencourt-kitchen',
                        },
                        network: { primaryIp: '192.168.4.87' },
                      },
                    }
                  : device,
            },
          });
        }
        if (method === 'PUT' && url.pathname.endsWith('/schedule')) {
          const fallback = content.find(
            (item) => item.contentId === body.fallbackContentId,
          )!;
          device = {
            ...device,
            revision: device.revision + 1,
            schedule: {
              timezone: 'Australia/Melbourne',
              fallback,
              entries: body.entries.map(
                (entry: {
                  day: string;
                  startTime: string;
                  endTime: string;
                  contentId: string;
                }) => ({
                  ...entry,
                  ...content.find((item) => item.contentId === entry.contentId),
                }),
              ),
            },
          };
          return route.fulfill({ json: { device } });
        }
        if (method === 'POST' && url.pathname.endsWith('/actions')) {
          if (body.action === 'show_content') {
            const selected = content.find(
              (c) => c.contentId === body.contentId,
            )!;
            device = {
              ...device,
              source: selected.source,
              activeSelection: {
                contentId: selected.contentId,
                kind: 'content',
              },
            };
          }
          if (body.action === 'return_to_schedule') {
            device = {
              ...device,
              mode: 'schedule',
              activeSelection: { kind: 'schedule' },
            };
          }
          device.revision++;
          return route.fulfill({ json: { device } });
        }
        if (method === 'POST' && url.pathname === '/admin/content') {
          const item = {
            ...content[0],
            contentId: 'fixture-new',
            title: body.title,
            source: { type: 'google_slides', url: body.url },
          };
          content.push(item);
          return route.fulfill({ json: { content: item } });
        }
        if (
          method === 'POST' &&
          url.pathname === '/admin/content/images/uploads'
        ) {
          pendingImage = {
            ...content[8],
            contentId: body.contentId || 'fixture-upload',
            title: body.title,
            width: body.width,
            height: body.height,
          };
          return route.fulfill({
            json: {
              content: pendingImage,
              // Reuse the permitted API origin so this mocked signed upload
              // remains valid under the deployed CloudFront CSP.
              uploadUrl: `${apiOrigin}/fixture-upload/image.png`,
              uploadHeaders: {
                'x-amz-checksum-sha256': Buffer.from(
                  body.sha256,
                  'hex',
                ).toString('base64'),
              },
            },
          });
        }
        if (
          method === 'POST' &&
          pendingImage &&
          url.pathname === `/admin/content/${pendingImage.contentId}/complete`
        ) {
          content = [
            ...content.filter((c) => c.contentId !== pendingImage!.contentId),
            pendingImage,
          ];
          return route.fulfill({ json: { content: pendingImage } });
        }
        const item = content.find(
          (c) => url.pathname === `/admin/content/${c.contentId}`,
        );
        if (item && method === 'PUT') {
          Object.assign(
            item,
            { title: body.title },
            body.url
              ? { source: { type: 'google_slides', url: body.url } }
              : {},
          );
          return route.fulfill({ json: { content: item } });
        }
        if (item && method === 'DELETE') {
          content = content.filter((c) => c !== item);
          return route.fulfill({ json: { deleted: true } });
        }
        unexpected.push(`${method} ${url.pathname}`);
        return route.abort();
      }
      if (
        !['GET', 'HEAD'].includes(method) ||
        url.origin !== new URL(baseURL!).origin
      ) {
        unexpected.push(`${method} ${url.origin}${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Test committee sign in' }).click();
    await expect(page.getByLabel('Choose what to show')).toHaveValue(
      'fixture-8',
    );
    await provide({
      writes,
      fail: (error) => {
        failure = error;
      },
    });
    expect(unexpected, 'Requests not handled by the isolated fixture').toEqual(
      [],
    );
  },
});
export { expect };
