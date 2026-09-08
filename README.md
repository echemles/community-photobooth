# Community Photobooth

A simple, tablet-friendly webcam photobooth for community gatherings.

**[Try the live app](https://community-photobooth.hfs2s.app/)**

## One capture, more possibilities

Take **three timed photos** with a large camera preview. Layout, colour, photo effects and optional text then appear directly beside your finished keepsake, updating its preview as you customize. Your strip or postcard is ready to email, send to WhatsApp or print.

Tap **Remix all three** to transform the entire set into a three-panel keepsake. Describe the style by microphone or text; that description replaces the preset completely. Leave the description blank to use Illustrated, Clay or Retro. Review consent before generating. There is no separate AI capture mode.

While AI works, a looping replay of your captured photos provides visual feedback alongside elapsed time and provider stage. Pause the replay at any time; reduced-motion preferences show a still image. You can return to the original keepsake, send it, and revisit your remix while generation continues. Reset clears photos, replay and recipient details.

Designed for iPad Air portrait and landscape, with a large camera preview, progressive controls and full-screen delivery forms. WhatsApp defaults to Spain and includes a country dropdown and numeric keypad. Email has a custom keyboard.

## Run locally

Requires Node.js 22 or newer. No dependency installation is needed for the local demo.

```sh
git clone https://github.com/echemles/community-photobooth.git
cd community-photobooth
npm start
```

Open **http://localhost:4178**. Allow the camera, or select **Try a sample**. Use `PHOTOBOOTH_PORT=4184 npm start` to change the port.

The local demo supports webcam capture, sample sessions, customization and printing. **AI generation, email and WhatsApp require the backend integrations below; the static demo does not connect to the live app's credentials.** Camera access requires localhost or HTTPS.

Voice input uses browser speech recognition, with English and Spanish choices and editable text. Browser support and microphone permission vary; typing remains available. The browser's speech service may process audio.

## Backend integrations

The production app is hosted on hfs2s. This repository includes its photobooth-specific integration source, rather than the entire hosting platform:

- [`integrations/hfs2s`](integrations/hfs2s/README.md): authenticated API, PostgreSQL migrations, Resend delivery, APIMart image generation, Next workspace adapter and regression tests.
- [`integrations/iris`](integrations/iris/README.md): worker for sending queued photos through an existing Iris WhatsApp installation.
- [`publish-workspace.mjs`](publish-workspace.mjs): copies this app into an explicitly selected, existing hfs2s workspace. Requires SSH access, the hfs2s Next scaffold, and a subsequent production build/restart.

All provider credentials stay server-side. No credentials, guest photos, recipient details or production database contents are included in this repository.

## Source map

| File | Purpose |
| --- | --- |
| `index.html` | Progressive capture, remix and delivery screens |
| `app.js` | Webcam, canvas rendering, dictation, keyboards and API client |
| `style.css`, `tablet.css`, `brand.css`, `ipad.css` | Styles, applied in that order |
| `server.mjs` | Local static demo server |
| `assets/` | Fictional AI style examples and their generation prompts |
| `vendor/` | libphonenumber-js browser bundle and upstream MIT license |

## Reliability and privacy

Captures stay in browser memory until the guest chooses to transform or send them. AI submission sends all three photos and the reviewed remix text. APIMart has its own retention policy; local generated-image storage expires after two hours. Delivery queues clear images and recipient details after delivery or expiry.

AI requests reserve an idempotency record before submission. A lost connection does not automatically create another billed portrait. Image retrieval accepts only approved result hosts and disallows redirects. Retrieval errors appear visibly and offer **Check portrait status**. Resend uses a stable idempotency key, while Iris uses leased jobs and transport receipts.

## Validation

```sh
npm run check
```

The integration tests are intended to run in the hfs2s host repository, where their database and authentication adapters exist. They mock providers and do not send messages or incur image-generation charges.

The hosted app has been checked at iPad Air portrait and landscape viewport sizes, including shortened browser heights. Real APIMart image generation and retrieval have been verified. Physical iPad camera, printer and recipient-inbox checks remain manual.

## Third-party assets

Phone parsing uses libphonenumber-js 1.13.12; its MIT license is preserved in [`vendor/`](vendor/). The three style examples are fictional generated portraits; see [`assets/README.md`](assets/README.md) for prompts and provenance.

### Generation latency

The app sends all three photos in capture order, normally resized to 1024×768. It reduces references further if needed to keep their combined encoded size under 7 MB, without omitting a photo. A single APIMart job creates a vertical three-panel strip at 1K (1:2); this is one generation, not three separate billed requests. Output size and processing time are provider-controlled. Completion checks run every two seconds instead of four. The earlier single-photo check completed in about 40 seconds; three-panel timing can differ. Provider queue time remains variable; elapsed time is real, and the replay is clearly labelled as the guest's photos rather than a partial AI result.

## Shared original and remix layout

Original and remixed keepsakes use the same HTML template and export geometry: 600×1800 for a strip or 1200×1800 for a postcard. Every photo is normalized to 1024×768 (4:3). The AI returns one borderless three-row image, which is split and centre-cropped into three tiles in capture order. The app supplies all framing and text: selected colour, capture date, optional guest message, heart and original footer. AI-specific footer text is removed. HTML uses positioned images and text; a canvas using the same geometry produces the emailed, WhatsApp and printed PNG. Provider compliance with the three-row composition still affects the contents of each crop.
