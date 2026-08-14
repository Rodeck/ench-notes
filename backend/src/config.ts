function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var ${name}`)
  return v
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  publicUrl: (process.env.PUBLIC_URL ?? 'http://localhost:8787').replace(/\/$/, ''),
  frontendOrigins: (process.env.FRONTEND_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
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
