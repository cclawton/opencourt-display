# Committee assistants through MCP

Status: investigation/proposal, 3 November 2026. No MCP server, new permissions,
agent, cloud resource or deployment has been created by this review. GitHub Issues
remains the backlog. This document describes a candidate design, not shipped tools.

Implementation/discovery tracking: [public issue 11](https://github.com/cclawton/opencourt-display/issues/11).

## Recommendation

Offer an optional remote MCP connection to the existing club control plane, using
task-oriented tools and a common policy/service layer shared with the website.
Start with status and explanations, then drafts/previews, then explicit human
approval for publishing. Keep software, OS, account and credential administration
out of the initial committee connector.

The assistant proposes and explains; OpenCourt authenticates, authorises, validates
and executes. No shell, arbitrary HTTP, database or AWS administration tool should
be exposed. Use club-owned deployments and serverless/on-demand operation; do not
introduce a central multi-club service or an always-on agent just for this feature.

## Current generic API (source inspection)

Implementation: `infra/functions/control-api.mjs`, client: `lib/control-api.ts`.

| Surface | Existing routes/behaviour | MCP treatment |
|---|---|---|
| Identity | POST/DELETE `/auth/session`, GET `/auth/me`; Google-admin/Cognito-convenor identity exchanged for a control-room bearer session | Keep the browser flow; add scoped delegated MCP OAuth separately |
| Convenience sign-in | GET `/auth/convenors` exposes the intended enabled-convenor selector | Not an agent identity directory or authorisation mechanism |
| Display inspection | GET `/admin/devices/{id}` exposes desired config, last connection, diagnostics/capabilities and software reports | Project only the fields needed to explain current state |
| Device discovery | Website runtime configuration supplies the display IDs/names; no standalone authenticated GET `/admin/devices` list route was found | Add an authoritative scoped directory; do not let a model supply an arbitrary club or API origin |
| Content library | GET/POST `/admin/content`; PUT/DELETE `/admin/content/{id}`; Google Slides and local image slideshows | Start with list/preview; protect mutations with revisions, policy and approval |
| Image uploads | POST `/admin/content/images/uploads`, upload to short-lived signed URL, POST `/admin/content/{id}/complete` | Server-managed validated asset workflow; never expose signed URLs as public conversational output |
| Older asset/programme surfaces | GET `/admin/assets`, `/admin/programmes`; POST `/admin/assets/uploads` and completion | Avoid exposing duplicate/legacy concepts as committee jargon |
| Display actions | POST `/admin/devices/{id}/actions`: content/programme/image selection, return to schedule, refresh and legacy actions | Bounded task tools resolved to stable IDs, with target/effect preview |
| Scheduling | PUT `/admin/devices/{id}/schedule`, weekly entries/fallback | Propose complete validated schedule/diff, timezone and conflict handling |
| Administration | GET/POST/DELETE convenors; GET `/admin/player-releases`; POST device software request | Exclude from first committee MCP rollout |
| Device transport | Public projected GET `/devices/{id}/config`; device-token status and software GET/POST | Keep this Pi-to-cloud boundary; never reuse device credentials for committee tools |

These are existing HTTP routes, not a versioned OpenAPI contract or implemented
MCP tools. The existing event override does not provide the full dated/expiring
campaign behaviour proposed in issue #6.

### Useful existing protections

- Admin versus convenor enforcement; convenors may select ready content, refresh,
  return to schedule and save schedules, but cannot use private admin extensions.
- Input/schema checks, ready-content checks, image byte/pixel budgets, checksums,
  signed-upload completion checks and source capability checks.
- Device revision checks and an atomic device/audit transaction. Signed software
  verification, local staging, last-known-good playback and software restoration.

### Gaps before agent writes

- Sessions are currently 90-day control-room bearer credentials with saved roles;
  they are not granular delegated MCP grants. Do not copy these tokens into chats
  or use a shared administrator token as an MCP service identity. Define prompt
  revocation and current membership checks for the new grant model.
- Device writes guard against competing writes during a request, but do not bind
  a caller's previously reviewed plan to its expected revision. Add explicit
  caller preconditions. Updating existing library content currently lacks a
  per-content conditional revision contract.
- No durable agent change-plan, independent human approval receipt, general
  idempotency key, multi-step operation journal or cross-device transaction exists.
  Do not claim a chain of successful HTTP calls is atomic.
- Existing audits cover device/schedule/software changes; do not assume equivalent
  actor/client/approval auditing exists for every content or private draft write.
- Remote reporting is not visual proof. Issue #7 covers heartbeat suppression on
  failed content preparation; #8 covers device-local artwork portability; #1 covers
  real screenshot capture. These are dependencies for dependable write outcomes.

## Nontechnical experience

Connection: "Connect OpenCourt" -> club sign-in -> clear permissions such as
"View display status" or "Prepare content" -> short guided examples. No API keys,
AWS access or Pi network access for committee members. Account/plan eligibility
and voice-mode tool support must be checked on the actual ChatGPT/Claude clients;
MCP availability in a text conversation does not establish voice parity.

Example read request: "Are the screens working?" Return names, last report time,
intended content and a qualified outcome: "All three checked in recently; their
physical screens have not been visually verified." Show the as-of time.

Example publication request: "Show the working bee poster on the kitchen screen
until Sunday evening, then return to its normal schedule." Resolve the precise
poster/display, timezone and date. If expiry is not implemented, say so and offer
a supported action; do not simulate it with a promise to remember later.

Before publishing, present the actual artwork, exact targets, start/end times,
before/after changes and effects on schedules. Use names in the interface and
stable IDs internally. Resolve ambiguous names explicitly rather than guessing.

Keep the existing website fully usable when no assistant is connected.

## Proposed tool contract

Names below are illustrative, not shipped endpoints:

| Tool family | Purpose | Authority |
|---|---|---|
| `get_connection`, `list_displays`, `get_display_status`, `list_content` | Identify club/account and explain state | Scoped read access |
| `prepare_display_change`, `prepare_schedule_change` | Validate and save a plan; show preview/diff | Draft permission; no live publication |
| `get_change_plan`, `get_operation` | Review effects and reconcile an existing request | Scoped read; no arbitrary URL fetch |
| `commit_approved_change` | Execute exactly the independently approved plan | Publish scope plus server-verified approval |
| `prepare_restore_previous` | Propose return to a known compatible revision | Same approval and conflict checks |

Draft tools still write state and must not be marked read-only. Tool descriptions,
schemas, maximum sizes, annotations and structured errors should match real
behaviour. Hiding tools by role improves usability but is not access control.

## Approval and stable-state design

1. Read the affected objects and current permissions; resolve names to stable IDs.
2. Construct a bounded deterministic plan. Validate image integrity, capability,
   limits, schedules, timezone and content policy; stage private/expensive work
   without changing live assignments. Bind to the exact artifact hashes/revisions.
3. Store a canonical plan with club, deployment environment, requester, OAuth client,
   actions, affected devices, expected object revisions, expiry and policy version.
4. Send a short-lived approval link to the normal OpenCourt website. Authenticate
   the person there and show the real preview/diff. Approval must be recorded by
   that independent user-facing channel; an agent-supplied `approved: true`, quoted
   speech or chat text is not an approval credential. Client confirmation is useful
   but cannot be the only server-side control across different MCP clients.
5. Commit only that approved plan. Recheck current permissions, policy, object
   versions, expiry and asset hashes. Invalidate changed/stale previews and ask for
   a new review. Use one-use approval, a stable operation ID/idempotency key and
   atomic transition to prevent replay or double execution.
6. Execute through the same domain/policy services as the website. An MCP-only
   guard can be bypassed through old direct routes; new agent permissions must not
   accidentally inherit unrestricted legacy admin authority.
7. Record results per object/device and reconcile Pi-reported revisions separately.
   Show "Saved", "Sent", "Pi reported revision X", "Failed" and "Not confirmed"
   accurately. A later timestamp or screenshot is not proof a physical TV is on.

For a multi-step publication, render/validate every image before switching any
display. Prefer creating a new immutable library revision to changing an active
object in place. A bounded same-store multi-device configuration commit may be
made atomic in a new workflow, but actual TVs still poll/activate separately.
Otherwise record partial completion and use explicit compensating plans. Never
silently retry a conflict with new state or overwrite another volunteer's change.

On timeout, inspect the operation result before retrying. Rollback must be a
new checked revision and cannot undo someone else's later edits. Keep the last
playable images/manifest during failed downloads. Approval of a Google Slides
URL does not freeze its mutable contents: either snapshot approved artwork or
clearly treat ongoing changes as a separate trusted-editor exception.

## Content and responsible-AI controls

- Treat poster text, OCR, filenames, documents, tool results and external links as
  untrusted data. Embedded instructions never grant permissions or approve a plan.
- Server-enforce allowed action/schema/source types, file validation, sizes,
  revision constraints and scopes. No arbitrary HTML/JavaScript or remote fetch.
  Any asset-fetch service needs SSRF controls and a bounded approved source policy.
- AI may suggest wording or artwork, but must not invent prices, honours results,
  event dates, sponsors, availability or permissions. Ask when authoritative facts
  are missing. Separate spelling/layout proposals from changes to factual records.
- Before publication, review club suitability, abusive/discriminatory material,
  misleading claims, private contacts, member/child details, photo permissions and
  unverified announcements. Use configured policy and an authorised human reviewer.
  Automated classification is a supplementary, fallible check, not certification.
- Screens are public. Private editor data must not become public merely because
  an assistant can read it. Send only necessary fields to the model provider;
  explain data sharing and offer a restricted read/draft connection. Do not forward
  committee contact lists, device secrets or raw transcripts by default.
- Record who requested, approved and executed a change, client, objects/revisions,
  policy/validation result and operation outcome. Retain only necessary data with
  an explicit retention policy. Provide connection revocation and an emergency
  switch that disables agent writes while leaving playback and the website usable.

## Authentication and hosting

Use remote MCP over HTTPS/Streamable HTTP, per-user OAuth authorisation code with
PKCE, discovery metadata and issuer/audience/scope validation. Bind grants to a
club/environment and apply least privilege. Do not pass an inbound MCP token to
an API that expects an unrelated browser token. Prefer shared domain services
under verified actor context, or a separate correctly scoped downstream token;
do not lose end-user identity behind a broadly privileged service credential.

The authentication and policy work is a separate design task. Existing Cognito
login does not by itself establish compliant MCP discovery, client registration,
resource audience support or per-tool scopes. Evaluate the supported client
registration approach against both clients before choosing an identity provider
or adding cloud resources. No AWS implementation was reviewed or deployed here.

MCP is optional; an internal model subscription is not needed merely to serve
tools. Committee members use their chosen client; a future server-side moderation
or agent service adds its own costs. Do not promise the existing pilot's monthly
cost will remain unchanged. Measure requests, rendering and storage with limits.

## Robots and phased delivery

A conversational assistant acts under a current user's grant. A scheduled robot
needs a separate named, narrowly scoped automation identity and an explicit stored
policy: targets, approved content, timing, limits, expiry, owner and stop switch.
Start robots with health summaries and reminders. Existing deterministic schedules
should handle routine playback; do not use a model as a clock. Do not give an
unattended agent standing permission to invent and publish new content.

Planning ranges (engineering effort, not delivery promises):

1. Contract/auth/client spike and threat model: 2–4 days. Validate actual client
   account access, OAuth and one read-only tool against a test deployment.
2. Scoped read-only pilot: 3–5 days including device discovery, sanitised results,
   sign-out/revocation checks and client acceptance.
3. Generic draft/approval/publication workflow: 6–10 days including concurrency,
   idempotency, audit, failure recovery and supported on-device acceptance.
4. Private authoring adapters: separately estimate after auditing render/persistence
   boundaries; deterministic artifact rendering is additional work.

Approximately 11–19 engineering days for a small generic end-to-end pilot, plus
elapsed committee testing, authentication uncertainties and dependent fixes. Do
not treat the lower bound as a production commitment or include OS administration.

Test denial of wrong role/device/club/environment, expired/replayed grants and
approvals, changed draft/artwork after approval, prompt injection, ambiguous voice
requests, decimal/price mistakes, malicious files/URLs, retries after lost responses,
partial fleet activation and offline Pis. Test ChatGPT and Claude independently,
and prove the website/manual recovery path still works with MCP disabled.

## Primary references checked

- [MCP authorisation](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP security practices](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices)
- [OpenAI tool/server behaviour](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI OAuth](https://developers.openai.com/plugins/build/auth)
- [Claude remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

Client features, account eligibility and protocol revisions are time-sensitive;
verify them again at implementation. This proposal requires no changes to the
recently accepted appliances.
