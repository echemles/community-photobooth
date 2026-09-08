# Community Photobooth

A simple, tablet-friendly webcam photobooth for community gatherings.

**[Try the live app](https://community-photobooth.hfs2s.app/)**

## One capture, more possibilities

Choose a layout, colour, photo effect and optional text, then take **three timed photos**. Your strip or postcard is immediately ready to email, send to WhatsApp or print.

Tap **Remix a photo** to choose a favourite from those three shots. Select Illustrated, Clay or Retro, optionally describe a twist by voice or text, then review consent before generating. There is no separate AI capture mode.

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

Captures stay in browser memory until the guest chooses to transform or send them. AI submission sends one image and the reviewed remix text. APIMart has its own retention policy; local generated-image storage expires after two hours. Delivery queues clear images and recipient details after delivery or expiry.

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

The app sends only the selected photo, resized to 1024×768, and requests one portrait at APIMart's lowest tier, 1K (3:4). Although its documentation lists 768×1024, the live test returned 1086×1448; output size is provider-controlled, so no fixed pixel reduction or generation speedup is promised. Completion checks run every two seconds instead of four. The live end-to-end check completed in about 40 seconds. Provider queue time remains variable; elapsed time is real, and the replay is clearly labelled as the guest's photos rather than a partial AI result.
