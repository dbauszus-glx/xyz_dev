import crypto from 'node:crypto';

/**
@function providerRequestSignature

@description
The function attempts to validate the signature sent with the request.

We compare the given signature to one calcualted from the key and the url.

@param {req} req HTTP request.
@param {res} res HTTP Response

@returns {Object} returns an object containing whether or not the signature verification passed.
*/
export default function providerRequestSignature(req, res) {
  if (!req.params.signature) return null;

  //Only use signature verification on provider endpoints.
  //if (!req.params.provider) return null;

  req.params.expires ??= 0;

  if (Number.parseInt(req.params.expires) < Date.parse(new Date())) {
    res
      .status(401)
      .setHeader('Content-Type', 'text/plain')
      .send('Signature authentication failed');
    return;
  }

  if (!Object.hasOwn(xyzEnv.WALLET, req.params.key_id)) {
    res
      .status(405)
      .setHeader('Content-Type', 'text/plain')
      .send('Signature authentication not configured');
    return;
  }

  try {
    const privateKey = xyzEnv.WALLET[req.params.key_id];

    //Build signature from key file and requested file url
    const signature = crypto
      .createHmac('sha256', privateKey)
      .update(req.params.url)
      .update(req.params.key_id)
      .update(String(req.params.expires))
      .digest('hex');

    if (signature !== req.params.signature) {
      res
        .status(401)
        .setHeader('Content-Type', 'text/plain')
        .send('Signature authentication failed');
      return;
    }

    //Delete params that are no longer required.
    delete req.params.signature;
    delete req.params.key_id;
    delete req.params.expires;

    //Keep track that this is a signed request.
    req.params.signed = true;
  } catch (error) {
    console.error(error);
  }
}
