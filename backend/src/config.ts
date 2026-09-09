function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var ${name}`)
  return v
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  // 0.0.0.0 inside Docker (the container is the boundary); 127.0.0.1 when
  // running directly on a host behind nginx, so :8787 is never public.
  host: process.env.HOST ?? '0.0.0.0',
  publicUrl: (process.env.PUBLIC_URL ?? 'http://localhost:8787').replace(/\/$/, ''),
  frontendOrigins: (process.env.FRONTEND_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // Set by `npm run dev` at the repo root (and by firebase emulators:exec);
  // the consent page then signs in against the Auth emulator.
  authEmulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST || undefined,
  firebaseWeb: {
    apiKey: process.env.FIREBASE_WEB_API_KEY ?? '',
    authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN ?? '',
    projectId: process.env.FIREBASE_WEB_PROJECT_ID ?? '',
    appId: process.env.FIREBASE_WEB_APP_ID ?? '',
  },
}

export function assertProductionConfig() {
  required('GOOGLE_APPLICATION_CREDENTIALS')
}
