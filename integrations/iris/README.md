# Iris WhatsApp bridge

This worker plugs into an **existing Iris installation**. Iris itself and its WhatsApp credentials are not part of this repository.

Place `community-photobooth.js` beside Iris's `config.js` and `jid.js`. It imports `OUTBOX_DIR` and `slug` from those modules. Store the photobooth app credential in `~/.config/iris/community-photobooth.key` with mode `0600`. Adapt the API origin in the worker for your deployment.

The included systemd service is an example; adjust the Node and Iris paths for your installation.

## Required Iris outbox contract

The installed Iris consumer must:

1. Accept private image actions with `source: 'community-photobooth'`, the image path, caption and destination chat.
2. Honor `expiresAt` before sending and keep the payload out of the general message feed and logs.
3. Write `photobooth-<externalId>.sent` only after a successful WhatsApp transport receipt; deduplicate using that receipt.
4. Mark failed job files with `.failed` and remove private image files after successful delivery or expiry.

The worker polls a leased PostgreSQL outbox, creates private transport files, waits for the receipt, then acknowledges the lease. It does not claim success merely because a file was queued. It deletes only its own explicitly named temporary files.

The original deployment also uses Iris for other applications. Deployment-specific patches for those applications are intentionally not bundled here; implement this contract against your Iris version.
