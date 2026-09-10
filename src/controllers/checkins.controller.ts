import type { RequestHandler } from 'express';
import * as checkInsService from '../services/checkins.service';

export const listCheckIns: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(await checkInsService.listCheckIns(req.userId!));
  } catch (err) {
    next(err);
  }
};

export const getCheckIn: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(await checkInsService.getCheckIn(req.userId!, req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const createCheckIn: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await checkInsService.createCheckIn(req.userId!, req.body));
  } catch (err) {
    next(err);
  }
};

export const updateCheckIn: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(await checkInsService.updateCheckIn(req.userId!, req.params.id!, req.body));
  } catch (err) {
    next(err);
  }
};

export const deleteCheckIn: RequestHandler = async (req, res, next) => {
  try {
    await checkInsService.deleteCheckIn(req.userId!, req.params.id!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
