import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useClock, useIdx, useRecent, useStore, toast } from '../store'
import { useSyncStatus, DB_ENABLED } from '../lib/db'
import { currentUserName, setPreference, signOut, useAccess, useAuth } from '../lib/auth'
import { MODULE_BY_ID, moduleEnabled, moduleOfPath } from '../lib/permissions'
import { configMenuFor, defaultSection } from '../pages/settings/menu'
import { Icon, Menu, Modal, Toasts } from './ui'
import { computeAlerts } from '../lib/alerts'
import { available, isFinancialDoc } from '../lib/model'
import { addDays, contactName, fmtHM, matches, personName, startOfDay, toLocalInput, uid } from '../lib/utils'

// Menu latéral : mêmes modules et sous-modules que Rentman (sous-menus jusqu'à « Équipements », plus Maintenance).
// Un sous-menu avec « tab » ouvre l'onglet correspondant ; le premier de la liste est l'onglet par défaut.
const NAV = [
  [
    { id: 'dashboard', label: 'Tableau de bord', icon: 'dashboard', to: '/' },
    {
      id: 'agenda', label: 'Mon agenda', icon: 'event',
      children: [{ label: 'Mon agenda', to: '/agenda' }, { label: 'Rendez-vous', to: '/agenda/rendez-vous' }, { label: 'Job board', to: '/agenda/job-board' }],
    },
    {
      id: 'entrepot', label: 'Entrepôt', icon: 'warehouse',
      children: [{ label: 'Entrepôt', to: '/entrepot' }, { label: 'Combinaisons', to: '/entrepot/combinaisons' }, { label: 'Registre de suivi d’entrepôt', to: '/entrepot/registre' }],
    },
  ],
  [
    {
      id: 'projets', label: 'Projets', icon: 'table_chart',
      children: [{ label: 'Projets', to: '/projets', prefix: true }, { label: 'Demandes de location', to: '/demandes', module: 'demandes', badge: 'requests' }],
    },
    { id: 'planificateur', label: 'Planificateur d’équipes', icon: 'account_circle', to: '/planificateur' },
    {
      id: 'penuries', label: 'Pénuries', icon: 'swap_horizontal_circle',
      children: [
        { label: 'Pénuries de location', to: '/penuries', tab: 'penuries', badge: 'shortages' },
        { label: 'Pénuries de vente', to: '/penuries', tab: 'vente' },
        { label: 'Sous-locations', to: '/penuries', tab: 'souslocations' },
      ],
    },
    {
      id: 'finances', label: 'Finances', icon: 'monetization_on', finance: true,
      children: [
        { label: 'Factures', to: '/finances', tab: 'factures', also: '/documents' },
        { label: 'À facturer', to: '/finances', tab: 'afacturer' },
        { label: 'Bons de commande', to: '/finances', tab: 'commandes' },
      ],
    },
  ],
  [
    {
      id: 'equipements', label: 'Équipements', icon: 'category',
      children: [
        { label: 'Équipements', to: '/equipements', prefix: true },
        { label: 'Numéros de série', to: '/equipements/numeros-de-serie' },
        { label: 'Emplacements de stock', to: '/equipements/emplacements' },
        { label: 'Équipements archivés', to: '/equipements/archives' },
        { label: 'Emplacements de stock archivés', to: '/equipements/emplacements-archives' },
      ],
    },
    { id: 'contacts', label: 'Contacts', icon: 'contact_phone', to: '/contacts' },
    { id: 'personnel', label: 'Membres du personnel', icon: 'people', to: '/personnel' },
    { id: 'vehicules', label: 'Véhicules', icon: 'local_shipping', to: '/vehicules' },
  ],
  [
    { id: 'taches', label: 'Tâches', icon: 'assignment_turned_in', to: '/taches' },
    { id: 'heures', label: 'Enregistrement horaire', icon: 'watch_later', to: '/heures' },
    {
      id: 'maintenance', label: 'Maintenance', icon: 'build',
      children: [
        { label: 'Réparations', to: '/maintenance', tab: 'reparations' },
        { label: 'Inspections périodiques', to: '/maintenance', tab: 'inspections' },
        { label: 'Équipements perdus', to: '/maintenance', tab: 'perdus' },
      ],
    },
    { id: 'statistiques', label: 'Statistiques', icon: 'insert_chart', to: '/statistiques' },
  ],
]

const hrefOf = (c) => (c.tab ? `${c.to}?tab=${c.tab}` : c.to)
const leafActive = (to, pathname) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`))

/** Le sous-menu correspond-il à la page affichée (chemin, onglet, fiches de détail) ? */
function childActive(c, siblings, pathname, tab) {
  if (c.also && pathname.startsWith(c.also)) return true
  if (pathname === c.to) {
    if (!c.tab) return true
    return (tab || siblings.find((x) => x.to === c.to && x.tab)?.tab) === c.tab
  }
  if (c.prefix && pathname.startsWith(`${c.to}/`)) return !siblings.some((x) => x !== c && (pathname === x.to || pathname.startsWith(`${x.to}/`)))
  return false
}

export default function Layout() {
  const data = useStore()
  const idx = useIdx()
  const access = useAccess()
  const compact = useAuth((s) => s.profile?.preferences?.compact)
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  // Dans la configuration et l'éditeur de modèles, le menu se réduit aux icônes
  const isConfig = pathname === '/configuration'
  const isEditor = pathname.startsWith('/editeur/')
  const pinned = Boolean(useAuth((s) => s.profile?.preferences?.sidebarPinned)) && !isConfig && !isEditor
  const [peek, setPeek] = useState(false)
  const peekTimer = useRef(null)
  const expanded = pinned || peek
  const [quick, setQuick] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  // Alertes limitées aux modules accessibles (et aux finances si elles sont visibles)
  const alerts = useMemo(() => computeAlerts(idx).filter((a) => (a.kind !== 'late' || access.finances) && access.can(moduleOfPath(a.to.split('?')[0]) || 'dashboard')), [idx, access])
  // Modules et sous-modules accessibles au rôle
  const nav = NAV.map((group) =>
    group
      .map((it) => (it.children ? { ...it, children: it.children.filter((c) => access.can(c.module || it.id) && moduleEnabled(data.settings, c.module || it.id)) } : it))
      .filter((it) => (it.children ? it.children.length > 0 : access.can(it.id) && moduleEnabled(data.settings, it.id)) && (!it.finance || access.finances)),
  ).filter((g) => g.length)
  const current = moduleOfPath(pathname)
  // Un document non financier (bon de préparation, feuille de route…) appartient au module Projets
  const shownDoc = pathname.startsWith('/documents/') ? data.documents.find((d) => d.id === pathname.split('/')[2]) : null
  const navPath = shownDoc && !isFinancialDoc(shownDoc) ? `/projets/${shownDoc.projectId}` : pathname
  const readOnly = current && current !== 'configuration' && access.level(current) === 'lecture'
  const badges = {
    shortages: alerts.filter((a) => a.kind === 'shortage').length,
    requests: data.requests.filter((r) => r.status === 'nouvelle').length,
  }

  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable
      if (typing) return
      if (e.key === '/') {
        e.preventDefault()
        setQuick(true)
      } else if (e.key === '?' && e.shiftKey) {
        e.preventDefault()
        setShortcuts(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Le menu se déplie au survol ; le cadenas le garde ouvert (préférence du compte)
  const hover = (on) => {
    clearTimeout(peekTimer.current)
    peekTimer.current = setTimeout(() => setPeek(on), on ? 120 : 220)
  }
  const togglePin = () => {
    setPreference('sidebarPinned', !pinned)
    setPeek(false)
  }
  useEffect(() => setPeek(false), [pathname])

  return (
    <div className={`app ${pinned ? 'expanded' : ''} ${compact ? 'compact' : ''}`}>
      <aside className={`sidebar ${expanded ? 'is-open' : ''} ${peek && !pinned ? 'peek' : ''}`} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
        <div className="side-top">
          <button className="side-logo" onClick={togglePin} aria-label={pinned ? 'Libérer le menu' : 'Garder le menu ouvert'} title={data.settings.companyName}>R</button>
          <div className="side-account" aria-hidden={!expanded}>
            <strong>{data.settings.companyName}</strong>
            <span>{window.location.host}</span>
          </div>
          <button className="side-lock" onClick={togglePin} tabIndex={expanded ? 0 : -1} title={pinned ? 'Libérer le menu (il se replie)' : 'Garder le menu ouvert'} aria-label={pinned ? 'Libérer le menu' : 'Verrouiller le menu ouvert'}>
            <Icon name={pinned ? 'lock' : 'lock_open'} size={20} />
          </button>
        </div>
        <div className="side-scroll">
          {nav.map((group, i) => (
            <nav key={i} className="side-group">
              {group.map((it) => <SideItem key={it.id} item={it} expanded={expanded} pathname={navPath} tab={params.get('tab')} badges={badges} />)}
            </nav>
          ))}
          {(access.can('configuration') || access.admin) && (
            <nav className="side-group side-bottom">
              <SideItem item={{ id: 'configuration', label: 'Configuration', icon: 'settings', to: '/configuration', also: '/editeur/' }} expanded={expanded} pathname={pathname} badges={badges} />
            </nav>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <RecentTabs />
          <div className="top-actions">
            <SyncIndicator />
            {access.can('heures', 'modification') && (
              <div className="top-cell">
                <ClockButton />
              </div>
            )}
            <div className="top-cell">
              <button className="top-icon" onClick={() => setQuick(true)} aria-label="Accès rapide (/)" title="Accès rapide ( / )">
                <Icon name="search" size={23} />
              </button>
              {(access.can('equipements') || access.can('projets')) && <QuickAvailability />}
            </div>
            <div className="top-cell">
              <button className="top-icon" onClick={() => setShortcuts(true)} aria-label="Aide et raccourcis" title="Aide et raccourcis (Maj + ?)">
                <Icon name="help_outline" size={23} />
              </button>
            </div>
            <div className="top-cell">
              <Notifications alerts={alerts} />
            </div>
            <div className="top-cell top-user">
              <UserMenu onShortcuts={() => setShortcuts(true)} />
            </div>
          </div>
        </header>
        <div className="main-body">
        {isConfig && <ConfigMenu />}
        <main className={`content ${isEditor ? 'content-editor' : ''}`}>
          {readOnly && (
            <div className="readonly-bar">
              <Icon name="visibility" size={18} /> Lecture seule : votre rôle « {access.roleName} » permet de consulter « {MODULE_BY_ID[current]?.label} » sans le modifier.
            </div>
          )}
          {data.bootError && (
            <div className="alert alert-danger" style={{ marginTop: 16 }}>
              <Icon name="error" size={18} />
              <div>
                <strong>Connexion à Supabase impossible</strong> : {data.bootError}. Lancez la base avec <code>npm run db:start</code> puis rechargez la page.
              </div>
            </div>
          )}
          <div className="page-anim" key={pathname}>
            <Outlet />
          </div>
        </main>
        </div>
      </div>
      {quick && <QuickAccess onClose={() => setQuick(false)} />}
      {shortcuts && <Shortcuts onClose={() => setShortcuts(false)} />}
      <Toasts />
    </div>
  )
}

/** Menu de la configuration (Compte, Paramètres, Communication client, Finance), à côté du menu d'icônes. */
function ConfigMenu() {
  const access = useAccess()
  const [params] = useSearchParams()
  const current = params.get('s') || defaultSection(access)
  let i = 0
  return (
    <nav className="config-menu" aria-label="Menu de la configuration">
      {configMenuFor(access).map((g) => (
        <div key={g.title} className="config-group">
          <div className="config-title" style={{ '--i': i++ }}>{g.title}</div>
          {g.items.map((it) => (
            <Link key={it.id} to={`/configuration?s=${it.id}`} className={`config-link ${current === it.id ? 'active' : ''}`} style={{ '--i': i++ }} title={it.label}>
              {it.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}

function SideItem({ item, expanded, pathname, tab, badges }) {
  const navigate = useNavigate()
  const children = item.children
  const activeChild = children?.find((c) => childActive(c, children, pathname, tab))
  const [open, setOpen] = useState(Boolean(activeChild))
  // La page affichée ouvre toujours son module
  useEffect(() => {
    if (activeChild) setOpen(true)
  }, [activeChild])
  const count = (children ? children.reduce((n, c) => n + (badges[c.badge] || 0), 0) : badges[item.badge]) || 0
  const badge = count ? <span className="side-count">{count}</span> : null
  if (!children)
    return (
      <Link to={item.to} className={`side-link ${leafActive(item.to, pathname) || (item.also && pathname.startsWith(item.also)) ? 'active' : ''}`} aria-label={item.label}>
        <Icon name={item.icon} size={22} />
        <span className="side-label">{item.label}</span>
        {badge}
      </Link>
    )
  // Menu replié : l'icône ouvre le premier sous-menu ; déplié : elle ouvre ou ferme la liste
  const isOpen = expanded && open
  return (
    <>
      <button
        className={`side-link side-parent ${!expanded && activeChild ? 'active' : ''} ${isOpen ? 'open' : ''}`}
        onClick={() => (expanded ? setOpen(!open) : navigate(hrefOf(children[0])))}
        aria-expanded={isOpen}
        aria-label={item.label}
      >
        <Icon name={item.icon} size={22} />
        <span className="side-label">{item.label}</span>
        {!isOpen && badge}
        <Icon name="expand_more" size={22} className="side-chevron" />
      </button>
      <div className={`side-sub-wrap ${isOpen ? 'open' : ''}`}>
        <div className="side-sub">
          {children.map((c, i) => (
            <Link key={hrefOf(c)} to={hrefOf(c)} tabIndex={isOpen ? 0 : -1} className={`side-sublink ${c === activeChild ? 'active' : ''}`} style={{ '--i': i }}>
              <span className="side-label">{c.label}</span>
              {badges[c.badge] ? <span className="side-count">{badges[c.badge]}</span> : null}
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}

const TAB_ICONS = { projet: 'table_chart', materiel: 'category', document: 'description', commande: 'shopping_cart', contact: 'contact_phone', personnel: 'people' }

function RecentTabs() {
  const { tabs, close } = useRecent()
  const idx = useIdx()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const label = (t) =>
    ({
      projet: idx.project[t.id] && `${idx.project[t.id].number} ${idx.project[t.id].name}`,
      materiel: idx.eq[t.id]?.name,
      document: idx.d.documents.find((d) => d.id === t.id)?.number,
      commande: idx.d.purchaseOrders.find((p) => p.id === t.id)?.number,
      contact: idx.contact[t.id] && contactName(idx.contact[t.id]),
      personnel: idx.crew[t.id] && personName(idx.crew[t.id]),
    })[t.type]
  const visible = tabs.map((t) => ({ ...t, label: label(t) })).filter((t) => t.label)
  return (
    <div className="rtabs">
      {visible.map((t) => (
        <div key={t.key} className={`rtab ${pathname === t.path ? 'active' : ''}`} onClick={() => navigate(t.path)} title={t.label}>
          <Icon name={TAB_ICONS[t.type] || 'description'} size={19} />
          <span className="lbl">{t.label}</span>
          <button
            className="rtab-close"
            aria-label={`Fermer ${t.label}`}
            onClick={(e) => {
              e.stopPropagation()
              close(t.key)
              if (pathname === t.path) navigate(-1)
            }}
          >
            <Icon name="cancel" size={17} />
          </button>
        </div>
      ))}
    </div>
  )
}

function SyncIndicator() {
  const { state, error, savedAt } = useSyncStatus()
  const map = {
    local: ['cloud_off', 'Stockage local', '#8a929c'],
    loading: ['sync', 'Chargement…', '#8a929c'],
    saving: ['sync', 'Enregistrement…', '#1f87e5'],
    saved: ['cloud_done', 'Enregistré', '#19b26b'],
    error: ['cloud_off', 'Erreur d’enregistrement', '#e2284f'],
  }
  const [icon, label, color] = map[state] || map.local
  return (
    <div className="top-cell sync-indicator" title={error || (savedAt ? `Supabase · dernier enregistrement ${savedAt.toLocaleTimeString('fr-FR')}` : DB_ENABLED ? 'Supabase' : 'Données dans ce navigateur')} style={{ color }}>
      <Icon name={icon} size={19} className={state === 'saving' || state === 'loading' ? 'spin' : ''} />
      <span>{label}</span>
    </div>
  )
}

/** Pointage : démarre un chronomètre puis crée un enregistrement horaire. */
function ClockButton() {
  const { startedAt, crewId, start, stop } = useClock()
  const { crew, upsert } = useStore()
  const myCrew = useAuth((s) => s.profile?.crewId)
  const [, tick] = useState(0)
  const [who, setWho] = useState(crewId || myCrew || crew[0]?.id || '')
  useEffect(() => {
    if (!startedAt) return undefined
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [startedAt])
  const elapsed = startedAt ? Math.floor((Date.now() - new Date(startedAt)) / 1000) : 0
  const hms = `${fmtHM(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
  return (
    <Menu
      width={280}
      trigger={
        <button className={`top-clock ${startedAt ? 'on' : ''}`} title="Pointage">
          <Icon name="timer" size={20} />
          <span className="mono">{startedAt ? hms : '00:00:00'}</span>
        </button>
      }
    >
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <strong>Pointage</strong>
        <select className="select input-sm" value={startedAt ? crewId : who} disabled={!!startedAt} onChange={(e) => setWho(e.target.value)} aria-label="Membre du personnel">
          {crew.map((c) => <option key={c.id} value={c.id}>{personName(c)}</option>)}
        </select>
        {startedAt ? (
          <button
            className="btn btn-primary"
            data-close
            onClick={() => {
              const end = new Date()
              upsert('timeEntries', { id: uid('te_'), crewId, projectId: null, functionId: null, kind: 'travail', startsAt: toLocalInput(new Date(startedAt)), endsAt: toLocalInput(end), breakMinutes: 0, travelMinutes: 0, activity: 'Pointage', status: 'soumis', notes: `Pointé par ${currentUserName()}`, createdAt: end.toISOString() })
              stop()
              toast('Heures enregistrées dans « Enregistrement horaire »')
            }}
          >
            <Icon name="stop" size={18} /> Pointer le départ
          </button>
        ) : (
          <button className="btn btn-primary" data-close onClick={() => start(who)} disabled={!who}>
            <Icon name="play_arrow" size={18} /> Pointer l’arrivée
          </button>
        )}
      </div>
    </Menu>
  )
}

/** Vérification rapide des disponibilités (icône « timelapse » de Rentman). */
function QuickAvailability() {
  const idx = useIdx()
  const [q, setQ] = useState('')
  const [from, setFrom] = useState(() => toLocalInput(addDays(startOfDay(new Date()), 1)))
  const [to, setTo] = useState(() => toLocalInput(addDays(startOfDay(new Date()), 3)))
  const results = q.trim().length >= 3 ? idx.d.equipment.filter((e) => matches(q, e.name, e.code)).slice(0, 8) : []
  return (
    <Menu
      width={380}
      trigger={
        <button className="top-icon" aria-label="Vérification rapide des disponibilités" title="Vérification rapide des disponibilités">
          <Icon name="timelapse" size={23} />
        </button>
      }
    >
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <strong>Vérifier une disponibilité</strong>
        <input className="input" autoFocus placeholder="Équipement (3 lettres minimum)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row">
          <input type="datetime-local" className="input input-sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Début" />
          <input type="datetime-local" className="input input-sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Fin" />
        </div>
        {results.map((e) => {
          const n = from && to ? available(idx, e.id, from, to) : 0
          return (
            <div key={e.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{e.name}</span>
              <span className={`avail-pill tl-seg ${n < 0 ? 'short' : n === 0 ? 'zero' : 'ok'}`} style={{ position: 'static' }}>{n}</span>
            </div>
          )
        })}
        {q.trim().length >= 3 && !results.length && <span className="muted small">Aucun équipement trouvé.</span>}
      </div>
    </Menu>
  )
}

const ALERT_ICONS = { shortage: 'swap_horizontal_circle', conflict: 'people', unfilled: 'person_add', late: 'monetization_on', inspection: 'build', request: 'move_to_inbox' }

function Notifications({ alerts }) {
  const navigate = useNavigate()
  return (
    <Menu
      width={400}
      trigger={
        <button className="top-icon" aria-label="Notifications">
          <Icon name="notifications" size={23} />
          {alerts.length > 0 && <span className="top-badge">{alerts.length}</span>}
        </button>
      }
    >
      <div className="popover-head">Notifications ({alerts.length})</div>
      {alerts.length === 0 && <div className="empty" style={{ padding: 24 }}>Rien à signaler.</div>}
      <div className="list" style={{ maxHeight: 420, overflow: 'auto' }}>
        {alerts.map((a) => (
          <div key={a.id} className="list-item clickable" data-close onClick={() => navigate(a.to)}>
            <Icon name={ALERT_ICONS[a.kind] || 'info'} size={20} style={{ color: a.kind === 'unfilled' || a.kind === 'request' ? 'var(--warning)' : 'var(--danger)' }} />
            <div style={{ minWidth: 0 }}>
              <div className="title">{a.title}</div>
              <div className="meta">{a.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </Menu>
  )
}

function UserMenu({ onShortcuts }) {
  const profile = useAuth((s) => s.profile)
  const access = useAccess()
  const navigate = useNavigate()
  const name = profile?.fullName || 'Utilisateur'
  const ini = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const compact = profile?.preferences?.compact
  return (
    <Menu
      width={270}
      trigger={
        <button className="top-user-btn">
          <span className="avatar">{ini}</span>
          <span className="name">{name}</span>
        </button>
      }
      items={[
        { icon: 'account_circle', label: 'Mon profil', onClick: () => navigate('/configuration?s=profil') },
        { icon: compact ? 'view_agenda' : 'view_headline', label: compact ? 'Affichage normal' : 'Mode compact', onClick: () => setPreference('compact', !compact) },
        { icon: 'keyboard', label: 'Afficher / cacher les raccourcis', onClick: onShortcuts },
        (access.can('configuration') || access.admin) && { icon: 'settings', label: 'Configuration', onClick: () => navigate('/configuration') },
        DB_ENABLED && '-',
        DB_ENABLED && { icon: 'logout', label: 'Se déconnecter', onClick: () => signOut() },
      ]}
    >
      <div className="user-head">
        <strong>{name}</strong>
        <span>{profile?.email || 'Compte local'} · {access.roleName}</span>
      </div>
    </Menu>
  )
}

/** Menu d'accès rapide (touche « / ») : onglets ouverts, projets, équipements, contacts, factures… */
function QuickAccess({ onClose }) {
  const idx = useIdx()
  const access = useAccess()
  const { tabs } = useRecent()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [hl, setHl] = useState(0)
  const inputRef = useRef(null)
  useEffect(() => inputRef.current?.focus(), [])
  const d = idx.d
  const results = useMemo(() => {
    const out = []
    const add = (group, list, map) => list.slice(0, 5).map((x) => ({ group, ...map(x) })).filter((r) => access.can(moduleOfPath(r.to.split('?')[0])) && (!r.finance || access.finances)).forEach((r) => out.push(r))
    if (!q.trim()) {
      add('Onglets ouverts', tabs, (t) => ({ label: t.path, icon: TAB_ICONS[t.type], to: t.path }))
      return out
    }
    add('Projets', d.projects.filter((p) => matches(q, p.name, p.number, contactName(idx.contact[p.clientId]))), (p) => ({ label: `${p.number} ${p.name}`, icon: 'table_chart', to: `/projets/${p.id}` }))
    add('Équipements', d.equipment.filter((e) => matches(q, e.name, e.code)), (e) => ({ label: e.name, meta: e.code, icon: 'category', to: `/equipements/${e.id}` }))
    add('Contacts', d.contacts.filter((c) => matches(q, contactName(c), c.firstName, c.lastName, c.email, c.city)), (c) => ({ label: contactName(c), meta: c.city, icon: 'contact_phone', to: `/contacts/${c.id}` }))
    add('Factures', d.documents.filter((x) => isFinancialDoc(x) && matches(q, x.number)), (x) => ({ label: x.number, icon: 'monetization_on', to: `/documents/${x.id}`, finance: true }))
    add('Sous-locations', d.subrents.filter((x) => matches(q, x.number, contactName(idx.contact[x.supplierId]))), (x) => ({ label: x.number, meta: contactName(idx.contact[x.supplierId]), icon: 'swap_horizontal_circle', to: '/penuries?tab=souslocations' }))
    add('Membres du personnel', d.crew.filter((c) => matches(q, personName(c), c.functions.join(' '))), (c) => ({ label: personName(c), meta: c.functions[0], icon: 'people', to: `/personnel/${c.id}` }))
    add('Réparations', d.repairs.filter((r) => matches(q, r.number, r.title, idx.eq[r.equipmentId]?.name)), (r) => ({ label: `${r.number} ${r.title}`, icon: 'build', to: '/maintenance' }))
    add('Tâches', d.tasks.filter((t) => matches(q, t.title)), (t) => ({ label: t.title, icon: 'assignment_turned_in', to: t.projectId ? `/projets/${t.projectId}?tab=taches` : '/taches' }))
    add('Véhicules', d.vehicles.filter((v) => matches(q, v.name, v.plate)), (v) => ({ label: v.name, meta: v.plate, icon: 'local_shipping', to: '/vehicules' }))
    return out
  }, [q, d, idx, tabs, access])
  const go = (r) => {
    navigate(r.to)
    onClose()
  }
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="quick-access" role="dialog" aria-label="Accès rapide">
        <div className="qa-input">
          <Icon name="search" size={22} />
          <input
            ref={inputRef}
            placeholder="Rechercher un projet, un équipement, un contact, une facture…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setHl(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setHl((h) => Math.min(h + 1, results.length - 1))
              if (e.key === 'ArrowUp') setHl((h) => Math.max(h - 1, 0))
              if (e.key === 'Enter' && results[hl]) go(results[hl])
              if (e.key === 'Escape') onClose()
            }}
          />
          <kbd>Échap</kbd>
        </div>
        <div className="qa-results">
          {results.length === 0 && <div className="muted" style={{ padding: 16 }}>{q ? 'Aucun résultat' : 'Tapez pour rechercher.'}</div>}
          {results.map((r, i) => (
            <div key={i}>
              {(i === 0 || results[i - 1].group !== r.group) && <div className="qa-group">{r.group}</div>}
              <button className={`qa-item ${i === hl ? 'hl' : ''}`} onMouseEnter={() => setHl(i)} onClick={() => go(r)}>
                <Icon name={r.icon || 'description'} size={19} />
                <span className="lbl">{r.label}</span>
                {r.meta && <span className="meta">{r.meta}</span>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Shortcuts({ onClose }) {
  const rows = [
    ['/', 'Ouvrir le menu d’accès rapide'],
    ['Maj + ?', 'Afficher / cacher les raccourcis'],
    ['↑ ↓ puis Entrée', 'Naviguer et ouvrir un résultat'],
    ['Échap', 'Fermer une fenêtre'],
    ['Double-clic', 'Ajouter un équipement du catalogue à un projet'],
  ]
  return (
    <Modal title="Raccourcis clavier" onClose={onClose}>
      <div className="table-wrap">
        <table className="table">
          <tbody>
            {rows.map(([k, l]) => (
              <tr key={k}>
                <td style={{ width: 160 }}><kbd>{k}</kbd></td>
                <td>{l}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        Les données sont {DB_ENABLED ? 'enregistrées dans la base Supabase locale (Studio : http://127.0.0.1:54523).' : 'enregistrées dans ce navigateur.'}
      </p>
    </Modal>
  )
}
