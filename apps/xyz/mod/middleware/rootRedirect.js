export default function rootRedirect(req, res, next) {
  if (/(?<=\/.well-known\/appspecific)/.test(req.url)) {
    return;
  }

  if (xyzEnv.DIR && req.url.length === 1) {
    res.setHeader('location', `${xyzEnv.DIR}`);
    return res.status(302).send();
  }
  next();
}
