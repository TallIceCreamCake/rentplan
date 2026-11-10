import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore, toast } from '../store'
import { currentUserName } from '../lib/auth'
import { DB_ENABLED, fileUrl, removeStoredFiles, uploadFile } from '../lib/db'
import { fmtDateTime, fmtNumber, uid } from '../lib/utils'
import { Icon } from './ui'

const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
// En mode local les images vivent dans le navigateur : plus petites
const LIMITS = DB_ENABLED ? { max: 2000, quality: 0.86, maxBytes: 15e6 } : { max: 1280, quality: 0.8, maxBytes: 15e6 }

/** Adresse affichable d'une image (stockage Supabase ou image enregistrée dans le navigateur). */
export const imageSrc = (f) => (f.path?.startsWith('data:') ? f.path : fileUrl(f.path) || f.path)

/** Réduit les grandes photos avant l'envoi (les GIF animés sont gardés tels quels). */
async function prepare(file) {
  if (file.type === 'image/gif') return file
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return file
  const scale = Math.min(1, LIMITS.max / Math.max(bmp.width, bmp.height))
  const local = !DB_ENABLED
  if (scale === 1 && !local && file.size < 2.5e6) return file
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')
  // Le PNG garde sa transparence ; les autres formats passent en JPEG sur fond blanc
  const type = file.type === 'image/png' && !local ? 'image/png' : 'image/jpeg'
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise((res) => canvas.toBlob(res, type, LIMITS.quality))
  if (!blob) return file
  const name = file.name.replace(/\.[a-z0-9]+$/i, '') + (type === 'image/png' ? '.png' : '.jpg')
  return new File([blob], name, { type })
}

const toDataUrl = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(blob)
  })

/**
 * Images d'un équipement : image principale (utilisée par les documents) et galerie.
 * Envoi par glisser-déposer, clic ou collage ; agrandissement en plein écran.
 */
export default function EquipmentImages({ eq, update, editable }) {
  const all = useStore((s) => s.files)
  const images = all.filter((f) => f.equipmentId === eq.id && f.mime?.startsWith('image/')).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(null)
  const [view, setView] = useState(null)
  const [showUrl, setShowUrl] = useState(false)
  const input = useRef(null)
  const mainFile = images.find((f) => imageSrc(f) === eq.imageUrl)
  const external = eq.imageUrl && !mainFile

  const upload = async (list) => {
    const files = [...list].filter((f) => f && f.type?.startsWith('image/'))
    if (!files.length) return toast('Choisissez une image (PNG, JPEG, WebP ou GIF)', 'error')
    let main = eq.imageUrl
    let done = 0
    for (const [i, raw] of files.entries()) {
      if (!TYPES.includes(raw.type)) {
        toast(`« ${raw.name} » : format non pris en charge (PNG, JPEG, WebP ou GIF)`, 'error')
        continue
      }
      if (raw.size > LIMITS.maxBytes) {
        toast(`« ${raw.name} » : image trop lourde (15 Mo maximum)`, 'error')
        continue
      }
      setBusy({ n: i + 1, total: files.length })
      try {
        const file = await prepare(raw)
        let path
        if (DB_ENABLED) path = (await uploadFile(file, `equipements/${eq.id}`)).path
        else {
          if (file.size > 900e3) throw new Error('image trop lourde pour le mode local')
          path = await toDataUrl(file)
        }
        const row = { id: uid('f_'), projectId: null, equipmentId: eq.id, name: file.name, path, size: file.size, mime: file.type, author: currentUserName(), createdAt: new Date().toISOString() }
        useStore.getState().upsert('files', row)
        // La première image devient l'image principale
        if (!main) {
          main = imageSrc(row)
          update({ imageUrl: main })
        }
        done++
      } catch (e) {
        toast(`« ${raw.name} » : envoi impossible (${e.message})`, 'error')
      }
    }
    setBusy(null)
    if (done) toast(done > 1 ? `${done} images ajoutées` : 'Image ajoutée')
  }

  const remove = async (f) => {
    if (!confirm(`Supprimer l’image « ${f.name} » ?`)) return
    const wasMain = imageSrc(f) === eq.imageUrl
    useStore.getState().remove('files', f.id)
    if (wasMain) {
      const next = images.find((x) => x.id !== f.id)
      update({ imageUrl: next ? imageSrc(next) : null })
    }
    setView(null)
    try {
      await removeStoredFiles([f.path])
    } catch {
      // Le fichier reste dans le stockage, sans conséquence pour la fiche
    }
  }

  const onPaste = (e) => {
    if (!editable) return
    const files = [...(e.clipboardData?.files || [])]
    if (files.length) {
      e.preventDefault()
      upload(files)
    }
  }

  const drop = {
    onDragOver: (e) => {
      if (!editable || ![...e.dataTransfer.types].includes('Files')) return
      e.preventDefault()
      setOver(true)
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOver(false)
    },
    onDrop: (e) => {
      if (!editable) return
      e.preventDefault()
      setOver(false)
      upload(e.dataTransfer.files)
    },
  }

  return (
    <div className="eqi" onPaste={onPaste}>
      <div
        className={`eqi-main ${over ? 'over' : ''} ${eq.imageUrl ? '' : 'empty'}`}
        tabIndex={0}
        role="button"
        aria-label={eq.imageUrl ? 'Agrandir l’image principale' : 'Ajouter une image'}
        onClick={() => (eq.imageUrl ? setView(mainFile ? mainFile.id : 'external') : editable && input.current?.click())}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.click()}
        {...drop}
      >
        {eq.imageUrl ? <img src={eq.imageUrl} alt={eq.name} /> : (
          <div className="eqi-empty">
            <Icon name="add_photo_alternate" size={42} />
            <strong>{editable ? 'Ajouter des images' : 'Aucune image'}</strong>
            {editable && <span>Glissez-déposez, collez (Ctrl+V) ou cliquez</span>}
          </div>
        )}
        {over && <div className="eqi-over"><Icon name="file_upload" size={36} /> Déposez les images ici</div>}
        {busy && <div className="eqi-busy"><span className="material-icons spin">sync</span> Envoi {busy.total > 1 ? `${busy.n} / ${busy.total}` : 'en cours'}…</div>}
        {eq.imageUrl && <span className="eqi-badge"><Icon name="star" size={14} /> Principale</span>}
      </div>

      {(images.length > 0 || editable) && (
        <div className="eqi-thumbs" {...drop}>
          {images.map((f) => {
            const src = imageSrc(f)
            const isMain = src === eq.imageUrl
            return (
              <div key={f.id} className={`eqi-thumb ${isMain ? 'is-main' : ''}`}>
                <button type="button" className="eqi-thumb-img" onClick={() => setView(f.id)} title={f.name}>
                  <img src={src} alt={f.name} loading="lazy" />
                </button>
                {isMain && <span className="eqi-star" title="Image principale"><Icon name="star" size={13} /></span>}
                {editable && (
                  <div className="eqi-thumb-actions">
                    {!isMain && <button type="button" title="Définir comme image principale" onClick={() => update({ imageUrl: src })}><Icon name="star_outline" size={16} /></button>}
                    <button type="button" title="Supprimer" onClick={() => remove(f)}><Icon name="delete" size={16} /></button>
                  </div>
                )}
              </div>
            )
          })}
          {editable && (
            <button type="button" className="eqi-add" onClick={() => input.current?.click()} disabled={Boolean(busy)} title="Ajouter des images">
              <Icon name="add_photo_alternate" size={22} />
              <span>Ajouter</span>
            </button>
          )}
        </div>
      )}

      {editable && (
        <>
          <input ref={input} type="file" accept={TYPES.join(',')} multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
          <div className="eqi-foot">
            <span className="muted small">{images.length} image{images.length > 1 ? 's' : ''}{external ? ' · image principale externe' : ''}</span>
            <button type="button" className="btn-link" onClick={() => setShowUrl(!showUrl)}>{showUrl ? 'Masquer' : 'Utiliser une adresse web'}</button>
          </div>
          {showUrl && <input className="input input-sm" placeholder="https://…/image.jpg" value={external ? eq.imageUrl : ''} onChange={(e) => update({ imageUrl: e.target.value.trim() || (images[0] ? imageSrc(images[0]) : null) })} aria-label="Adresse de l’image principale" />}
        </>
      )}

      {view && (
        <Lightbox
          items={external ? [{ id: 'external', name: 'Image principale (adresse web)', src: eq.imageUrl }, ...images.map((f) => ({ ...f, src: imageSrc(f) }))] : images.map((f) => ({ ...f, src: imageSrc(f) }))}
          start={view}
          mainSrc={eq.imageUrl}
          editable={editable}
          onClose={() => setView(null)}
          onMain={(src) => update({ imageUrl: src })}
          onRemove={(f) => remove(f)}
        />
      )}
    </div>
  )
}

/** Image en plein écran : flèches pour naviguer, Échap pour fermer. */
function Lightbox({ items, start, mainSrc, editable, onClose, onMain, onRemove }) {
  const [i, setI] = useState(Math.max(0, items.findIndex((x) => x.id === start)))
  const item = items[Math.min(i, items.length - 1)]
  const go = useCallback((d) => setI((x) => (x + d + items.length) % items.length), [items.length])
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])
  if (!item) return null
  const isMain = item.src === mainSrc
  return createPortal(
    <div className="lbx" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lbx-bar">
        <span className="lbx-name">{item.name}</span>
        <span className="lbx-meta">{[item.size ? `${fmtNumber(item.size / 1024)} Ko` : null, item.author, item.createdAt ? fmtDateTime(item.createdAt) : null].filter(Boolean).join(' · ')}</span>
        <span className="spacer" />
        {items.length > 1 && <span className="lbx-count">{i + 1} / {items.length}</span>}
        {editable && !isMain && <button type="button" onClick={() => onMain(item.src)}><Icon name="star_outline" size={18} /> Image principale</button>}
        {isMain && <span className="lbx-main"><Icon name="star" size={16} /> Image principale</span>}
        <a href={item.src} download={item.name} target="_blank" rel="noreferrer" title="Télécharger"><Icon name="download" size={19} /></a>
        {editable && item.id !== 'external' && <button type="button" onClick={() => onRemove(item)} title="Supprimer"><Icon name="delete" size={19} /></button>}
        <button type="button" onClick={onClose} aria-label="Fermer"><Icon name="close" size={21} /></button>
      </div>
      <div className="lbx-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {items.length > 1 && <button type="button" className="lbx-nav prev" onClick={() => go(-1)} aria-label="Image précédente"><Icon name="chevron_left" size={34} /></button>}
        <img src={item.src} alt={item.name} />
        {items.length > 1 && <button type="button" className="lbx-nav next" onClick={() => go(1)} aria-label="Image suivante"><Icon name="chevron_right" size={34} /></button>}
      </div>
    </div>,
    document.body,
  )
}
