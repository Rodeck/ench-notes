import { useState } from 'react'
import { logout, useAuth } from '../auth'
import { useTheme } from '../theme'
import { useMcpClients, revokeMcpClient } from '../data/store'
import { MCP_URL } from '../firebase'
import { fullDate, agoTime } from '../data/time'
import { initials } from '../data/palette'
import { ConfirmDialog } from './ConfirmDialog'
import { CopyIcon } from './icons'
import type { McpClient } from '../data/types'

export function Settings({ uid, onToast }: { uid: string; onToast: (m: string) => void }) {
  const { profile } = useAuth()
  const { pref, setPref } = useTheme()
  const clients = useMcpClients(uid)
  const [revoking, setRevoking] = useState<McpClient | null>(null)

  async function copyUrl() {
    await navigator.clipboard.writeText(MCP_URL)
    onToast('MCP endpoint copied.')
  }

  return (
    <div className="settings-page">
      <div className="settings-inner">
        <div>
          <h2 style={{ margin: '0 0 4px' }}>Settings</h2>
          <p className="settings-sub">
            Your account, appearance, and the assistants that can reach your notes.
          </p>
        </div>

        <section className="set-section">
          <h6>Profile</h6>
          <div className="card card-row">
            <span className="avatar-lg">{initials(profile?.displayName ?? '?')}</span>
            <div className="grow">
              <div className="set-name">{profile?.displayName}</div>
              <div className="set-dim">{profile?.email}</div>
            </div>
            <button
              className="btn btn-secondary"
              style={{ flex: 'none', whiteSpace: 'nowrap' }}
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </div>
        </section>

        <section className="set-section">
          <h6>Appearance</h6>
          <div className="card card-row">
            <div className="grow">
              <div className="set-label">Theme</div>
              <div className="set-dim">Follows your system unless you choose.</div>
            </div>
            <div className="seg">
              {(['system', 'light', 'dark'] as const).map((p) => (
                <label key={p} className="seg-opt">
                  <input
                    type="radio"
                    name="theme"
                    checked={pref === p}
                    onChange={() => setPref(p)}
                  />
                  {p[0].toUpperCase() + p.slice(1)}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="set-section">
          <h6>Plan</h6>
          <div className="card card-row">
            <div className="grow">
              <div className="set-label">{profile?.premium ? 'Premium' : 'Free'}</div>
              <div className="set-dim">
                {profile?.premium
                  ? 'Tag suggestions and assistant write access are on.'
                  : 'Premium adds tag suggestions and assistant write access.'}
              </div>
            </div>
            <span
              className={`tag ${profile?.premium ? 'tag-accent' : 'tag-neutral'}`}
              style={{ fontSize: 12, padding: '5px 12px' }}
            >
              {profile?.premium ? 'Premium' : 'Free'}
            </span>
          </div>
        </section>

        <section className="set-section">
          <h6>Connections · MCP</h6>
          <div className="card elev-sm mcp-card">
            <p className="mcp-intro">
              Connect your AI assistant to read and write your notes. It authenticates with OAuth —
              you can revoke any client here at any time.
            </p>

            <div className="mcp-urlrow">
              <code className="mcp-url">{MCP_URL}</code>
              <button className="btn btn-primary" style={{ flex: 'none' }} onClick={() => void copyUrl()}>
                <CopyIcon />
                Copy
              </button>
            </div>
            <a
              className="mcp-help"
              href="https://github.com/Rodeck/ench-notes#readme"
              target="_blank"
              rel="noreferrer"
            >
              How to connect Claude →
            </a>

            {clients && clients.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ marginTop: 'var(--space-2)' }}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Scopes</th>
                      <th>Connected</th>
                      <th>Last used</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td>
                          <span style={{ display: 'inline-flex', gap: 5 }}>
                            {c.scopes.map((s) => (
                              <span key={s} className="tag tag-neutral">
                                {s}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="set-dim">{fullDate(c.connectedAt)}</td>
                        <td className="set-dim">{c.lastUsedAt ? agoTime(c.lastUsedAt) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="revoke-btn" onClick={() => setRevoking(c)}>
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty" style={{ padding: 'var(--space-4)' }}>
                <p style={{ margin: 0, fontSize: 14 }}>
                  No assistants connected yet — copy the endpoint above to connect one.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {revoking && (
        <ConfirmDialog
          title={`Revoke ${revoking.name}?`}
          body="This assistant loses access to your notes immediately. You can reconnect it later."
          confirmLabel="Revoke"
          onCancel={() => setRevoking(null)}
          onConfirm={() => {
            const c = revoking
            setRevoking(null)
            void revokeMcpClient(uid, c.id).then(() => onToast(`${c.name} revoked.`))
          }}
        />
      )}
    </div>
  )
}
