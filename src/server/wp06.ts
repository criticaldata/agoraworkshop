import { Router } from 'express';
import { createAuthMiddleware, type AuthConfig } from './auth.js';
import { createAnalysisRouter } from '../phase1a/wp06/preview/app.js';

/** Mount before the application's default JSON parser to preserve WP06's 10 MiB limit. */
export function wp06Router(auth: AuthConfig) {
  const router = Router();
  // Evidence inspection is researcher-scoped, including GETs and synthetic examples.
  router.use(createAuthMiddleware({ ...auth, scope: 'all' }));
  router.use((req, res, next) => {
    // Relative assets and API URLs work both here and in the standalone development app.
    if (req.path === '/' && !req.originalUrl.split('?')[0]!.endsWith('/')) {
      res.redirect(308, `${req.baseUrl}/`); return;
    }
    next();
  });
  router.use(createAnalysisRouter());
  return router;
}
