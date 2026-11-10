import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store'
import { useAccess, useAuth } from './lib/auth'
import { MODULE_BY_ID, moduleEnabled } from './lib/permissions'
import Layout from './components/Layout'
import { Empty } from './components/ui'
import Login, { AuthError, PendingAccount } from './pages/Login'
import Dashboard from './pages/Dashboard'
import Agenda from './pages/Calendar'
import WarehousePage from './pages/Warehouse'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import CrewPlanner from './pages/CrewPlanner'
import Shortages from './pages/Shortages'
import Finance from './pages/Finance'
import DocumentView from './pages/DocumentView'
import PurchaseOrderView from './pages/PurchaseOrderView'
import LabelPrint from './pages/LabelPrint'
import Equipment from './pages/Equipment'
import EquipmentDetail from './pages/EquipmentDetail'
import Contacts from './pages/Contacts'
import Crew from './pages/Crew'
import Vehicles from './pages/Vehicles'
import Tasks from './pages/Tasks'
import TimeRegistration from './pages/TimeRegistration'
import Maintenance from './pages/Maintenance'
import Statistics from './pages/Statistics'
import Requests from './pages/Requests'
import Settings from './pages/Settings'
import TemplateEditor from './pages/TemplateEditor'
import SignDocument from './pages/SignDocument'
import NotFound from './pages/NotFound'
import Appointments from './pages/agenda/Appointments'
import JobBoard from './pages/agenda/JobBoard'
import Combinations from './pages/warehouse/Combinations'
import TrackingLog from './pages/warehouse/TrackingLog'
import { ArchivedEquipment, SerialNumbers, StockLocations } from './pages/equipment/SubModules'

const Splash = ({ text }) => (
  <div className="splash">
    <span className="material-icons spin">sync</span>
    {text}
  </div>
)

/** Page réservée : le module doit être accessible au rôle du compte connecté. */
function Guard({ module, finances = false, children }) {
  const access = useAccess()
  const settings = useStore((s) => s.settings)
  if (module === 'dashboard' && !access.can('dashboard')) return <Navigate to={access.home()} replace />
  const mods = [].concat(module)
  if (!mods.some((m) => moduleEnabled(settings, m)))
    return (
      <div className="card" style={{ marginTop: 26 }}>
        <Empty icon="extension_off" title="Extension désactivée" text={`Le module « ${MODULE_BY_ID[mods[0]]?.label} » est désactivé pour cet espace de travail (Configuration › Extensions).`} />
      </div>
    )
  if (mods.some((m) => access.can(m)) && (!finances || access.finances)) return children
  return (
    <div className="card" style={{ marginTop: 26 }}>
      <Empty
        icon="lock"
        title="Accès refusé"
        text={`Votre rôle « ${access.roleName} » ne donne pas accès au module « ${MODULE_BY_ID[mods[0]]?.label} ». Demandez à un administrateur de modifier vos droits.`}
      />
    </div>
  )
}

const page = (module, element, finances) => <Guard module={module} finances={finances}>{element}</Guard>

export default function App() {
  const status = useAuth((s) => s.status)
  const ready = useStore((s) => s.ready)
  if (status === 'loading') return <Splash text="Connexion…" />
  if (status === 'signedOut') return <Login />
  if (status === 'pending') return <PendingAccount />
  if (status === 'error') return <AuthError />
  if (!ready) return <Splash text="Chargement des données depuis Supabase…" />
  return (
    <BrowserRouter>
      <Routes>
        {/* Page de signature numérique : pleine page, sans le menu */}
        <Route path="signer/:id" element={<SignDocument />} />
        <Route element={<Layout />}>
          <Route index element={page('dashboard', <Dashboard />)} />
          <Route path="agenda" element={page('agenda', <Agenda />)} />
          <Route path="agenda/rendez-vous" element={page('agenda', <Appointments />)} />
          <Route path="agenda/job-board" element={page('agenda', <JobBoard />)} />
          <Route path="entrepot" element={page('entrepot', <WarehousePage />)} />
          <Route path="entrepot/combinaisons" element={page('entrepot', <Combinations />)} />
          <Route path="entrepot/registre" element={page('entrepot', <TrackingLog />)} />
          <Route path="projets" element={page('projets', <Projects />)} />
          <Route path="projets/:id" element={page('projets', <ProjectDetail />)} />
          <Route path="planificateur" element={page('planificateur', <CrewPlanner />)} />
          <Route path="penuries" element={page('penuries', <Shortages />)} />
          <Route path="finances" element={page('finances', <Finance />, true)} />
          {/* Les documents financiers restent réservés aux finances (contrôlé dans la vue) */}
          <Route path="documents/:id" element={page(['finances', 'projets'], <DocumentView />)} />
          <Route path="bons-de-commande/:id" element={page(['finances', 'projets', 'penuries'], <PurchaseOrderView />)} />
          <Route path="etiquettes" element={page(['equipements', 'entrepot'], <LabelPrint />)} />
          <Route path="equipements" element={page('equipements', <Equipment />)} />
          <Route path="equipements/numeros-de-serie" element={page('equipements', <SerialNumbers />)} />
          <Route path="equipements/emplacements" element={page('equipements', <StockLocations />)} />
          <Route path="equipements/archives" element={page('equipements', <ArchivedEquipment />)} />
          <Route path="equipements/emplacements-archives" element={page('equipements', <StockLocations archived />)} />
          <Route path="equipements/:id" element={page('equipements', <EquipmentDetail />)} />
          <Route path="contacts/:id?" element={page('contacts', <Contacts />)} />
          <Route path="personnel/:id?" element={page('personnel', <Crew />)} />
          <Route path="vehicules" element={page('vehicules', <Vehicles />)} />
          <Route path="taches" element={page('taches', <Tasks />)} />
          <Route path="heures" element={page('heures', <TimeRegistration />)} />
          <Route path="maintenance" element={page('maintenance', <Maintenance />)} />
          <Route path="statistiques" element={page('statistiques', <Statistics />, true)} />
          <Route path="demandes" element={page('demandes', <Requests />)} />
          {/* La configuration contient « Mon profil », ouvert à tous les comptes */}
          <Route path="configuration" element={<Settings />} />
          <Route path="editeur/:id" element={page('configuration', <TemplateEditor />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
