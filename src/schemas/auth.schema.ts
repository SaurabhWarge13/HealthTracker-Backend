import { z } from 'zod';

export const signupSchema = z.object({
  email: z.email('Must be a valid email address').trim().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const verifyOtpSchema = z.object({
  email: z.email('Must be a valid email address').trim().toLowerCase(),
  code: z.string().regex(/^\d{4}$/, 'Enter the 4-digit code'),
});

export const loginSchema = z.object({
  email: z.email('Must be a valid email address').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
