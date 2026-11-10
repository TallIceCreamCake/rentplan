import { useEffect, useState } from 'react'
import { Field, Icon } from '../components/ui'
import { hasAccounts, refreshProfile, signIn, signOut, signUp, useAuth } from '../lib/auth'

const TEXTS = {
  login: ['Connexion', 'Connectez-vous à votre espace de travail RentPlan.', 'Se connecter'],
  signup: ['Créer un compte', 'Votre compte sera activé par un administrateur de l’espace de travail.', 'Créer mon compte'],
  setup: ['Bienvenue dans RentPlan', 'Aucun compte n’existe encore : créez le compte administrateur (PowerUser) de votre espace de travail. Vous configurerez ensuite votre entreprise en quelques étapes.', 'Créer le compte administrateur'],
  forgot: ['Mot de passe oublié', '', ''],
}

export default function Login() {
  const [mode, setMode] = useState('login')
  const [checking, setChecking] = useState(true)
  const [f, setF] = useState({ fullName: '', email: '', password: '', confirm: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    hasAccounts()
      .then((has) => !has && setMode('setup'))
      .catch((e) => setError(e.message))
      .finally(() => setChecking(false))
  }, [])

  const go = (m) => {
    setMode(m)
    setError('')
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const creating = mode === 'signup' || mode === 'setup'
  const [title, subtitle, submitLabel] = TEXTS[mode]

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (creating) {
      if (!f.fullName.trim()) return setError('Indiquez votre nom.')
      if (f.password.length < 6) return setError('Le mot de passe doit contenir au moins 6 caractères.')
      if (f.password !== f.confirm) return setError('Les deux mots de passe ne correspondent pas.')
    }
    setBusy(true)
    try {
      if (creating) await signUp(f)
      else await signIn(f.email, f.password)
      // La suite (chargement des données, compte en attente) est pilotée par la session
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-brand">
          <span className="login-logo">R</span> RentPlan
        </div>
        {mode === 'setup' && <div className="setup-kicker">Première configuration · étape 1 sur 6</div>}
        <h1>{title}</h1>
        {subtitle && <p className="login-sub">{subtitle}</p>}

        {mode === 'forgot' ? (
          <div className="stack" style={{ gap: 14 }}>
            <div className="alert alert-info">
              <Icon name="info" size={18} />
              <span>
                L’envoi d’e-mails n’est pas configuré sur cette installation. Demandez à un administrateur de définir un nouveau mot de passe depuis <strong>Configuration › Utilisateurs</strong>.
              </span>
            </div>
            <button className="btn login-submit" onClick={() => go('login')}>
              <Icon name="arrow_back" size={18} /> Retour à la connexion
            </button>
          </div>
        ) : (
          <form className="login-form" onSubmit={submit}>
            {creating && (
              <Field label="Nom complet">
                <input className="input" autoComplete="name" value={f.fullName} onChange={set('fullName')} autoFocus />
              </Field>
            )}
            <Field label="Adresse e-mail">
              <input className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} autoFocus={!creating} required />
            </Field>
            <Field label="Mot de passe">
              <div className="pw-field">
                <input className="input" type={show ? 'text' : 'password'} autoComplete={creating ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} required />
                <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                  <Icon name={show ? 'visibility_off' : 'visibility'} size={19} />
                </button>
              </div>
            </Field>
            {creating && (
              <Field label="Confirmer le mot de passe">
                <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={f.confirm} onChange={set('confirm')} required />
              </Field>
            )}
            {error && (
              <div className="alert alert-danger" role="alert">
                <Icon name="error" size={18} />
                <span>{error}</span>
              </div>
            )}
            <button className="btn btn-primary login-submit" type="submit" disabled={busy || checking}>
              {busy && <Icon name="sync" size={18} className="spin" />} {submitLabel}
            </button>
          </form>
        )}

        <div className="login-links">
          {mode === 'login' && (
            <>
              <button className="btn-link" onClick={() => go('forgot')}>Mot de passe oublié ?</button>
              <span>
                Pas encore de compte ? <button className="btn-link" onClick={() => go('signup')}>Créer un compte</button>
              </span>
            </>
          )}
          {mode === 'signup' && (
            <span>
              Déjà un compte ? <button className="btn-link" onClick={() => go('login')}>Se connecter</button>
            </span>
          )}
        </div>
      </div>

      <aside className="login-aside" aria-hidden="true">
        <h2>Toute votre location au même endroit</h2>
        <ul>
          <li><Icon name="category" size={26} /><div><strong>Matériel</strong><span>Disponibilités en temps réel, pénuries et sous-locations</span></div></li>
          <li><Icon name="account_circle" size={26} /><div><strong>Équipe et transport</strong><span>Planificateur d’équipes, invitations et heures</span></div></li>
          <li><Icon name="warehouse" size={26} /><div><strong>Entrepôt</strong><span>Préparation, sorties et retours par scan</span></div></li>
          <li><Icon name="monetization_on" size={26} /><div><strong>Finances</strong><span>Devis, contrats, factures et statistiques</span></div></li>
        </ul>
      </aside>
    </div>
  )
}

/** Compte créé mais pas encore activé par un administrateur. */
export function PendingAccount() {
  const profile = useAuth((s) => s.profile)
  return (
    <div className="login-page single">
      <div className="login-panel login-center">
        <Icon name="hourglass_top" size={46} style={{ color: 'var(--warning)' }} />
        <h1>Compte en attente d’activation</h1>
        <p className="login-sub">
          Bonjour {profile?.fullName}, votre compte <strong>{profile?.email}</strong> a bien été créé. Un administrateur doit l’activer et vous attribuer un rôle avant que vous puissiez accéder aux données.
        </p>
        <p className="muted small">Cette page se met à jour automatiquement dès l’activation.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => refreshProfile()}><Icon name="refresh" size={18} /> Actualiser</button>
          <button className="btn btn-primary" onClick={signOut}><Icon name="logout" size={18} /> Se déconnecter</button>
        </div>
      </div>
    </div>
  )
}

export function AuthError() {
  const error = useAuth((s) => s.error)
  return (
    <div className="login-page single">
      <div className="login-panel login-center">
        <Icon name="cloud_off" size={46} style={{ color: 'var(--danger)' }} />
        <h1>Connexion au compte impossible</h1>
        <p className="login-sub">{error}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => refreshProfile()}><Icon name="refresh" size={18} /> Réessayer</button>
          <button className="btn btn-primary" onClick={signOut}><Icon name="logout" size={18} /> Se déconnecter</button>
        </div>
      </div>
    </div>
  )
}
