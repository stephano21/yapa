/**
 * Fechas en hora local del dispositivo (no UTC), para ventas/cobros y cortes de día.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha civil local YYYY-MM-DD. */
export function getFechaLocalYYYYMMDD(d = new Date()): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

/**
 * Marca de tiempo local, compatible con SQLite `date(fecha)` y con `new Date(...)` en JS.
 * Formato ISO sin zona: `YYYY-MM-DDTHH:mm:ss` (hora local).
 */
export function getFechaHoraLocalParaDb(d = new Date()): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const h = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  const s = pad2(d.getSeconds());
  return `${y}-${m}-${day}T${h}:${min}:${s}`;
}
