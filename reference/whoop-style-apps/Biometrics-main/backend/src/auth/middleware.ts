import { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth';
import { prisma } from '../db/client';

export interface AuthedRequest extends Request {
  userId?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.headers.cookie && !req.headers.authorization) {
    res.status(401).json({ error: 'Missing session' });
    return;
  }
  // Sessions live in the database and are deleted with their user, so a found
  // session always belongs to an existing user.
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    // getSession can report "no session" when the database is unreachable. A
    // 401 would make the app sign the user out for our outage, so confirm the
    // database answers first: if it does not, this throws and Express sends a
    // 500.
    await prisma.$queryRaw`SELECT 1`;
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  req.userId = session.user.id;
  next();
}
