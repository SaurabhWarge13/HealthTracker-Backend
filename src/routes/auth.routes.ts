import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { verifyToken } from '../middleware/verifyToken';
import {
  loginSchema,
  refreshSchema,
  signupSchema,
  verifyOtpSchema,
} from '../schemas/auth.schema';

export const authRouter = Router();

authRouter.post('/signup', validate(signupSchema), authController.signup);
authRouter.post('/verify-otp', validate(verifyOtpSchema), authController.verifyOtp);
authRouter.post('/login', validate(loginSchema), authController.login);
authRouter.post('/refresh', validate(refreshSchema), authController.refresh);

// `/auth` is mounted ahead of the global verifyToken gate, so logout — which
// does require a valid access token — applies the gate per-route.
authRouter.post('/logout', verifyToken, authController.logout);
