import { Request, Response, NextFunction } from 'express';

export function requireInternalSecret(req: Request, res: Response, next: NextFunction) {
  const secretHeader = req.headers['x-internal-secret'];
  const expectedSecret = process.env.INTERNAL_API_SECRET;

  if (!expectedSecret || secretHeader !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized: Invalid internal secret' });
  }

  next();
}
