import cors from 'cors';
import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { verifyToken } from './middleware/verifyToken';
import { authRouter } from './routes/auth.routes';
import { checkInsRouter } from './routes/checkins.routes';
import { devRouter, failNextMiddleware, latencyMiddleware } from './routes/dev.routes';
import { profileRouter } from './routes/profile.routes';

export function createApp() {
  const app = express();

  // Wide open by design: the client is a mobile app, not a browser.
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // Before the demo middleware, so the toggles stay reachable and never
  // trigger themselves.
  app.use('/dev', devRouter);

  app.use(latencyMiddleware);
  app.use(failNextMiddleware);

  // Unprotected — /auth/logout applies verifyToken per-route internally.
  app.use('/auth', authRouter);

  // Everything below this line requires a valid access token.
  app.use(verifyToken);
  app.use('/profile', profileRouter);
  app.use('/checkins', checkInsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
