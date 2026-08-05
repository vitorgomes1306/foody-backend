const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export function normalizeMenuSchedule(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const weekdays = [...new Set((Array.isArray(value.weekdays) ? value.weekdays : []).filter((day) => WEEKDAYS.includes(day)))]
  if (!weekdays.length) return null
  const startTime = typeof value.startTime === 'string' && TIME_PATTERN.test(value.startTime) ? value.startTime : null
  const endTime = typeof value.endTime === 'string' && TIME_PATTERN.test(value.endTime) ? value.endTime : null
  if (Boolean(startTime) !== Boolean(endTime) || (startTime && endTime && startTime >= endTime)) {
    throw Object.assign(new Error('O horário final deve ser posterior ao horário inicial'), { status: 400 })
  }
  const promotionalPrice = value.promotionalPrice === '' || value.promotionalPrice == null
    ? null
    : String(value.promotionalPrice).trim().replace(',', '.')
  if (promotionalPrice !== null && (!Number.isFinite(Number(promotionalPrice)) || Number(promotionalPrice) < 0)) {
    throw Object.assign(new Error('Preço promocional inválido'), { status: 400 })
  }
  return { weekdays, startTime, endTime, promotionalPrice }
}

export function currentMenuClock(date = new Date(), timeZone = 'America/Fortaleza') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type) => parts.find((part) => part.type === type)?.value || ''
  const weekday = { Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat' }[get('weekday')]
  return { weekday, time: `${get('hour')}:${get('minute')}`, timeZone }
}

export function evaluateMenuSchedule(value, clock = currentMenuClock()) {
  const schedule = normalizeMenuSchedule(value)
  if (!schedule) return { available: true, schedule: null, promotionalPrice: null }
  const matchesDay = schedule.weekdays.includes(clock.weekday)
  const matchesTime = !schedule.startTime || (clock.time >= schedule.startTime && clock.time < schedule.endTime)
  const available = matchesDay && matchesTime
  return { available, schedule, promotionalPrice: available ? schedule.promotionalPrice : null }
}

export function applyPromotionalPrice(value, baseValue, promotionalValue) {
  const amount = Number(value)
  const base = Number(baseValue)
  const promotional = Number(promotionalValue)
  if (!Number.isFinite(amount) || !Number.isFinite(base) || base <= 0 || !Number.isFinite(promotional)) return value
  return (Math.round(amount * (promotional / base) * 100) / 100).toFixed(2)
}
