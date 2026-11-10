// Modèles de projets (Configuration › Modèles de projets) : planning calculé à partir de la date de début.
import { addDays, toDateInput, toLocalInput } from './utils'

/** Modèles par défaut proposés avant ceux de l'espace de travail (comme Rentman). */
export const DEFAULT_PROJECT_TEMPLATES = [
  { id: 'blank', name: 'Projet vierge', icon: 'note_add' },
  { id: 'sale', name: 'Sans horaires (vente)', icon: 'sell', noTimes: true },
]
export const BLANK_TRANSFER = { id: 'transfer', name: 'Transfert vierge', icon: 'move_down' }

const day = (date) => {
  const [y, m, d] = String(date || toDateInput(new Date())).split('-').map(Number)
  return new Date(y, m - 1, d)
}
/** Heure d'un modèle : nombre (9) ou texte « 09:00 » ; valeur par défaut si illisible. */
const hourOf = (v, def) => {
  const n = typeof v === 'string' ? Number(v.split(':')[0]) : Number(v)
  return Number.isFinite(n) && n >= 0 && n < 24 ? Math.floor(n) : def
}
const at = (base, offset, h, min = 0) => {
  const x = addDays(base, offset)
  x.setHours(h, min, 0, 0)
  return toLocalInput(x)
}

/**
 * Périodes d'utilisation et de planification d'un nouveau projet.
 * Modèle : days (durée d'utilisation), startHour / endHour, prepDays (sortie de l'entrepôt avant), returnDays (retour après).
 */
export function templatePeriods(tpl, startDate, settings = {}) {
  const base = day(startDate)
  if (tpl?.noTimes) return { useStart: at(base, 0, 0), useEnd: at(base, 0, 23, 59), planStart: at(base, 0, 0), planEnd: at(base, 0, 23, 59) }
  const days = Math.max(1, Math.round(Number(tpl?.days) || 1))
  const startHour = hourOf(tpl?.startHour, hourOf(settings.defaultStartHour, 9))
  const endHour = hourOf(tpl?.endHour, hourOf(settings.defaultEndHour, 23))
  // Une soirée qui finit à 2 h se termine le lendemain
  const lastDay = days - 1 + (endHour <= startHour ? 1 : 0)
  const prep = Math.max(0, Math.round(Number(tpl?.prepDays ?? 1)) || 0)
  const back = Math.max(0, Math.round(Number(tpl?.returnDays ?? 1)) || 0)
  return {
    useStart: at(base, 0, startHour),
    useEnd: at(base, lastDay, endHour),
    planStart: at(base, -prep, 8),
    planEnd: at(base, lastDay + back, 12),
  }
}

/** Période d'un transfert : départ le jour choisi, arrivée le lendemain (modifiables ensuite). */
export function transferPeriods(startDate) {
  const base = day(startDate)
  return { planStart: at(base, 0, 8), planEnd: at(base, 1, 12), useStart: at(base, 0, 8), useEnd: at(base, 1, 12) }
}
