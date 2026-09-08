import { Router } from 'express';
import { z } from 'zod';
import * as email from '../services/email.js';
import * as photos from '../services/photobooth.js';
import * as ai from '../services/photoboothAi.js';
const router = Router();
// Mounted after requireAuth: this additionally limits the relay to the one booth.
router.use('/api/photobooth', (req, res, next) => {
  const key = req.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const identity = key ? email.identify(key) : null;
  if (identity?.scope !== 'app' || identity.workspaceId !== photos.WORKSPACE_ID || !photos.OWNER_EMAIL || identity.owner !== photos.OWNER_EMAIL)
    return res.status(403).json({ error: 'A Community Photobooth app credential is required.', code: 'photo_app_required' });
  res.set('Cache-Control', 'no-store'); next();
});
router.get('/api/photobooth/ai/config', (_req, res) => res.json(ai.config()));
router.post('/api/photobooth/ai/start', async (req, res) => res.json(await ai.start(ai.startSchema.parse(req.body))));
router.get('/api/photobooth/ai/status/:id', async (req, res) => res.json(await ai.status(z.string().uuid().parse(req.params.id))));
router.post('/api/photobooth/send', async (req, res) => res.json(await photos.send(photos.sendSchema.parse(req.body))));
router.get('/api/photobooth/status/:id', async (req, res) => res.json(await photos.status(z.string().uuid().parse(req.params.id))));
router.post('/api/photobooth/outbox', async (_req, res) => { await ai.cleanup(); res.json(await photos.outbox()); });
router.post('/api/photobooth/delivery', async (req, res) => res.json(await photos.acknowledge(photos.receiptSchema.parse(req.body))));
router.use('/api/photobooth', (err: unknown, _req: import('express').Request, res: import('express').Response, _next: import('express').NextFunction) => {
  if (err instanceof z.ZodError) return res.status(422).json({ error: 'Check the recipient and use a photobooth PNG under 5 MB.', code: 'invalid_photo_delivery' });
  if (err instanceof photos.PhotoError) return res.status(err.status).json({ error: err.message, code: err.code });
  return res.status(503).json({ error: 'Sending is temporarily unavailable. Your photo is still here.', code: 'photo_unavailable' });
});
export default router;
