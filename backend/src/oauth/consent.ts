/* The OAuth consent page, styled with the Organic design system tokens.
   The user signs in with Google (Firebase web SDK) and approves the client;
   the page then POSTs the decision + ID token to /oauth/decision. */

interface ConsentParams {
  clientName: string
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  scope: string
  firebase: { apiKey: string; authDomain: string; projectId: string; appId: string }
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function consentPage(p: ConsentParams): string {
  const scopes = p.scope.split(' ')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect to ench notes</title>
<style>
  :root {
    --bg: #f5ead8; --surface: #ebddc5; --text: #201e1d;
    --accent: #c67139; --accent-600: #b2622d;
    --divider: color-mix(in srgb, #201e1d 16%, transparent);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #211c17; --surface: #2b251f; --text: #f4ead9;
      --accent: #e2915a; --accent-600: #d67f48;
      --divider: color-mix(in srgb, #f4ead9 16%, transparent);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: var(--bg); color: var(--text);
    font-family: system-ui, sans-serif; font-size: 15px; line-height: 1.55;
    padding: 24px;
  }
  .card {
    width: min(420px, 100%); background: var(--surface);
    border-radius: 32px; padding: 32px; display: flex; flex-direction: column; gap: 16px;
    box-shadow: 0 3px 10px rgba(0,0,0,.15);
  }
  h1 { font-size: 22px; margin: 0; }
  .mark {
    width: 48px; height: 48px; display: grid; place-items: center; border-radius: 50%;
    background: var(--accent); color: var(--bg); font-size: 22px; font-weight: 700;
  }
  .scopes { display: flex; gap: 6px; }
  .tag {
    font-size: 12px; padding: 3px 12px; border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .muted { opacity: .65; font-size: 13px; }
  button {
    font: inherit; cursor: pointer; padding: 10px 18px; border-radius: 999px;
    border: 1px solid var(--divider); background: transparent; color: inherit;
  }
  button.primary { background: var(--accent); border-color: transparent; color: var(--bg); font-weight: 600; }
  button.primary:hover { background: var(--accent-600); }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .row { display: flex; gap: 10px; justify-content: flex-end; }
  .err { color: #a13b2a; font-size: 13px; }
  .user { font-size: 13px; opacity: .8; }
</style>
</head>
<body>
<div class="card">
  <div class="mark">e</div>
  <h1>Connect <em>${esc(p.clientName)}</em> to ench notes</h1>
  <p style="margin:0">This assistant is asking to access your notes with the following permissions:</p>
  <div class="scopes">${scopes.map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>
  <p class="muted" style="margin:0">You can revoke access at any time from Settings → Connections in ench notes.</p>
  <div id="signed-out">
    <button class="primary" id="signin" style="width:100%">Sign in with Google to continue</button>
  </div>
  <div id="signed-in" style="display:none">
    <p class="user" id="who"></p>
    <div class="row">
      <button id="deny">Deny</button>
      <button class="primary" id="approve">Approve</button>
    </div>
  </div>
  <p class="err" id="err"></p>
</div>
<script type="module">
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js'
  import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js'

  const params = ${JSON.stringify({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    state: p.state,
    code_challenge: p.codeChallenge,
    scope: p.scope,
  })}
  const app = initializeApp(${JSON.stringify(p.firebase)})
  const auth = getAuth(app)
  const err = (m) => { document.getElementById('err').textContent = m }

  onAuthStateChanged(auth, (user) => {
    document.getElementById('signed-out').style.display = user ? 'none' : ''
    document.getElementById('signed-in').style.display = user ? '' : 'none'
    if (user) document.getElementById('who').textContent = 'Signed in as ' + (user.email ?? user.displayName)
  })

  document.getElementById('signin').onclick = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()) }
    catch (e) { err('Sign-in failed — try again.') }
  }

  async function decide(decision) {
    const user = auth.currentUser
    if (!user) return err('Sign in first.')
    const idToken = await user.getIdToken()
    const res = await fetch('/oauth/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, idToken, decision }),
    })
    if (!res.ok) return err('Something went wrong — try again.')
    const data = await res.json()
    if (data.redirect) location.href = data.redirect
  }
  document.getElementById('approve').onclick = () => decide('approve')
  document.getElementById('deny').onclick = () => decide('deny')
</script>
</body>
</html>`
}
