import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Icon } from '../ui'

/** Zone de signature à la souris, au doigt ou au stylet ; ref.toDataURL() renvoie l'image (PNG) ou null si vide. */
export default function SignaturePad({ height = 170, onChange, ref }) {
  const canvas = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const c = canvas.current
    const fit = () => {
      const ratio = window.devicePixelRatio || 1
      const w = c.offsetWidth
      const data = !empty ? c.toDataURL() : null
      c.width = w * ratio
      c.height = height * ratio
      const ctx = c.getContext('2d')
      ctx.scale(ratio, ratio)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1d2a4d'
      ctx.lineWidth = 2.2
      if (data) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, w, height)
        img.src = data
      }
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height])

  const point = (e) => {
    const r = canvas.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const down = (e) => {
    e.preventDefault()
    canvas.current.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
    const ctx = canvas.current.getContext('2d')
    ctx.beginPath()
    ctx.arc(last.current[0], last.current[1], 1, 0, Math.PI * 2)
    ctx.fillStyle = '#1d2a4d'
    ctx.fill()
  }
  const move = (e) => {
    if (!drawing.current) return
    const p = point(e)
    const ctx = canvas.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(...last.current)
    ctx.lineTo(...p)
    ctx.stroke()
    last.current = p
    if (empty) {
      setEmpty(false)
      onChange?.(true)
    }
  }
  const up = () => {
    drawing.current = false
  }
  const clear = () => {
    const c = canvas.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    setEmpty(true)
    onChange?.(false)
  }
  useImperativeHandle(ref, () => ({ toDataURL: () => (empty ? null : canvas.current.toDataURL('image/png')), clear }))

  return (
    <div className="sig-pad">
      <canvas ref={canvas} style={{ height }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Zone de signature" />
      {empty && <span className="sig-pad-hint">Signez ici</span>}
      <button type="button" className="btn btn-ghost btn-sm sig-pad-clear" onClick={clear} disabled={empty}><Icon name="restart_alt" size={16} /> Effacer</button>
    </div>
  )
}
