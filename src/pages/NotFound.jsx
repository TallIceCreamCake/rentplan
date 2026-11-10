import { Link } from 'react-router-dom'
import { Empty } from '../components/ui'

export default function NotFound({ what = 'Cette page' }) {
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <Empty icon="search_off" title={`${what} n'existe pas`} text="Elle a peut-être été supprimée." action={<Link className="btn" to="/">Retour au tableau de bord</Link>} />
    </div>
  )
}
