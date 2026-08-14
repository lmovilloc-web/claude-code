// Firma digital sobre canvas, con timestamp y nombre.
import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'

export default function SignaturePad({ onSign, name }: { name: string; onSign: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dirty, setDirty] = useState(false)
  const drawing = useRef(false)

  useEffect(() => {
    const c = canvasRef.current!
    const dpr = window.devicePixelRatio || 1
    c.width = c.offsetWidth * dpr
    c.height = 180 * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#E2E8F0'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const down = (e: React.PointerEvent) => {
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setDirty(true)
  }
  const up = () => { drawing.current = false }

  const clear = () => {
    const c = canvasRef.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setDirty(false)
  }

  return (
    <div>
      <div className="bg-os-card2 rounded-os hairline overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          className="w-full h-[180px] block cursor-crosshair"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="t-footnote">{name} · {new Date().toLocaleString('es-CL')}</span>
        <button className="t-footnote text-accent font-semibold" onClick={clear}>Limpiar</button>
      </div>
      <Button full className="mt-4" disabled={!dirty} onClick={() => onSign(canvasRef.current!.toDataURL('image/png'))}>
        Firmar y completar
      </Button>
    </div>
  )
}
