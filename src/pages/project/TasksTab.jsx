import TaskBoard from '../../components/TaskBoard'

export default function TasksTab({ project }) {
  return <TaskBoard projectId={project.id} />
}
