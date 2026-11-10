import TaskBoard from '../components/TaskBoard'
import { Icon } from '../components/ui'

export default function Tasks() {
  return (
    <>
      <div className="page-header">
        <h1>
          Tâches <span className="help-dot" title="Toutes les tâches, liées ou non à un projet"><Icon name="help_outline" size={20} /></span>
        </h1>
      </div>
      <TaskBoard />
    </>
  )
}
