#!/usr/bin/env node
/**
 * Agent RentPlan : sert l'application compilée et la met à jour automatiquement depuis GitHub.
 *
 *   node deploy/agent.mjs serve        lancé par deploy/start.mjs (serveur + mises à jour)
 *   node deploy/agent.mjs setup        première installation (git, dépendances, build, Supabase)
 *   node deploy/agent.mjs status       état du service en cours d'exécution
 *   node deploy/agent.mjs update-now   force une vérification immédiate
 *
 * Aucune dépendance npm : uniquement Node.js (20+), git et, pour la base, Docker.
 * Fonctionne à l'identique sous Windows, Linux et macOS, quel que soit le dossier d'installation.
 */
import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUNTIME = path.join(ROOT, '.rentplan')
const RELEASES = path.join(RUNTIME, 'releases')
const LOG_DIR = path.join(RUNTIME, 'logs')
const LOG_FILE = path.join(LOG_DIR, 'agent.log')
const STATE_FILE = path.join(RUNTIME, 'state.json')
const CONFIG_FILE = path.join(ROOT, 'deploy', 'config.json')
const IS_WIN = process.platform === 'win32'

/** Code de sortie demandant au superviseur de relancer l'agent (nouvelle version du module de mise à jour). */
const RESTART_CODE = 75
const RETRY_FAILED_MS = 60 * 60_000 // une version qui a échoué est retentée au plus une fois par heure
const KEEP_RELEASES = 3
const MIN = 60_000

const DEFAULT_CONFIG = {
  repository: 'https://github.com/TallIceCreamCake/rentplan.git',
  branch: 'main',
  host: '0.0.0.0',
  port: 8080,
  checkIntervalMinutes: 5,
  manageSupabase: true,
  githubToken: '',
}

// ---------- Journal ----------

function log(level, message) {
  const line = `${new Date().toISOString()} [${level}] ${message}`
  ;(level === 'ERREUR' ? console.error : console.log)(line)
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 5 * 1024 * 1024) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`)
    fs.appendFileSync(LOG_FILE, line + '\n')
  } catch {
    // le journal ne doit jamais faire tomber l'agent
  }
}
const info = (m) => log('INFO', m)
const warn = (m) => log('ATTENTION', m)
const fail = (m) => log('ERREUR', m)
const short = (sha) => (sha ? sha.slice(0, 7) : '—')
const firstLines = (err, n = 6) => String(err?.message || err).split('\n').filter(Boolean).slice(0, n).join('\n')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- Configuration et état ----------

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

const loadConfig = () => ({ ...DEFAULT_CONFIG, ...readJson(CONFIG_FILE, {}) })
const config = loadConfig()
const state = readJson(STATE_FILE, {})
const saveState = () => {
  try {
    writeJson(STATE_FILE, state)
  } catch (e) {
    warn(`État non enregistré : ${e.message}`)
  }
}

// ---------- Commandes externes ----------

/** Lance une commande sans shell (chemins avec espaces sûrs) et renvoie sa sortie. */
function run(cmd, args, { cwd = ROOT, env = {}, timeoutMs = 10 * MIN, shell = false } = {}) {
  return new Promise((resolve, reject) => {
    let out = ''
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell, windowsHide: true })
    const collect = (d) => {
      out += d
      if (out.length > 400_000) out = out.slice(-200_000)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new Error(`${path.basename(cmd)} introuvable ou impossible à lancer : ${e.message}`))
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) return resolve(out.trim())
      const why = signal ? `interrompu (${signal}, délai de ${Math.round(timeoutMs / MIN)} min dépassé ?)` : `code ${code}`
      reject(new Error(`${path.basename(cmd)} ${args.slice(0, 3).join(' ')} → ${why}\n${out.trim().split('\n').slice(-25).join('\n')}`))
    })
  })
}

/** Variables d'environnement git : jamais d'invite interactive, jeton GitHub facultatif (dépôt privé). */
function gitEnv() {
  const env = { GIT_TERMINAL_PROMPT: '0' }
  if (config.githubToken) {
    const basic = Buffer.from(`x-access-token:${config.githubToken}`).toString('base64')
    Object.assign(env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` })
  }
  return env
}
const git = (args, opts = {}) => run('git', args, { env: gitEnv(), timeoutMs: 3 * MIN, ...opts })
const gitOk = (args) => git(args).then(() => true, () => false)

/** Chemin du script d'un paquet installé (lu dans son package.json, donc indépendant de la version). */
function packageBin(pkg, name = pkg) {
  const dir = path.join(ROOT, 'node_modules', pkg)
  const manifest = readJson(path.join(dir, 'package.json'), null)
  if (!manifest) throw new Error(`Le paquet « ${pkg} » n'est pas installé (node_modules incomplet).`)
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[name]
  return path.join(dir, bin)
}

/** npm est lancé via son script JS quand on le trouve, ce qui évite le shell sous Windows. */
function npm(args, opts) {
  const nodeDir = path.dirname(process.execPath)
  const candidates = [
    process.env.npm_execpath,
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Windows
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Linux, macOS, nvm
  ]
  const cli = candidates.find((p) => p && /npm-cli\.js$/.test(p) && fs.existsSync(p))
  if (cli) return run(process.execPath, [cli, ...args], opts)
  return run(IS_WIN ? 'npm.cmd' : 'npm', args, { ...opts, shell: IS_WIN })
}

const supabase = (args, opts = {}) => run(process.execPath, [packageBin('supabase'), ...args], opts)

// ---------- Dépendances, build, base de données ----------

const lockHash = () => {
  try {
    return createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'package-lock.json'))).digest('hex')
  } catch {
    return null
  }
}

/** Réinstalle node_modules quand package-lock.json a changé depuis la dernière installation. */
async function ensureDependencies(force = false) {
  const hash = lockHash()
  if (!force && hash && hash === state.depsHash && fs.existsSync(path.join(ROOT, 'node_modules'))) return
  info('Installation des dépendances (npm ci)…')
  // Une installation interrompue doit être refaite au prochain passage
  state.depsHash = null
  saveState()
  await npm(['ci', '--include=dev', '--no-audit', '--no-fund', '--loglevel=error'], { timeoutMs: 30 * MIN })
  state.depsHash = hash
  saveState()
}

async function commitInfo(sha) {
  const [date = '', ...subject] = (await git(['log', '-1', '--format=%cI%n%s', sha])).split('\n')
  return { commitDate: date, message: subject.join(' ') }
}

/** Compile la version dans .rentplan/releases/<sha> sans toucher à celle qui est servie. */
async function buildRelease(sha) {
  const dir = path.join(RELEASES, sha)
  const tmp = `${dir}.tmp`
  await fsp.rm(tmp, { recursive: true, force: true })
  const builtAt = new Date().toISOString()
  info(`Compilation de la version ${short(sha)}…`)
  await run(process.execPath, [packageBin('vite'), 'build', '--outDir', tmp, '--emptyOutDir', '--logLevel', 'warn'], {
    env: { VITE_APP_VERSION: sha, VITE_APP_BUILT_AT: builtAt },
    timeoutMs: 20 * MIN,
  })
  const meta = { version: sha, short: short(sha), builtAt, ...(await commitInfo(sha)) }
  await fsp.writeFile(path.join(tmp, 'version.json'), JSON.stringify(meta, null, 2))
  await fsp.rm(dir, { recursive: true, force: true })
  await fsp.rename(tmp, dir)
  return meta
}

function activate(meta) {
  state.current = meta.version
  state.currentInfo = meta
  saveState()
}

/** Supprime les anciennes compilations (on garde la version servie et les plus récentes). */
async function cleanupReleases() {
  try {
    const entries = await fsp.readdir(RELEASES, { withFileTypes: true })
    const dirs = await Promise.all(
      entries.filter((e) => e.isDirectory()).map(async (e) => ({ name: e.name, mtime: (await fsp.stat(path.join(RELEASES, e.name))).mtimeMs })),
    )
    const keep = new Set([state.current, ...dirs.filter((d) => !d.name.endsWith('.tmp')).sort((a, b) => b.mtime - a.mtime).slice(0, KEEP_RELEASES).map((d) => d.name)])
    for (const d of dirs) if (!keep.has(d.name)) await fsp.rm(path.join(RELEASES, d.name), { recursive: true, force: true }).catch(() => {})
  } catch {
    // dossier absent ou fichier verrouillé (Windows) : on réessaiera à la prochaine mise à jour
  }
}

async function migrateDatabase() {
  info('Application des migrations Supabase…')
  await supabase(['migration', 'up', '--local'], { timeoutMs: 10 * MIN })
}

/** Démarre Supabase (Docker) et applique les migrations ; réessaie tant que Docker n'est pas prêt. */
async function ensureSupabase() {
  for (let attempt = 1; ; attempt++) {
    try {
      await supabase(['start'], { timeoutMs: 40 * MIN })
      await migrateDatabase()
      state.supabase = { ok: true, at: new Date().toISOString() }
      saveState()
      info('Base Supabase prête.')
      return
    } catch (e) {
      state.supabase = { ok: false, at: new Date().toISOString(), error: firstLines(e, 3) }
      warn(`Supabase indisponible (tentative ${attempt}) — Docker est-il lancé ? ${firstLines(e, 3)}`)
      await sleep(Math.min(attempt, 5) * MIN)
    }
  }
}

// ---------- Mises à jour ----------

let queue = Promise.resolve()
let checking = false
let restartRequested = false
const enqueue = (task) => (queue = queue.then(task).catch((e) => fail(firstLines(e, 30))))

/** Au démarrage : s'assure que la version servie correspond au code présent sur le disque. */
async function ensureCurrentRelease() {
  const head = await git(['rev-parse', 'HEAD'])
  if (state.current === head && fs.existsSync(path.join(RELEASES, head, 'index.html'))) return
  info(`Préparation de la version ${short(head)} présente sur le disque…`)
  await ensureDependencies()
  activate(await buildRelease(head))
  cleanupReleases()
  info(`Version ${short(head)} en ligne.`)
}

async function checkForUpdate(reason = 'planifiée') {
  if (checking) return
  checking = true
  state.lastCheck = new Date().toISOString()
  try {
    const branch = config.branch
    await git(['fetch', '--quiet', '--no-tags', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], { timeoutMs: 5 * MIN })
    const remote = await git(['rev-parse', `refs/remotes/origin/${branch}`])
    const head = await git(['rev-parse', 'HEAD'])
    state.lastResult = 'à jour'
    state.lastError = null

    if (remote === head) {
      if (state.current !== head) await ensureCurrentRelease()
      return
    }
    if (state.failed?.sha === remote && Date.now() - Date.parse(state.failed.at) < RETRY_FAILED_MS) {
      state.lastResult = `version ${short(remote)} en échec, nouvel essai plus tard`
      return
    }
    if (await git(['status', '--porcelain', '--untracked-files=no'])) {
      state.lastResult = 'mise à jour bloquée : fichiers modifiés localement'
      return warn(`Nouvelle version ${short(remote)} disponible mais des fichiers suivis par git ont été modifiés dans ${ROOT} : mise à jour ignorée (git status pour les voir).`)
    }
    if (!(await gitOk(['merge-base', '--is-ancestor', head, remote]))) {
      state.lastResult = 'mise à jour bloquée : historique local différent de GitHub'
      return warn(`La version locale ${short(head)} contient des commits absents de GitHub (ou la branche a été réécrite) : mise à jour automatique ignorée.`)
    }

    info(`Mise à jour (${reason}) : ${short(head)} → ${short(remote)}`)
    state.lastResult = `installation de la version ${short(remote)} en cours`
    saveState()
    const changed = (await git(['diff', '--name-only', head, remote])).split('\n').filter(Boolean)
    await git(['merge', '--ff-only', '--quiet', remote])
    try {
      await ensureDependencies()
      const meta = await buildRelease(remote)
      if (config.manageSupabase && changed.some((f) => f.startsWith('supabase/migrations/'))) await migrateDatabase()
      if (changed.includes('supabase/config.toml')) warn('supabase/config.toml a changé : redémarrez Supabase (npm run db:stop puis npm run db:start) pour appliquer la nouvelle configuration.')
      activate(meta)
      delete state.failed
      state.lastResult = `mis à jour vers ${short(remote)}`
      info(`Version ${short(remote)} en ligne (${meta.message}).`)
      cleanupReleases()
      if (changed.some((f) => f.startsWith('deploy/'))) {
        info("Le module de mise à jour a changé : redémarrage de l'agent.")
        restartRequested = true
      }
    } catch (e) {
      // Retour au code précédent ; l'ancienne compilation continue d'être servie
      await git(['reset', '--hard', '--quiet', head]).catch((err) => fail(`Retour arrière impossible : ${err.message}`))
      state.failed = { sha: remote, at: new Date().toISOString(), error: firstLines(e, 12) }
      state.lastResult = `échec de la mise à jour vers ${short(remote)}, version ${short(head)} conservée`
      throw e
    }
  } catch (e) {
    state.lastError = firstLines(e, 12)
    throw e
  } finally {
    checking = false
    saveState()
    if (restartRequested) {
      await sleep(500)
      process.exit(RESTART_CODE)
    }
  }
}

// ---------- Serveur web ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
}

const INSTALLING_PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="refresh" content="10">
<title>RentPlan</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#eff1f4;color:#24282f}</style></head>
<body><div><h2>RentPlan est en cours d'installation…</h2><p>Cette page se rechargera automatiquement.</p></div></body></html>`

const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)

function statusPayload() {
  return {
    version: state.current || null,
    info: state.currentInfo || null,
    branch: config.branch,
    lastCheck: state.lastCheck || null,
    lastResult: state.lastResult || null,
    lastError: state.lastError || null,
    failed: state.failed || null,
    supabase: config.manageSupabase ? state.supabase || null : 'non géré',
    checkIntervalMinutes: config.checkIntervalMinutes,
    root: ROOT,
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
  }
}

let lastManualCheck = 0

/** Adresse web du dépôt (https://github.com/…), y compris pour une URL git SSH. */
const repositoryWebUrl = () => config.repository.replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '')

function publicStatus() {
  return {
    version: state.current || null,
    info: state.currentInfo || null,
    branch: config.branch,
    repository: repositoryWebUrl(),
    checkIntervalMinutes: config.checkIntervalMinutes,
    lastCheck: state.lastCheck || null,
    lastResult: state.lastResult || null,
    checking,
    failed: state.failed ? { version: state.failed.sha, short: short(state.failed.sha), at: state.failed.at } : null,
  }
}

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', ...headers })
  res.end(body)
}

function serveFile(req, res, dir, file) {
  const rel = path.relative(dir, file).split(path.sep).join('/')
  const immutable = rel.startsWith('assets/')
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res)
}

function createServer() {
  return http.createServer(async (req, res) => {
    let pathname
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    } catch {
      return send(res, 400, 'Adresse invalide')
    }

    if (pathname.startsWith('/__rentplan/')) {
      const json = (data) => send(res, 200, JSON.stringify(data, null, 2), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      // État des mises à jour affiché dans Configuration › Sauvegardes (sans chemin ni détail d'erreur)
      if (pathname === '/__rentplan/updates' && req.method === 'GET') return json(publicStatus())
      // Vérification manuelle : depuis le navigateur, au plus une fois toutes les 30 secondes
      if (pathname === '/__rentplan/update' && req.method === 'POST') {
        if (!isLocal(req) && Date.now() - lastManualCheck < 30_000) return send(res, 429, 'Vérification déjà lancée, réessayez dans un instant')
        lastManualCheck = Date.now()
        enqueue(() => checkForUpdate('manuelle'))
        return send(res, 202, 'Vérification lancée')
      }
      // État complet : réservé à la machine elle-même
      if (pathname === '/__rentplan/status' && isLocal(req)) return json(statusPayload())
      return send(res, 404, 'Introuvable')
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Méthode non autorisée', { Allow: 'GET, HEAD' })
    const dir = state.current ? path.join(RELEASES, state.current) : null
    if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) return send(res, 503, INSTALLING_PAGE, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '10' })

    const file = path.join(dir, pathname)
    if (file !== dir && !file.startsWith(dir + path.sep)) return send(res, 403, 'Interdit')
    try {
      const st = await fsp.stat(file)
      if (st.isFile()) return serveFile(req, res, dir, file)
    } catch {
      // fichier absent : voir ci-dessous
    }
    // Fichier inexistant avec extension → 404 ; sinon route de l'application → index.html
    if (path.extname(pathname)) return send(res, 404, 'Introuvable')
    serveFile(req, res, dir, path.join(dir, 'index.html'))
  })
}

// ---------- Commandes ----------

async function serve() {
  // Lancé par le superviseur : s'arrêter si celui-ci disparaît
  if (process.send) process.on('disconnect', () => process.exit(0))
  process.on('uncaughtException', (e) => {
    fail(`Erreur inattendue : ${e.stack || e}`)
    process.exit(1)
  })
  process.on('unhandledRejection', (e) => fail(`Erreur inattendue : ${e?.stack || e}`))

  info(`Démarrage de l'agent RentPlan (dossier ${ROOT}, branche ${config.branch}).`)
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    fail(`${ROOT} n'est pas un dépôt git : lancez d'abord « node deploy/agent.mjs setup ».`)
    process.exit(1)
  }

  const server = createServer()
  server.on('error', (e) => {
    fail(`Serveur web impossible à démarrer sur le port ${config.port} : ${e.message}`)
    process.exit(1)
  })
  server.listen(config.port, config.host, () => info(`Application servie sur http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`))

  enqueue(ensureCurrentRelease)
  if (config.manageSupabase) ensureSupabase()
  setTimeout(() => enqueue(() => checkForUpdate('démarrage')), 15_000)
  setInterval(() => enqueue(() => checkForUpdate()), Math.max(1, Number(config.checkIntervalMinutes) || 5) * MIN)
}

async function setup(args) {
  const step = (m) => console.log(`\n▸ ${m}`)
  const arg = (name) => {
    const i = args.indexOf(name)
    return i !== -1 ? args[i + 1] : undefined
  }
  if (arg('--port')) config.port = Number(arg('--port'))
  // Dépôt et branche : options, ou variables RENTPLAN_REPO / RENTPLAN_BRANCH des scripts d'installation
  const repository = arg('--repository') || process.env.RENTPLAN_REPO
  if (repository) config.repository = /\.git$/.test(repository) || !/^https:\/\/github\.com\//.test(repository) ? repository : `${repository}.git`
  if (arg('--branch') || process.env.RENTPLAN_BRANCH) config.branch = arg('--branch') || process.env.RENTPLAN_BRANCH

  const major = Number(process.versions.node.split('.')[0])
  if (major < 20) throw new Error(`Node.js ${process.versions.node} est trop ancien : la version 20 ou plus est requise.`)
  await run('git', ['--version']).catch(() => {
    throw new Error('git est introuvable : installez-le puis relancez l’installation.')
  })

  step('Configuration')
  writeJson(CONFIG_FILE, config)
  console.log(`  ${CONFIG_FILE} (port ${config.port}, branche ${config.branch}, vérification toutes les ${config.checkIntervalMinutes} min)`)

  step('Dépôt git')
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    // Dossier obtenu par téléchargement ZIP : on le relie au dépôt GitHub
    await git(['init', '--quiet'])
    await git(['remote', 'add', 'origin', config.repository])
    await git(['fetch', '--quiet', '--no-tags', 'origin', `+refs/heads/${config.branch}:refs/remotes/origin/${config.branch}`], { timeoutMs: 10 * MIN })
    await git(['checkout', '--quiet', '-f', '-B', config.branch, `origin/${config.branch}`])
    console.log(`  Dossier relié à ${config.repository} (${config.branch}).`)
  } else if (!(await gitOk(['remote', 'get-url', 'origin']))) {
    await git(['remote', 'add', 'origin', config.repository])
    console.log(`  Remote origin ajouté : ${config.repository}`)
  } else {
    console.log(`  ${await git(['remote', 'get-url', 'origin'])} · version ${short(await git(['rev-parse', 'HEAD']))}`)
  }

  if (config.manageSupabase && !fs.existsSync(path.join(ROOT, '.env.local')) && fs.existsSync(path.join(ROOT, '.env.example'))) {
    fs.copyFileSync(path.join(ROOT, '.env.example'), path.join(ROOT, '.env.local'))
    console.log('  .env.local créé à partir de .env.example (Supabase local).')
  }

  step('Dépendances')
  await ensureDependencies(true)

  step('Compilation')
  const head = await git(['rev-parse', 'HEAD'])
  activate(await buildRelease(head))
  await cleanupReleases()
  console.log(`  Version ${short(head)} prête.`)

  if (config.manageSupabase) {
    step('Base de données Supabase (le premier démarrage peut prendre plusieurs minutes)')
    try {
      await supabase(['start'], { timeoutMs: 40 * MIN })
      await migrateDatabase()
      console.log('  Supabase démarré et à jour.')
    } catch (e) {
      console.log(`  Supabase n'a pas pu démarrer maintenant (${firstLines(e, 2)}).\n  Le service réessaiera automatiquement dès que Docker sera disponible.`)
    }
  }
  console.log(`\nInstallation terminée. Application : http://localhost:${config.port}`)
}

async function callService(method, route) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: config.port, path: route, method }, (res) => {
      let body = ''
      res.on('data', (d) => (body += d))
      res.on('end', () => resolve(body))
    })
    req.on('error', () => reject(new Error(`Le service RentPlan ne répond pas sur le port ${config.port}.`)))
    req.end()
  })
}

const command = process.argv[2] || 'serve'
const commands = {
  serve,
  setup: () => setup(process.argv.slice(3)),
  status: async () => console.log(await callService('GET', '/__rentplan/status')),
  'update-now': async () => console.log(await callService('POST', '/__rentplan/update')),
}
if (!commands[command]) {
  console.error(`Commande inconnue : ${command}. Commandes : ${Object.keys(commands).join(', ')}`)
  process.exit(2)
}
commands[command]().catch((e) => {
  // status / update-now sont des commandes de console : leurs erreurs ne vont pas dans le journal du service
  if (command === 'serve' || command === 'setup') fail(firstLines(e, 30))
  else console.error(firstLines(e, 30))
  process.exit(1)
})
