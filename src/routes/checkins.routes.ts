import { Router } from 'express';
import * as checkInsController from '../controllers/checkins.controller';
import { validate } from '../middleware/validate';
import { checkInSchema } from '../schemas/checkin.schema';

// Mounted behind the global verifyToken gate in app.ts.
export const checkInsRouter = Router();

checkInsRouter.get('/', checkInsController.listCheckIns);
checkInsRouter.get('/:id', checkInsController.getCheckIn);
checkInsRouter.post('/', validate(checkInSchema), checkInsController.createCheckIn);
checkInsRouter.put('/:id', validate(checkInSchema), checkInsController.updateCheckIn);
checkInsRouter.delete('/:id', checkInsController.deleteCheckIn);
