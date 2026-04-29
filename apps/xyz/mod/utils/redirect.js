/**
## /utils/redirect

The redirect utility module exports a function to set a cookie with a redirect location in the response header.

@module /utils/redirect
*/

/**
@function setRedirect
@description
Validates, sanitizes, and stores a redirect URL in a secure cookie.

This function prevents open redirect and cookie injection vulnerabilities by:
- Removing dangerous characters (`;`, `\r`, `\n`) that could enable header/cookie injection
- Enforcing relative URLs only (must start with `/`) to prevent external redirects
- Encoding the URL for safe cookie storage
- Setting appropriate cookie security flags (HttpOnly)

The redirect URL is extracted from the request URL, validated, and stored in a cookie with a 60-second TTL for use after authentication flows.

@param {req} req HTTP request object
@property {string} req.url Request URL containing the redirect path

@param {res} res HTTP response object
@property {function} res.setHeader Set response header function
*/
export function setRedirect(req, res) {
  const redirect = req.cookies?.[`${xyzEnv.TITLE}_redirect`];

  if (redirect) {
    return true;
  }

  let redirectUrl =
    req.url && decodeURIComponent(req.url).replace(/login=true/, '');

  // Remove any characters that could be used for cookie injection
  redirectUrl = redirectUrl.replaceAll(/[;\r\n]/g, '');

  // Ensure it's a relative URL (it starts with '/')
  if (!redirectUrl.startsWith('/')) {
    redirectUrl = xyzEnv.DIR || '/';
  }

  // Encode the URL for safe storage in the cookie
  const encodedRedirectUrl = encodeURIComponent(redirectUrl);

  // Set cookie with properly encoded redirect value.
  res.setHeader(
    'Set-Cookie',
    `${xyzEnv.TITLE}_redirect=${encodedRedirectUrl};HttpOnly;Max-Age=60000;Path=${xyzEnv.DIR || '/'}`,
  );
}

export function getRedirect(req, res, cookies = []) {
  const redirect = req.cookies?.[`${xyzEnv.TITLE}_redirect`];

  if (!redirect) return;

  // Decode the redirect URL since it's now encoded when stored
  const decodedRedirect = decodeURIComponent(redirect);

  cookies.push(
    `${xyzEnv.TITLE}_redirect=null;HttpOnly;Max-Age=0;Path=${xyzEnv.DIR || '/'}`,
  );

  res.setHeader('Set-Cookie', cookies);
  res.setHeader('location', decodedRedirect);
  res.status(302).send();
  return true;
}
