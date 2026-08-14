// Captura de 1 a N fotos (recepción de carga y entregas).
import { useRef } from 'react'

export default function MultiPhotoInput({
  photos, onChange, min = 1, max = 4, label,
}: { photos: string[]; onChange: (p: string[]) => void; min?: number; max?: number; label: string }) {
  const ref = useRef<HTMLInputElement>(null)

  const handle = (file: File) => {
    const img = new Image()
    img.onload = () => {
      const maxPx = 1000
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      onChange([...photos, canvas.toDataURL('image/jpeg', 0.7)].slice(0, max))
    }
    img.src = URL.createObjectURL(file)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="t-caption">{label}</span>
        <span className="t-footnote tnum">{photos.length}/{max} · mín {min}</span>
      </div>
      <input
        ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { if (e.target.files?.[0]) handle(e.target.files[0]); e.target.value = '' }}
      />
      <div className="grid grid-cols-4 gap-2">
        {photos.map((p, i) => (
          <div key={i} className="relative rounded-os overflow-hidden hairline aspect-square">
            <img src={p} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
            <button
              onClick={() => onChange(photos.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 w-6 h-6 rounded-full os-glass text-[12px] font-bold"
              aria-label="Quitar foto"
            >✕</button>
          </div>
        ))}
        {photos.length < max && (
          <button
            onClick={() => ref.current?.click()}
            className="os-t pressable aspect-square rounded-os border-2 border-dashed border-os-border bg-os-card2/50 flex flex-col items-center justify-center hover:border-accent/50"
          >
            <span className="text-xl">📷</span>
            <span className="t-footnote mt-1">Agregar</span>
          </button>
        )}
      </div>
    </div>
  )
}
