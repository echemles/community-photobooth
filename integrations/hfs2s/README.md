# hfs2s integration

These files are the photobooth-specific portion of an existing hfs2s control plane. They are **integration source**, not a standalone API server.

## Host dependencies

The services expect the host's `lib/db` PostgreSQL query adapter, `services/mailer.fromAddress`, app-credential identification through `services/email.identify`, and the approved-account authentication gate. They use the host's Express, Zod, pg, TypeScript and Vitest packages.

Copy `services/` into the host's `src/services/`, `routes/` into `src/routes/`, `tests/` into `src/__tests__/`, and `migrations/` into its migrations directory. Apply the migrations with the host's migration runner. Mount the photobooth router **after** the default-deny approved-account gate. Allow sufficient JSON body size for a PNG up to 5 MB, encoded as base64.

Set these in the control plane's secret environment:

| Variable | Purpose |
| --- | --- |
| `PHOTOBOOTH_WORKSPACE_ID` | Authorized photobooth workspace |
| `PHOTOBOOTH_OWNER_EMAIL` | Exact authorized workspace owner |
| `HFS2S_DATABASE_URL` | PostgreSQL connection |
| `MAIL_API_URL` | `https://api.resend.com/emails` |
| `MAIL_API_KEY` | Resend API key |
| `MAIL_FROM` | Sender configured by the host mailer |
| `API_MART_API_KEY` | APIMart API key (`APIMART_API_KEY` also accepted) |

The workspace receives only its own `HFS2S_MAIL_KEY`, never billed provider keys. Adapt the origin allowlist in `workspace-module.ts` if using another domain. The exported authorization configuration uses environment variables; the live deployment's fixed identity is not included.

## Workspace publishing

From the repository root:

```sh
HFS2S_SSH_HOST=your-host-alias node publish-workspace.mjs YOUR_WORKSPACE_ID
```

The script targets only an existing eight-character workspace id. It installs the page, assets, CSS and workspace API adapter into the existing Next scaffold. Build and typecheck the selected workspace, then restart its Next process. `devIndicators: false` is required. Changes to the host API require the host's checks and control-plane restart too.

## API routes

The workspace exposes `POST /api/photobooth/send`, `GET /api/photobooth/status?id=…`, `GET /api/photobooth/ai-config`, `POST /api/photobooth/ai-start`, and `GET /api/photobooth/ai-status?id=…`.

The host additionally exposes authenticated Iris outbox and acknowledgement routes. All requests require the selected app's credential; public callers reach them through the workspace adapter.

APIMart uses `gpt-image-2` with one PNG reference and `n: 1`, `size: "3:4"`, `resolution: "1k"`. New references are resized to 1024×768; 1280×960 remains accepted for existing sessions. Result hosts are limited to `upload.apimart.ai` and `getapib.org`, the latter observed in authenticated provider results. Unknown image hosts fail visibly rather than allowing arbitrary fetches. Retrieving a completed image does not submit another generation.

The Iris poller triggers expiry cleanup every five seconds. Deploy an equivalent scheduled cleanup calling both services' `cleanup()` functions if running without Iris.
