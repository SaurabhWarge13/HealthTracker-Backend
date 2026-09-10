import type { RequestHandler } from 'express';
import * as authService from '../services/auth.service';

export const signup: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await authService.signup(req.body));
  } catch (err) {
    next(err);
  }
};

// 201, because this is the request that creates the user.
export const verifyOtp: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await authService.verifyOtp(req.body));
  } catch (err) {
    next(err);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(await authService.login(req.body));
  } catch (err) {
    next(err);
  }
};

export const refresh: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(await authService.refresh(req.body.refreshToken));
  } catch (err) {
    next(err);
  }
};

export const logout: RequestHandler = async (req, res, next) => {
  try {
    await authService.logout(req.userId!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
