/**
The saml server script imports an express app from /apps/xyz

The express app is extended with routes to the saml module imported from /apps/saml
*/

import acl from '@geolytix/xyz-app/mod/user/acl.js';
import {
  getRedirect,
  setRedirect,
} from '@geolytix/xyz-app/mod/utils/redirect.js';
import '@geolytix/xyz-app/mod/utils/processEnv.js';

import process from 'node:process';
import express from 'express';
import jsonwebtoken from 'jsonwebtoken';

const [{ default: app }] = await Promise.all([
  import('@geolytix/xyz-app/server'),
]);

app.get(`${xyzEnv.DIR}/custom/logout`, custom_logout);
app.get(`${xyzEnv.DIR}/custom/login`, custom_login);
app.post(
  `${xyzEnv.DIR}/custom/verify`,
  [express.urlencoded({ extended: true }), express.json({ limit: '5mb' })],
  custom_verify,
);

export default app;

function custom_login(req, res) {
  const form = `<form method="POST" action="${xyzEnv.DIR}/custom/verify">
    <input type="text" name="username" placeholder="Username" required />
    <button type="submit">Login</button></form>`;

  res.send(form);
}

function custom_logout(req, res) {
  res.send('custom logout');
}

async function custom_verify(req, res) {
  const { sign } = jsonwebtoken;
  const email = req.body.username;

  const rows = await acl(
    `
    SELECT email, admin, language, roles, blocked
    FROM acl_schema.acl_table
    WHERE lower(email) = lower($1);`,
    [email],
  );

  if (rows instanceof Error) {
    res.setHeader(
      'Set-Cookie',
      `${xyzEnv.TITLE}=null;HttpOnly;Max-Age=0;Path=${xyzEnv.DIR || '/'}`,
    );
    return res.status(500).send('Failed to retrieve user from ACL');
  }

  const user = Object.assign({ email }, rows[0]);

  const token = sign(user, xyzEnv.SECRET, {
    expiresIn: xyzEnv.COOKIE_TTL,
    algorithm: xyzEnv.SECRET_ALGORITHM,
  });

  const user_cookie = `${xyzEnv.TITLE}=${token};HttpOnly;Max-Age=${xyzEnv.COOKIE_TTL};Path=${xyzEnv.DIR || '/'};SameSite=Strict${(!req.headers.host.includes('localhost') && ';Secure') || ''}`;

  if (getRedirect(req, res, [user_cookie])) {
    return;
  }

  res.setHeader('Set-Cookie', user_cookie);
  res.setHeader('location', `${xyzEnv.DIR}/`);
  res.status(302).send();
}
