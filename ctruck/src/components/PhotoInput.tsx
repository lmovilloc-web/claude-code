// Captura de foto (cámara o galería), redimensionada a máx 1000px.
// En demo se guarda como dataURL; con Supabase sube al bucket correspondiente.
import { useRef, useState } from 'react'

export default function PhotoInput({
  label, onPhoto,
}: { label: string; onPhoto: (dataUrl: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const handle = (file: File) => {
    const img = new Image()
    img.onload = () => {
      const max = 1000
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      const url = canvas.toDataURL('image/jpeg', 0.7)
      setPreview(url)
      onPhoto(url)
    }
    img.src = URL.createObjectURL(file)
  }

  return (
    <div>
      <input
        ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => e.target.files?.[0] && handle(e.target.files[0])}
      />
      {preview ? (
        <div className="relative rounded-os overflow-hidden hairline">
          <img src={preview} alt={label} className="w-full max-h-64 object-cover" />
          <button
            onClick={() => ref.current?.click()}
            className="absolute bottom-3 right-3 os-glass rounded-full px-4 py-1.5 text-[13px] font-semibold"
          >
            Repetir
          </button>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          className="os-t pressable w-full rounded-os border-2 border-dashed border-os-border bg-os-card2/50 py-12 text-center hover:border-accent/50"
        >
          <div className="text-2xl mb-2">📷</div>
          <div className="t-headline">{label}</div>
          <div className="t-footnote mt-1">Toca para tomar la foto</div>
        </button>
      )}
    </div>
  )
}
