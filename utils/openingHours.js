export const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || 'America/Fortaleza'

const WEEKDAY_KEYS = {
  Sun: 'sun',
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
}

export function getBusinessOpeningStatus(openingHours, { now = new Date(), timeZone = BUSINESS_TIME_ZONE } = {}) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)

  const part = (type) => parts.find((item) => item.type === type)?.value || ''
  const weekday = WEEKDAY_KEYS[part('weekday')]
  const currentTime = `${part('hour')}:${part('minute')}`
  const todayHours = (Array.isArray(openingHours) ? openingHours : []).find((row) => row?.weekday === weekday)
  const openTime = typeof todayHours?.openTime === 'string' ? todayHours.openTime : null
  const closeTime = typeof todayHours?.closeTime === 'string' ? todayHours.closeTime : null
  const configured = Boolean(todayHours && !todayHours.closed && openTime && closeTime)
  const isOpen = configured && currentTime >= openTime && currentTime < closeTime

  return {
    isOpen,
    weekday,
    currentTime,
    openTime,
    closeTime,
    timeZone,
    reason: !todayHours || !openTime || !closeTime ? 'not_configured' : todayHours.closed ? 'closed_day' : isOpen ? 'open' : 'outside_hours',
  }
}
