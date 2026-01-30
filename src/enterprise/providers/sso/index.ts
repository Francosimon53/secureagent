/**
 * SSO Provider Exports
 *
 * Single Sign-On provider implementations
 */

export {
  BaseSSOProvider,
  BaseSSOProviderConfig,
  SSOUserInfo,
  SSOTokens,
  SSOAuthState,
} from './sso-base.js';

export {
  GoogleSSOProvider,
  GoogleSSOProviderConfig,
  createGoogleSSOProvider,
} from './google-provider.js';

export {
  MicrosoftSSOProvider,
  MicrosoftSSOProviderConfig,
  createMicrosoftSSOProvider,
} from './microsoft-provider.js';

export {
  SAMLSSOProvider,
  SAMLProviderConfig,
  SAMLAssertion,
  SAMLAuthnRequest,
  createSAMLSSOProvider,
} from './saml-provider.js';
