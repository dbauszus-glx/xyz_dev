import express from 'express';
import { resolve } from 'node:path';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import './apps/xyz/mod/utils/processEnv.js';
import provider from './apps/xyz/mod/provider/_provider.js';
import query from './apps/xyz/mod/query.js';
import sign from './apps/xyz/mod/sign/_sign.js';
import user from './apps/xyz/mod/user/_user.js';
import view from './apps/xyz/mod/view.js';
import workspace from './apps/xyz/mod/workspace/_workspace.js';

function createRouter(middleWare = []) {
  const router = express.Router();

  const publicDir = resolve(xyzEnv.XYZ_CWD || process.cwd(), 'public');

  if (process.versions.node.split('.')[0] < 22) {
    console.warn(`Process Node version below 22.`);
  }

  const limiter = rateLimit({
    legacyHeaders: false,
    limit: xyzEnv.RATE_LIMIT,
    standardHeaders: 'draft-8',
    windowMs: xyzEnv.RATE_LIMIT_WINDOW,
    validate: { xForwardedForHeader: false },
  });

  router.use(limiter);

  router.use(cookieParser());

  //redirect if dir is missing in url path.
  router.use((req, res, next) => {
    if (/(?<=\/.well-known\/appspecific)/.test(req.url)) {
      return;
    }

    if (xyzEnv.DIR && req.url.length === 1) {
      res.setHeader('location', `${xyzEnv.DIR}`);
      return res.status(302).send();
    }
    next();
  });

  router.use(`${xyzEnv.DIR}/public`, express.static(publicDir));
  router.use(xyzEnv.DIR, express.static(publicDir));

  middleWare && router.use(middleWare);

  router.get(`${xyzEnv.DIR}/api/user{/:method}{/:key}`, user);

  router.get(`${xyzEnv.DIR}/api/provider{/:provider}`, provider);

  router.post(
    `${xyzEnv.DIR}/api/provider{/:provider}`,
    express.json({ limit: '5mb' }),
    provider,
  );

  router.get(`${xyzEnv.DIR}/api/sign{/:signer}`, sign);

  router.get(`${xyzEnv.DIR}/api/query{/:template}`, query);

  router.post(
    `${xyzEnv.DIR}/api/query{/:template}`,
    express.json({ limit: '5mb' }),
    query,
  );

  router.get(`${xyzEnv.DIR}/api/workspace{/:key}`, workspace);

  router.get(`${xyzEnv.DIR}/api/user{/:method}{/:key}`, user);

  router.post(
    `${xyzEnv.DIR}/api/user{/:method}`,
    [express.urlencoded({ extended: true }), express.json({ limit: '5mb' })],
    user,
  );

  router.get(`${xyzEnv.DIR}/view{/:template}`, view);

  router.get(`${xyzEnv.DIR}/`, view);

  return router;
}

export default createRouter;
