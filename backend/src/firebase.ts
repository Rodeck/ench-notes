import { initializeApp, applicationDefault, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let app: App | null = null

function ensureApp(): App {
  if (!app) app = initializeApp({ credential: applicationDefault() })
  return app
}

export function auth(): Auth {
  return getAuth(ensureApp())
}

export function db(): Firestore {
  return getFirestore(ensureApp())
}
