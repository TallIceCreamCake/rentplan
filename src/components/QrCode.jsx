import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function QrCode({ text, size = 74 }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(text, { margin: 0, width: size * 2, errorCorrectionLevel: 'M' })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null))
    return () => {
      alive = false
    }
  }, [text, size])
  return src ? <img className="qr" src={src} alt={`QR code ${text}`} style={{ width: size, height: size }} /> : <div className="qr" />
}
