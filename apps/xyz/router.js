/**
## /router

Creates an express router object with base xyz endpoints.

@requires express Web application framework
@requires cookie-parser HTTP cookie parsing middleware
@requires express-rate-limit Rate limiting middleware
@requires /utils/processEnv

@module router
*/
import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import './mod/utils/processEnv.js';
import rateLimit from 'express-rate-limit';
import provider from './mod/provider/_provider.js';
import query from './mod/query.js';
import sign from './mod/sign/_sign.js';
import user from './mod/user/_user.js';
import view from './mod/view.js';
import workspace from './mod/workspace/_workspace.js';

/**
@function createRouter

@description
Creates an express router with xyz base endpoints.


@param {Array<Function>} [middleWare] an optinal array of middleware functions to be run.

@returns {Object} Returns an express router.
**/
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

  router.use(`${xyzEnv.DIR}/public`, express.static(publicDir));
  router.use(xyzEnv.DIR, express.static(publicDir));

  if (middleWare.length) {
    router.use(middleWare);
  }

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
