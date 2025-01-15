/**
### SAML Authentication Setup

This module handles SAML-based Single Sign-On (SSO) authentication. Here's how to set it up:

1. Certificate Generation
  Generate your Service Provider (SP) certificate pair:
  ```bash
  # Generate private key
  openssl genrsa -out ${SAML_SP_CRT}.pem 2048
  
  # Generate public certificate
  openssl req -new -x509 -key ${SAML_SP_CRT}.pem -out ${SAML_SP_CRT}.crt -days 36500
  ```

2. File Structure Setup
  Place certificates in your project root:
  ```
  /xyz
  ├── ${SAML_SP_CRT}.pem     # Your SP private key
  ├── ${SAML_SP_CRT}.crt     # Your SP public certificate
  └── ${SAML_IDP_CRT}.crt    # Identity Provider's certificate
  ```

3. Identity Provider Setup
  Configure your IdP (e.g., Auth0, Okta) with:
  - Your SP's Entity ID (issuer)
  - Your SP's public certificate (${SAML_SP_CRT}.crt)
  - Your ACS URL (callback URL)

4. Environment Variables
  Required variables for SAML strategy initialization:

  ```env
    # Required Core Settings
    SAML_ACS=http://your-domain/saml/acs
    SAML_SSO=https://your-idp/saml/login
    SAML_ENTITY_ID=your-service-identifier

    # Certificate Paths (without file extensions)
    SAML_SP_CRT=sp_certificate
    SAML_IDP_CRT=idp_certificate
    
    # Additional Settings
    SAML_SLO=https://your-idp/saml/logout
    SAML_SIGNATURE_ALGORITHM=sha256
  ```

5. SAML Strategy Initialization
  The strategy is initialized with these components:

  ```javascript
  samlStrat = new SAML({
    callbackUrl,     // Where SAML responses are received
    entryPoint,      // IdP's SSO endpoint
    issuer,          // Your SP identifier
    idpCert,         // IdP's certificate for validation
    privateKey,      // Your private key for signing
    publicCert       // Your public cert for IdP
  });
  ```
6. Security Considerations
  - Keep private keys secure
  - Use strong signature algorithms
  - Configure proper certificate expiry
  - Implement proper session management

@requires [@node-saml/node-saml] - SAML protocol implementation
@requires module:/utils/logger - Logging utility
@requires jsonwebtoken - JWT handling
@requires path - File path operations
@requires fs - File system operations

Module Variables:
@type {SAML} samlStrat - SAML strategy instance for authentication operations
@type {SamlConfig} samlConfig - Configuration object for SAML settings
@type {Object} logger - Utility for logging operations
@type {Object} jwt - For handling JSON Web Tokens
@type {Object} acl - Access Control List management

@module /user/saml
**/

/**
@typedef {Object} SamlConfig Configuration for SAML authentication
@property {string} callbackUrl - URL where IdP sends SAML response (ACS endpoint)
@property {string} entryPoint - IdP's login URL for SSO
@property {string} issuer - Identifier/Entity ID for your Service Provider
@property {string} idpCert - Identity Provider's certificate for verification
@property {string} privateKey - Your private key for signing requests
@property {string} publicCert - Your public certificate shared with IdP
@property {string} logoutUrl - URL for single logout (SLO)
@property {boolean} wantAssertionsSigned - Whether assertions must be signed
@property {boolean} wantAuthnResponseSigned - Whether responses must be signed
@property {string} signatureAlgorithm - Algorithm for signing SAML requests
@property {string} identifierFormat - Format of the Name Identifier
@property {number} acceptedClockSkewMs - Allowed clock skew in milliseconds
@property {string} providerName - Name of the Service Provider
@property {string} logoutCallbackUrl - URL for logout callbacks
**/

let samlStrat, samlConfig, logger, jwt, acl;

try {
  // Import required dependencies
  const { SAML } = require('@node-saml/node-saml');
  const { join } = require('path');
  const { readFileSync } = require('fs');

  // Import utility modules
  logger = require('../../mod/utils/logger');
  jwt = require('jsonwebtoken');
  acl = require('../user/acl.js');

  // Initialize SAML configuration
  samlConfig = {
    callbackUrl: process.env.SAML_ACS,
    entryPoint: process.env.SAML_SSO,
    issuer: process.env.SAML_ENTITY_ID,

    // Read and configure certificates
    idpCert:
      process.env.SAML_IDP_CRT &&
      String(
        readFileSync(join(__dirname, `../../${process.env.SAML_IDP_CRT}.crt`)),
      ),
    privateKey:
      process.env.SAML_SP_CRT &&
      String(
        readFileSync(join(__dirname, `../../${process.env.SAML_SP_CRT}.pem`)),
      ),
    publicCert:
      process.env.SAML_SP_CRT &&
      String(
        readFileSync(join(__dirname, `../../${process.env.SAML_SP_CRT}.crt`)),
      ),

    // Configure SAML endpoints and behavior
    logoutUrl: process.env.SAML_SLO,
    wantAssertionsSigned: process.env.SAML_WANT_ASSERTIONS_SIGNED,
    wantAuthnResponseSigned: process.env.SAML_AUTHN_RESPONSE_SIGNED ?? false,
    signatureAlgorithm: process.env.SAML_SIGNATURE_ALGORITHM,
    identifierFormat: process.env.SAML_IDENTIFIER_FORMAT,
    acceptedClockSkewMs: process.env.SAML_ACCEPTED_CLOCK_SKEW ?? -1,
    providerName: process.env.SAML_PROVIDER_NAME,
    logoutCallbackUrl: process.env.SLO_CALLBACK,
  };

  // Create SAML strategy instance
  samlStrat = new SAML(samlConfig);
  module.exports = saml;
} catch {
  // Check for SAML-related environment variables
  const samlKeys = Object.keys(process.env).filter((key) =>
    key.startsWith('SAML'),
  );

  // Log warning if SAML variables exist but module fails to initialize
  if (samlKeys.length > 0) {
    console.log('SAML2 module is not available.');
  }
  module.exports = null;
}
/**
@function saml
@description Handles SAML authentication flow endpoints and operations

Provides endpoints for:
- /saml/metadata: Returns SP metadata in XML format
- /saml/login: Initiates SAML login flow
- /saml/logout: Handles SAML logout
- /saml/acs: Assertion Consumer Service endpoint
- /saml/logout/callback: Handles logout callback

Authentication Flow:
1. User hits login endpoint
2. Gets redirected to IdP
3. IdP authenticates and sends SAML response
4. Response is validated at ACS endpoint
5. User profile is created from SAML attributes
6. Optional ACL lookup enriches profile
7. JWT token created and set as cookie

@param {Object} req - HTTP request object
@param {req} req.url - Request URL path
@param {req} req.body - POST request body
@param {req} req.query - URL query parameters
@param {req} req.cookies - Request cookies
@param {req} req.params - Route parameters

@param {Object} res - HTTP response object
@param {res} res.redirect - Redirect function
@param {res} res.send - Send response function
@param {res} res.setHeader - Set response header

@throws {Error} If SAML is not configured
@throws {Error} If authentication fails
**/
function saml(req, res) {
  // Check SAML availability
  if (!samlStrat) {
    console.warn(`SAML is not available in XYZ instance.`);
    return;
  }

  switch (true) {
    // Metadata endpoint - returns SP configuration
    case /\/saml\/metadata/.test(req.url):
      metadata(res);
      break;

    // Logout callback endpoint - clears session
    case /\/saml\/logout\/callback/.test(req.url):
      logoutCallback(res);
      break;

    // Logout endpoint - initiates logout flow
    case /\/saml\/logout/.test(req.url):
      logout(req, res);
      break;

    // Login endpoint - starts authentication flow
    case req.params?.login || /\/saml\/login/.test(req.url):
      login(req, res);
      break;

    // ACS endpoint - processes SAML response
    case /\/saml\/acs/.test(req.url):
      acs(req, res);
      break;
  }
}

/**
@function metadata 
@description Handles the metadata response 

@param {Object} res - HTTP response object
@param {res} res.redirect - Redirect function
@param {res} res.send - Send response function
@param {res} res.setHeader - Set response header
**/
function metadata(res) {
  res.setHeader('Content-Type', 'application/xml');
  const metadata = samlStrat.generateServiceProviderMetadata(
    null,
    samlConfig.idpCert,
  );
  res.send(metadata);
}

/**
@function logoutCallback
@description Handles the logoutCallback POST from  the idp

@param {Object} res - HTTP response object
@param {res} res.redirect - Redirect function
@param {res} res.setHeader - Set response header
**/
function logoutCallback(res) {
  try {
    // Most blokes will be settin' their cookies at UTC midnight
    // Where can you go from there? Nowhere.
    res.setHeader(
      'Set-Cookie',
      `${process.env.TITLE}=; HttpOnly; Path=${process.env.DIR || '/'}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`, // But these cookies go to zero. That's one less.
    );

    res.redirect(`${process.env.DIR || '/'}`);
  } catch (error) {
    console.error('Logout validation failed:', error);
    return res.redirect('/');
  }
}

/**
@function logout
@description Handles the logout request from the api.js

@param {Object} req - HTTP request object
@param {req} req.cookies - Request Cookies

@param {Object} res - HTTP response object
@param {res} res.redirect - Redirect function
@param {res} res.setHeader - Set response header
**/
async function logout(req, res) {
  try {
    const user = await jwt.decode(req.cookies[`${process.env.TITLE}`]);

    // If no user/cookie, redirect to home
    if (!user) {
      return res.redirect(process.env.DIR || '/');
    }

    if (user.sessionIndex) {
      // Get logout URL from IdP if session exists
      const url = await samlStrat.getLogoutUrlAsync(user);
      return res.redirect(url);
    } else {
      return logoutCallback(res);
    }
  } catch (error) {
    console.error('Logout process failed:', error);
    return res.redirect('/');
  }
}

/**
@function login
@description Handles the login request from the api.js and redirects to login url.

@param {Object} req - HTTP request object
@param {req} req.get - Request get function

@param {Object} res - HTTP response object
@param {res} res.redirect - Redirect function
**/
async function login(req, res) {
  try {
    // Get return URL from query or default to base dir
    const relayState = process.env.DIR ?? '/';

    // Get authorization URL from IdP
    const url = await samlStrat.getAuthorizeUrlAsync(
      relayState,
      req.headers['x-forwarded-host'],
      { additionalParams: {} },
    );

    res.redirect(url);
  } catch (error) {
    console.error('SAML authorization error:', error);
    res.status(500).send('Authentication failed');
  }
}

/**
@function acs 
@description Handles the acs POST request from the idp

@param {Object} req - HTTP request object
@param {req} req.body - Request Body

@param {Object} res - HTTP response object
@param {res} res.redirect - Redirect function
@param {res} res.status - request status
@param {res} res.send - Send response function
@param {res} res.setHeader - Set response header
**/
async function acs(req, res) {
  try {
    // Validate SAML response
    const samlResponse = await samlStrat.validatePostResponseAsync(req.body);

    // Create user Object from SAML attributes
    const user = {
      email: samlResponse.profile.nameID,
      nameID: samlResponse.profile.nameID,
      sessionIndex: samlResponse.profile.sessionIndex,
      nameIDFormat: samlResponse.profile.nameIDFormat,
      nameQualifier: samlResponse.profile.nameQualifier,
      spNameQualifier: samlResponse.profile.spNameQualifier,
    };

    // Perform ACL lookup if enabled
    if (process.env.SAML_ACL) {
      const aclResponse = await aclLookUp(user.email);

      if (!aclResponse) {
        const url = await samlStrat.getLogoutUrlAsync(user);

        // Login with non exist SAML user will destroy session and return login.
        return res.redirect(url);
      }

      if (aclResponse instanceof Error) {
        res.status(401).send(aclResponse.message);
      }

      Object.assign(user, aclResponse);
    }

    // Create JWT token and set cookie
    const token = jwt.sign(user, process.env.SECRET, {
      expiresIn: parseInt(process.env.COOKIE_TTL),
    });

    const cookie =
      `${process.env.TITLE}=${token};HttpOnly;` +
      `Max-Age=${process.env.COOKIE_TTL};` +
      `Path=${process.env.DIR || '/'};`;

    res.setHeader('Set-Cookie', cookie);

    res.redirect(`${process.env.DIR || '/'}`);
  } catch (error) {
    console.log(error);
  }
}

/**
@function aclLookUp

@description
The aclLookUp attempts to find a user record by it's email in the ACL.

The user record will be validated and returned to the requesting saml Assertion Consumer Service [ACS].

@param {string} email User email.

@returns {Promise<Object|Error>}
User object or Error.
*/

async function aclLookUp(email) {
  if (acl === null) {
    return new Error('ACL unavailable.');
  }

  const date = new Date();

  // Update access_log and return user record matched by email.
  const rows = await acl(
    `
    UPDATE acl_schema.acl_table
    SET access_log = array_append(access_log, '${date.toISOString().replace(/\..*/, '')}')
    WHERE lower(email) = lower($1)
    RETURNING email, roles, language, blocked, approved, approved_by, verified, admin, password;`,
    [email],
  );

  if (rows instanceof Error) return new Error('Failed to query to ACL.');

  // Get user record from first row.
  const user = rows[0];

  if (!user) return null;

  // Blocked user cannot login.
  if (user.blocked) {
    return new Error('User blocked in ACL.');
  }

  // Accounts must be verified and approved for login
  if (!user.verified) {
    return new Error('User not verified in ACL');
  }

  if (!user.approved) {
    return new Error('User not approved in ACL');
  }

  return {
    roles: user.roles,
    language: user.language,
    admin: user.admin,
  };
}
