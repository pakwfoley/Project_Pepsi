'use client';

import { useEffect, useState } from 'react';
import { authClient } from '@/app/auth-client';

export default function AuthCallback() {
  const [error, setError] = useState('');
  useEffect(() => { void authClient().then((client) => client.handleRedirectCallback()).then(() => window.location.replace('/')).catch((reason) => setError(reason instanceof Error ? reason.message : 'Sign-in failed.')); }, []);
  return <main className="grid min-h-screen place-items-center bg-[#07101d] p-6 text-white"><p>{error || 'Completing sign-in…'}</p></main>;
}
