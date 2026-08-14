import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import type { UserProfile } from './data/types'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true })

export function useAuth() {
  return useContext(AuthContext)
}

/** Create the users/{uid} doc on first sign-in (premium always starts false). */
async function ensureProfile(user: User) {
  const ref = doc(db(), 'users', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Someone',
      email: user.email ?? '',
      premium: false,
      theme: 'system',
    })
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth(), async (u) => {
      setUser(u)
      if (!u) {
        setProfile(null)
        setLoading(false)
      }
    })
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ensureProfile(user).catch(() => {})
    const unsub = onSnapshot(doc(db(), 'users', user.uid), (snap) => {
      if (cancelled) return
      if (snap.exists()) setProfile(snap.data() as UserProfile)
      setLoading(false)
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [user])

  return <AuthContext.Provider value={{ user, profile, loading }}>{children}</AuthContext.Provider>
}

export async function loginWithGoogle() {
  await signInWithPopup(auth(), new GoogleAuthProvider())
}

export async function loginWithEmail(email: string, password: string) {
  await signInWithEmailAndPassword(auth(), email, password)
}

export async function signUpWithEmail(email: string, password: string) {
  await createUserWithEmailAndPassword(auth(), email, password)
}

export async function logout() {
  await signOut(auth())
}

/** Firebase auth error codes → the design's friendly, specific voice. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'That password doesn’t match this email.'
    case 'auth/user-not-found':
      return 'No account with this email yet — sign up below.'
    case 'auth/email-already-in-use':
      return 'This email already has an account — sign in instead.'
    case 'auth/invalid-email':
      return 'That doesn’t look like an email address.'
    case 'auth/weak-password':
      return 'Password needs at least 6 characters.'
    case 'auth/popup-closed-by-user':
      return ''
    case 'auth/too-many-requests':
      return 'Too many attempts — wait a minute and try again.'
    default:
      return 'Sign-in failed. Check your connection and try again.'
  }
}
