/**
## /user/logout

Exports a default method which destroy the user cookie.

@module /user/logout
*/
export default function logout(req, res) {
  res.setHeader(
    'Set-Cookie',
    `${xyzEnv.TITLE}=null;HttpOnly;Max-Age=0;Path=${xyzEnv.DIR || '/'}`,
  );
  res.setHeader('location', `${xyzEnv.DIR}/`);
  res.status(302).send();
}
