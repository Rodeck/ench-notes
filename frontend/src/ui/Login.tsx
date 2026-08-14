import { useState, type FormEvent } from 'react'
import { authErrorMessage, loginWithEmail, loginWithGoogle, signUpWithEmail } from '../auth'
import { GoogleIcon } from './icons'

export function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void run(() =>
      mode === 'signin' ? loginWithEmail(email, password) : signUpWithEmail(email, password),
    )
  }

  return (
    <div className="login-wrap">
      <div className="login-col">
        <div className="login-head">
          <span className="login-mark">e</span>
          <h2>ench notes</h2>
          <p className="login-tag">Notes that your AI remembers.</p>
        </div>

        <form className="card elev-sm login-card" onSubmit={onSubmit}>
          <button
            type="button"
            className="btn btn-secondary btn-block login-google"
            disabled={busy}
            onClick={() => void run(loginWithGoogle)}
          >
            <GoogleIcon />
            Continue with Google
          </button>
          <div className="login-or">
            <span />
            or
            <span />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              className="input"
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input
              className="input"
              id="pw"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="login-err">{error}</div>}
          <button className="btn btn-primary btn-block" style={{ padding: 10 }} disabled={busy}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="login-foot">
          {mode === 'signin' ? (
            <>
              No account yet?{' '}
              <a
                href="#signup"
                onClick={(e) => {
                  e.preventDefault()
                  setMode('signup')
                  setError('')
                }}
              >
                Sign up
              </a>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <a
                href="#signin"
                onClick={(e) => {
                  e.preventDefault()
                  setMode('signin')
                  setError('')
                }}
              >
                Sign in
              </a>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
