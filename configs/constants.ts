/**
 * constants.ts
 * Shared constants used across the application.
 */

export const HTTP = {
  OK:           200,
  CREATED:      201,
  BAD_REQUEST:  400,
  UNAUTHORIZED: 401,
  FORBIDDEN:    403,
  NOT_FOUND:    404,
  CONFLICT:     409,
  GONE:         410,
  UNPROCESSABLE: 422,
  INTERNAL:     500,
} as const;

/** Fitness level band labels (matches scroller on register page) */
export const FITNESS_LEVELS: Record<number, string> = {
  1: 'Beginner',
  2: 'Beginner',
  3: 'Beginner',
  4: 'Intermediate',
  5: 'Intermediate',
  6: 'Intermediate',
  7: 'Advanced',
  8: 'Advanced',
  9: 'Advanced',
};