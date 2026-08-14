import { useEffect, useState } from 'react'
import { firebaseConfigured } from './firebase'
import { AuthProvider, useAuth } from './auth'
import { ThemeProvider, useTheme } from './theme'
import { Login } from './ui/Login'
import { Workspace } from './ui/Workspace'
import { Settings } from './ui/Settings'

function TopBar({
  screen,
  onScreen,
  signedIn,
}: {
  screen: 'workspace' | 'settings'
  onScreen: (s: 'workspace' | 'settings') => void
  signedIn: boolean
}) {
  const { effective, toggle } = useTheme()
  return (
    <div className="topbar">
      <span className="topbar-brand">
        ench <em>notes</em>
      </span>
      {signedIn && (
        <div className="topbar-tabs">
          <button
            className={`tab-pill${screen === 'workspace' ? ' on' : ''}`}
            onClick={() => onScreen('workspace')}
          >
            Workspace
          </button>
          <button
            className={`tab-pill${screen === 'settings' ? ' on' : ''}`}
            onClick={() => onScreen('settings')}
          >
            Settings
          </button>
        </div>
      )}
      <div className="topbar-spacer" />
      <button className="btn btn-secondary theme-btn" onClick={toggle}>
        <span className="glyph">{effective === 'dark' ? '☾' : '☀'}</span>
        <span>{effective === 'dark' ? 'Dark' : 'Light'}</span>
      </button>
    </div>
  )
}

function Toast({ msg }: { msg: string }) {
  return <div className="toast">{msg}</div>
}

function Shell() {
  const { user, loading } = useAuth()
  const [screen, setScreen] = useState<'workspace' | 'settings'>('workspace')
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!user) setScreen('workspace')
  }, [user])

  return (
    <div className="app-root">
      <TopBar screen={screen} onScreen={setScreen} signedIn={!!user} />
      {loading ? (
        <div className="empty" style={{ minHeight: 'calc(100vh - 57px)' }}>
          <p style={{ margin: 0 }}>Loading…</p>
        </div>
      ) : !user ? (
        <Login />
      ) : screen === 'workspace' ? (
        <Workspace uid={user.uid} onOpenSettings={() => setScreen('settings')} onToast={setToast} />
      ) : (
        <Settings uid={user.uid} onToast={setToast} />
      )}
      {toast && <Toast msg={toast} />}
    </div>
  )
}

function SetupNotice() {
  return (
    <div className="setup-wrap">
      <div className="card elev-sm setup-card">
        <h3 style={{ margin: 0 }}>Almost there</h3>
        <p style={{ margin: 0, fontSize: 14 }}>
          Firebase isn’t configured yet. Copy <code>.env.example</code> to <code>.env.local</code>{' '}
          and fill in your Firebase web app keys, then restart the dev server.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (!firebaseConfigured) {
    return (
      <ThemeProvider>
        <SetupNotice />
      </ThemeProvider>
    )
  }
  return (
    <ThemeProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </ThemeProvider>
  )
}
