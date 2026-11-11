// PUT /me/kip-colour (spec 2026-10-13 KIP colour §2). Logs nothing about the user.

import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../auth/middleware';
import { prisma } from '../db/client';
import { isKipColour } from './colours';

export const kipRouter = Router();

kipRouter.put('/me/kip-colour', requireAuth, async (req: AuthedRequest, res) => {
  const colour: unknown = req.body?.colour;
  if (!isKipColour(colour)) {
    res.status(400).json({ error: 'invalid_colour' });
    return;
  }
  await prisma.user.update({ where: { id: req.userId! }, data: { kipColour: colour } });
  res.set('Cache-Control', 'private, no-store');
  res.json({ kipColour: colour });
});
