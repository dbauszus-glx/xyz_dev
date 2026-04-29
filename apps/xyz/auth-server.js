/**
The saml server script imports an express app from /apps/xyz

The express app is extended with routes to the saml module imported from /apps/saml
*/

import process from 'node:process';
import express from 'express';
import jsonwebtoken from 'jsonwebtoken';
import { getRedirect, setRedirect } from './mod/utils/redirect.js';

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

function custom_verify(req, res) {
  const { sign } = jsonwebtoken;
  const email = req.body.username;

  const token = sign(
    {
      email: email,
    },
    xyzEnv.SECRET,
    {
      expiresIn: xyzEnv.COOKIE_TTL,
      algorithm: xyzEnv.SECRET_ALGORITHM,
    },
  );

  const user_cookie = `${xyzEnv.TITLE}=${token};HttpOnly;Max-Age=${xyzEnv.COOKIE_TTL};Path=${xyzEnv.DIR || '/'};SameSite=Strict${(!req.headers.host.includes('localhost') && ';Secure') || ''}`;

  if (getRedirect(req, res, [user_cookie])) {
    return;
  }

  res.setHeader('Set-Cookie', user_cookie);
  res.setHeader('location', `${xyzEnv.DIR}/`);
  res.status(302).send();
}
