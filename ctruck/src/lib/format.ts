// Formatos chilenos: CLP, dd/mm/yyyy, RUT

export const clp = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export const num = (n: number) => new Intl.NumberFormat('es-CL').format(n)

export const fecha = (d: string | Date) => {
  const date = typeof d === 'string' ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')) : d
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const hora = (d: string | Date) =>
  new Date(d).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

export const hoy = () => new Date().toISOString().slice(0, 10)

/** Validación RUT chileno (módulo 11). Acepta "12.345.678-5" o "12345678-5". */
export function validaRut(rut: string): boolean {
  const clean = rut.replace(/[.\s]/g, '').toUpperCase()
  const m = clean.match(/^(\d{7,8})-([\dK])$/)
  if (!m) return false
  const [, body, dv] = m
  let sum = 0
  let mul = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const res = 11 - (sum % 11)
  const expected = res === 11 ? '0' : res === 10 ? 'K' : String(res)
  return dv === expected
}

export function formateaRut(rut: string): string {
  const clean = rut.replace(/[.\s-]/g, '').toUpperCase()
  if (clean.length < 2) return rut
  const body = clean.slice(0, -1)
  const dv = clean.slice(-1)
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv
}
