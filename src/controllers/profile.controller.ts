import type { RequestHandler } from 'express';
import * as profileService from '../services/profile.service';

export const getProfile: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(await profileService.getProfile(req.userId!));
  } catch (err) {
    next(err);
  }
};

export const upsertProfile: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(await profileService.upsertProfile(req.userId!, req.body));
  } catch (err) {
    next(err);
  }
};
