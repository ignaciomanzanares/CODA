// Type augmentation for Express Request
import { TokenPayload } from '../middleware/auth.js';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export {};
