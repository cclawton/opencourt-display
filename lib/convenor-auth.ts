import { Amplify } from 'aws-amplify';
import {
  confirmSignIn,
  fetchAuthSession,
  signIn,
  signOut,
} from 'aws-amplify/auth';

import type { RuntimeConfig } from './runtime-config';

let configuredFor = '';

function configure(config: RuntimeConfig) {
  const key = `${config.cognitoUserPoolId}:${config.cognitoUserPoolClientId}`;
  if (!config.cognitoUserPoolId || !config.cognitoUserPoolClientId)
    throw new Error('Convenor sign-in is not configured.');
  if (configuredFor === key) return;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.cognitoUserPoolId,
        userPoolClientId: config.cognitoUserPoolClientId,
      },
    },
  });
  configuredFor = key;
}

export async function requestConvenorCode(
  config: RuntimeConfig,
  username: string,
  delivery: 'sms' | 'email',
) {
  configure(config);
  const result = await signIn({
    username,
    options: {
      authFlowType: 'USER_AUTH',
      preferredChallenge: delivery === 'email' ? 'EMAIL_OTP' : 'SMS_OTP',
    },
  });
  const expected =
    delivery === 'email'
      ? 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE'
      : 'CONFIRM_SIGN_IN_WITH_SMS_CODE';
  if (result.nextStep.signInStep !== expected)
    throw new Error(`The ${delivery} code could not be requested.`);
}

export async function confirmConvenorCode(config: RuntimeConfig, code: string) {
  configure(config);
  const result = await confirmSignIn({ challengeResponse: code.trim() });
  if (!result.isSignedIn) throw new Error('The code was not accepted.');
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('The sign-in session could not be created.');
  return token;
}

export async function clearConvenorSignIn() {
  await signOut().catch(() => undefined);
}
