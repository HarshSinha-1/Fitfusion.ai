import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): Response | void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));

      return res.status(422).json({
        success: false,
        message: 'Validation failed. Please check the highlighted fields.',
        errors,
      });
    }

    req.body = result.data;
    next();
  };
}