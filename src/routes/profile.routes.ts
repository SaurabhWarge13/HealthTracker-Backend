import { Router } from 'express';
import * as profileController from '../controllers/profile.controller';
import { validate } from '../middleware/validate';
import { upsertProfileSchema } from '../schemas/profile.schema';

// Mounted behind the global verifyToken gate in app.ts.
export const profileRouter = Router();

profileRouter.get('/', profileController.getProfile);
profileRouter.put('/', validate(upsertProfileSchema), profileController.upsertProfile);
