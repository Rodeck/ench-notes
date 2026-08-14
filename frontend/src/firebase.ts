import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId)

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Firestore | null = null

if (firebaseConfigured) {
  app = initializeApp(config)
  authInstance = getAuth(app)
  dbInstance = getFirestore(app)
}

export function auth(): Auth {
  if (!authInstance) throw new Error('Firebase is not configured')
  return authInstance
}

export function db(): Firestore {
  if (!dbInstance) throw new Error('Firebase is not configured')
  return dbInstance
}

export const BACKEND_URL: string = import.meta.env.VITE_BACKEND_URL ?? ''
export const MCP_URL: string = import.meta.env.VITE_MCP_URL ?? 'https://mcp.enchnotes.app/v1/sse'
