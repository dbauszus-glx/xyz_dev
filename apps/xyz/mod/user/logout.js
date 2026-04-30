export default function logout(req, res) {
  res.setHeader(
    'Set-Cookie',
    `${xyzEnv.TITLE}=null;HttpOnly;Max-Age=0;Path=${xyzEnv.DIR || '/'}`,
  );
  res.setHeader('location', `${xyzEnv.DIR}/`);
  res.status(302).send();
}
