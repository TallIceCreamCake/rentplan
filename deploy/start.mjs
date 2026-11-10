#!/usr/bin/env node
/**
 * Superviseur RentPlan : lance deploy/agent.mjs et le relance
 *  - immédiatement quand il demande un redémarrage (code 75, après sa propre mise à jour) ;
 *  - avec un délai croissant s'il s'arrête sur une erreur.
 * Volontairement minimal pour ne presque jamais changer. S'il est lui-même modifié par une mise à jour,
 * il s'arrête avec le code 75 et le service système (systemd / tâche planifiée Windows) le relance.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const AGENT = path.join(path.dirname(SELF), 'agent.mjs')
const LOG_FILE = path.join(path.dirname(SELF), '..', '.rentplan', 'logs', 'agent.log')
const RESTART_CODE = 75
const fingerprint = () => createHash('sha256').update(fs.readFileSync(SELF)).digest('hex')
const initial = fingerprint()

function log(message) {
  const line = `${new Date().toISOString()} [SUPERVISEUR] ${message}`
  console.log(line)
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
    fs.appendFileSync(LOG_FILE, line + '\n')
  } catch {
    // sans journal, on continue
  }
}

let child = null
let stopping = false
let failures = 0

function launch() {
  const startedAt = Date.now()
  child = spawn(process.execPath, [AGENT, 'serve'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true })
  child.on('exit', (code, signal) => {
    child = null
    if (stopping) return process.exit(0)
    if (code === RESTART_CODE) {
      if (fingerprint() !== initial) {
        log('nouvelle version du superviseur : redémarrage complet du service')
        return process.exit(RESTART_CODE)
      }
      failures = 0
      return launch()
    }
    failures = Date.now() - startedAt > 5 * 60_000 ? 1 : failures + 1
    const delay = Math.min(60, 2 ** failures) * 1000
    log(`agent arrêté (${signal || `code ${code}`}), relance dans ${delay / 1000} s`)
    setTimeout(launch, delay)
  })
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    stopping = true
    if (!child) process.exit(0)
    child.kill('SIGTERM')
    setTimeout(() => process.exit(0), 5000).unref()
  })
}

launch()
