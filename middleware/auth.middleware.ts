/**
 * auth.middleware.ts
 * JWT authentication middleware.
 * Attaches decoded user payload to req.user on success.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;

export interface AuthenticatedRequest extends Request {
  user: {
    id:    string;
    email: string;
  };
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authorization header missing or malformed.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, JWT_ACCESS_SECRET) as {
      sub:   string;
      email: string;
    };

    (req as AuthenticatedRequest).user = {
      id:    payload.sub,
      email: payload.email,
    };

    next();
  } catch (err: any) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Access token has expired.'
        : 'Invalid access token.';

    return res.status(401).json({ success: false, message });
  }
}