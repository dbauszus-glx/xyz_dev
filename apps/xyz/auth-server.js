/**
The saml server script imports an express app from /apps/xyz

The express app is extended with routes to the saml module imported from /apps/saml
*/

import process from 'node:process';
import express from 'express';

const [{ default: app }] = await Promise.all([
  import('@geolytix/xyz-app/server'),
]);

app.get(`${xyzEnv.DIR}/auth/logout`, custom_logout);
app.get(`${xyzEnv.DIR}/auth/login`, custom_login);

export default app;

function custom_login(req, res) {

  console.log(xyzEnv);

  res.send('custom login');

}

function custom_logout(req, res) {
  
  res.send('custom logout');

}
