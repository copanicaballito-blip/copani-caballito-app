// Fechas y horas en hora de Argentina. Los programas de GitHub corren en hora UTC (3 horas adelante), así que acá se
// calcula todo explícitamente en la zona de Buenos Aires, sin depender de la hora de la máquina.

export const ZONA = "America/Argentina/Buenos_Aires";
const DESFASE = "-03:00"; // Argentina no usa horario de verano
const MS_DIA = 86400000;

const formato = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Fecha ("aaaa-mm-dd") y hora que son ahora en Argentina. */
export function ahoraAR(ahora = new Date()) {
  const p = Object.fromEntries(formato.formatToParts(ahora).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), minuto: Number(p.minute) };
}

/** "2026-12-31" + 1 -> "2027-01-01" */
export function sumarDias(iso, dias) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * MS_DIA).toISOString().slice(0, 10);
}

/** 0 = domingo ... 5 = viernes ... 6 = sábado */
export function diaDeLaSemana(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function esUltimoDiaDelMes(iso) {
  return sumarDias(iso, 1).endsWith("-01");
}

/** El momento exacto (un Date) en que son las `hora` de ese día en Argentina. */
export function instanteAR(iso, hora = "21:00") {
  return new Date(`${iso}T${hora}:00${DESFASE}`);
}

/** "2026-12-04T00:03:00.000Z" -> "03/12/2026 21:03" (hora de Argentina) */
export function fechaHoraAR(isoUtc) {
  const { fecha, hora, minuto } = ahoraAR(new Date(isoUtc));
  const [a, m, d] = fecha.split("-");
  return `${d}/${m}/${a} ${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

/**
 * El viernes de cierre al que corresponde un momento: el viernes más reciente cuyas 21:00 ya pasaron.
 * Un viernes antes de las 21:00 todavía pertenece a la semana anterior.
 */
export function viernesDeCierre(ahora = new Date()) {
  const { fecha, hora } = ahoraAR(ahora);
  for (let atras = 0; atras < 8; atras++) {
    const dia = sumarDias(fecha, -atras);
    if (diaDeLaSemana(dia) !== 5) continue;
    if (atras === 0 && hora < 21) continue;
    return dia;
  }
  throw new Error("No se pudo calcular el viernes de cierre");
}

/**
 * Los 7 días que cubre el informe semanal: desde el viernes anterior a las 21:00 hasta este viernes a las 21:00.
 * Un pago hecho justo después del cierre cuenta en la semana siguiente (aunque el mail salga unos minutos tarde).
 */
export function ventanaSemanal(ahora = new Date()) {
  const viernes = viernesDeCierre(ahora);
  const cierre = instanteAR(viernes, "21:00");
  return { viernes, cierre, desde: new Date(cierre.getTime() - 7 * MS_DIA) };
}

/**
 * Mes para el informe mensual, o null si hoy no toca. Toca el último día del mes; si el programa se atrasó y corre
 * ya el día 1, todavía manda el del mes que terminó (si no se había mandado: se controla aparte).
 */
export function mesDelInformeMensual(ahora = new Date()) {
  const { fecha } = ahoraAR(ahora);
  if (esUltimoDiaDelMes(fecha)) return fecha.slice(0, 7);
  if (fecha.endsWith("-01")) return sumarDias(fecha, -1).slice(0, 7);
  return null;
}
