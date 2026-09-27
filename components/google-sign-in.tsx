import { useEffect, useRef } from 'react';

type CredentialResponse = { credential: string };
type GoogleIdentity = {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (response: CredentialResponse) => void }): void;
      renderButton(element: HTMLElement, options: Record<string, string>): void;
      disableAutoSelect(): void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

export function GoogleSignIn({ clientId, onCredential }: { clientId: string; onCredential: (token: string) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientId || !buttonRef.current) return;
    const render = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: ({ credential }) => onCredential(credential) });
      buttonRef.current.replaceChildren();
      window.google.accounts.id.renderButton(buttonRef.current, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: '280' });
    };
    if (window.google) {
      render();
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-identity-services';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
    return () => script.remove();
  }, [clientId, onCredential]);

  if (!clientId) return <p className="text-sm text-amber-800">Google sign-in is waiting for the club OAuth client ID to be configured.</p>;
  return <div ref={buttonRef} aria-label="Sign in with Google" />;
}

export function signOutGoogle() {
  window.google?.accounts.id.disableAutoSelect();
}
