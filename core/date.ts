import type { EpochMs, LocalDate } from './types'

/**
 * Calendar helpers.
 *
 * Every function here is a pure function of (timestamp, timeZone). Nothing reads the
 * clock or the host timezone, because "today" must mean today *where the user is* —
 * a UTC date comparison silently ruins the 1am case and every DST boundary.
 */

const DAY_MS = 86_400_000

interface DateTimeFields {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/**
 * Decompose an instant into wall-clock fields for a given IANA timezone.
 * `Intl` is the only correct way to do this without shipping a timezone database.
 */
function wallClockFields(epochMs: EpochMs, timeZone: string): DateTimeFields {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const fields: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {}
  for (const part of formatter.formatToParts(new Date(epochMs))) {
    if (part.type === 'literal') continue
    const value = Number(part.value)
    if (Number.isFinite(value)) fields[part.type] = value
  }

  return {
    year: fields.year ?? 1970,
    month: fields.month ?? 1,
    day: fields.day ?? 1,
    // Some locales render midnight as hour 24; normalise it to 0.
    hour: (fields.hour ?? 0) % 24,
    minute: fields.minute ?? 0,
    second: fields.second ?? 0,
  }
}

/** The calendar day an instant falls on, in the user's timezone, as `YYYY-MM-DD`. */
export function toLocalDate(epochMs: EpochMs, timeZone: string): LocalDate {
  const { year, month, day } = wallClockFields(epochMs, timeZone)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Hour of day (0–23) an instant falls on, in the user's timezone. */
export function toLocalHour(epochMs: EpochMs, timeZone: string): number {
  return wallClockFields(epochMs, timeZone).hour
}

/**
 * Turn a `YYYY-MM-DD` string into a comparable integer day index.
 *
 * Deliberately timezone-free: both operands of every comparison are calendar dates
 * in the same (user's) calendar, so this is pure arithmetic on the label, not an
 * instant being converted.
 */
export function localDayNumber(date: LocalDate): number {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return Number.NaN
  }
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS)
}

/** True when `date` is strictly before `today`, both being local calendar dates. */
export function isBeforeLocalDate(date: LocalDate, today: LocalDate): boolean {
  const a = localDayNumber(date)
  const b = localDayNumber(today)
  if (Number.isNaN(a) || Number.isNaN(b)) return false
  return a < b
}

/** Number of days from `from` to `to`, both local calendar dates. */
export function localDaysBetween(from: LocalDate, to: LocalDate): number {
  return localDayNumber(to) - localDayNumber(from)
}

export type Greeting = 'Good morning' | 'Good afternoon' | 'Good evening'

/** Time-of-day greeting for the Today header. */
export function greetingForHour(hour: number): Greeting {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
