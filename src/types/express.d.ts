// `verifyToken` attaches the authenticated user's id here. Every service call
// touching user-owned data takes its userId from this field, never the request.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
