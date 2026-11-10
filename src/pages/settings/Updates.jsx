import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon, Section } from '../../components/ui'
import { toast } from '../../store'
import { APP_BUILT_AT, APP_VERSION, checkInstalledVersion, reloadToUpdate, useAppUpdate } from '../../lib/updates'
import { fmtRelative } from '../dashboard/widgets'

const fmtDate = (iso) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })

/** État publié par l'agent de déploiement (deploy/agent.mjs). */
async function fetchUpdateStatus() {
  const res = await fetch('/__rentplan/updates', { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Rubrique « Mises à jour » de Configuration › Sauvegardes. */
export function UpdatesSection({ canWrite }) {
  const available = useAppUpdate((s) => s.available)
  const [status, setStatus] = useState(null)
  const [unreachable, setUnreachable] = useState(false)
  const [busy, setBusy] = useState(false)
  const timers = useRef([])

  const load = useCallback(
    () =>
      fetchUpdateStatus().then(
        (s) => {
          setStatus(s)
          setUnreachable(false)
        },
        () => setUnreachable(true),
      ),
    [],
  )
  useEffect(() => {
    if (!APP_VERSION) return
    load()
    const t = setInterval(load, 15_000)
    return () => {
      clearInterval(t)
      timers.current.forEach(clearTimeout)
    }
  }, [load])

  if (!APP_VERSION) {
    return (
      <Section title="Mises à jour">
        <div className="row">
          <Icon name="code" size={19} /> Version de développement : les mises à jour automatiques fonctionnent une fois RentPlan installé sur un poste ou un serveur (voir « Installation » dans le README).
        </div>
      </Section>
    )
  }

  const checkNow = async () => {
    setBusy(true)
    try {
      const res = await fetch('/__rentplan/update', { method: 'POST' })
      if (!res.ok && res.status !== 429) throw new Error(`HTTP ${res.status}`)
      toast('Recherche d’une nouvelle version sur GitHub…')
      // Laisse le temps à l'agent d'interroger GitHub, puis rafraîchit l'état
      timers.current.push(
        setTimeout(() => {
          load()
          checkInstalledVersion()
          setBusy(false)
        }, 5000),
      )
    } catch (e) {
      toast(`Vérification impossible : ${e.message}`, 'error')
      setBusy(false)
    }
  }

  const running = status?.version === APP_VERSION ? status.info : null
  const installing = status?.checking && /installation/.test(status.lastResult || '')
  return (
    <Section title="Mises à jour">
      <div className="update-head">
        <span className="update-badge"><Icon name={available ? 'system_update_alt' : 'verified'} size={26} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="strong" style={{ fontSize: 17 }}>
            Version {APP_VERSION.slice(0, 7)}
            {running?.message ? <span className="muted" style={{ fontWeight: 400 }}> — {running.message}</span> : null}
          </div>
          <div className="muted small">
            {running?.commitDate ? `Publiée le ${fmtDate(running.commitDate)} · ` : ''}
            {APP_BUILT_AT ? `installée le ${fmtDate(APP_BUILT_AT)}` : ''}
          </div>
        </div>
        {canWrite && (
          <button className="btn" onClick={checkNow} disabled={busy || unreachable}>
            <Icon name="sync" size={18} className={busy ? 'spin' : ''} /> {busy ? 'Recherche…' : 'Rechercher une mise à jour'}
          </button>
        )}
      </div>

      {available && (
        <div className="alert alert-info" style={{ marginTop: 14, alignItems: 'center' }}>
          <Icon name="system_update_alt" size={18} />
          <div style={{ flex: 1 }}>
            Nouvelle version <strong>{available.short}</strong>{available.message ? ` (${available.message})` : ''} installée sur le serveur.
          </div>
          <button className="btn-link" onClick={reloadToUpdate}>Recharger maintenant</button>
        </div>
      )}
      {installing && !available && (
        <div className="alert alert-info" style={{ marginTop: 14 }}>
          <Icon name="sync" size={18} className="spin" />
          <div>Une nouvelle version est en cours d’installation sur le serveur.</div>
        </div>
      )}
      {status?.failed && (
        <div className="alert alert-warning" style={{ marginTop: 14 }}>
          <Icon name="warning" size={18} />
          <div>
            La version <strong>{status.failed.short}</strong> n’a pas pu être installée ({fmtRelative(status.failed.at)}) : la version actuelle reste en service. Nouvel essai automatique dans l’heure ou dès la prochaine publication.
          </div>
        </div>
      )}
      {unreachable && (
        <div className="alert alert-warning" style={{ marginTop: 14 }}>
          <Icon name="cloud_off" size={18} />
          <div>Le service de mise à jour ne répond pas. Il reprendra seul après un redémarrage de la machine (journal : <code>.rentplan/logs/agent.log</code>).</div>
        </div>
      )}

      {status && (
        <p className="muted small" style={{ margin: '14px 0 0' }}>
          Installation automatique des nouvelles versions publiées sur GitHub (branche {status.branch}), vérifiées {status.checkIntervalMinutes > 1 ? `toutes les ${status.checkIntervalMinutes} min` : 'chaque minute'}
          {status.lastCheck ? ` · dernière vérification ${fmtRelative(status.lastCheck)}${status.lastResult ? ` : ${status.lastResult}` : ''}` : ''}.{' '}
          {status.repository && (
            <a href={`${status.repository}/commits/${status.branch}`} target="_blank" rel="noreferrer">Historique des versions</a>
          )}
        </p>
      )}
    </Section>
  )
}
