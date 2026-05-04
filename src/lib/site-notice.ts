import type { SiteNoticeState } from '@/contexts/SiteNoticeContext';

export type NoticeLiveStatus =
  | { state: 'live'; reason: string }
  | { state: 'scheduled'; reason: string }
  | { state: 'expired'; reason: string }
  | { state: 'draft'; reason: string }
  | { state: 'disabled'; reason: string };

/**
 * Determine the current live status of a notice.
 *
 * Rules:
 * - disabled                                        => never live
 * - enabled + no title                              => draft
 * - enabled + no start + no end                     => live immediately
 * - enabled + start in future                       => scheduled
 * - enabled + end in past                           => expired
 * - enabled + within window                         => live
 */
export const getNoticeStatus = (
  notice: Pick<SiteNoticeState, 'enabled' | 'title' | 'start_time' | 'end_time'>,
  now: Date = new Date(),
): NoticeLiveStatus => {
  if (!notice.enabled) return { state: 'disabled', reason: 'Banner is turned off.' };
  if (!notice.title?.trim()) return { state: 'draft', reason: 'Add a title to publish this notice.' };

  const start = notice.start_time ? new Date(notice.start_time) : null;
  const end = notice.end_time ? new Date(notice.end_time) : null;

  if (start && start.getTime() > now.getTime()) {
    return { state: 'scheduled', reason: `Goes live ${start.toLocaleString()}.` };
  }
  if (end && end.getTime() < now.getTime()) {
    return { state: 'expired', reason: `Ended ${end.toLocaleString()}.` };
  }
  if (end) {
    return { state: 'live', reason: `Live until ${end.toLocaleString()}.` };
  }
  if (start) {
    return { state: 'live', reason: `Live since ${start.toLocaleString()}.` };
  }
  return { state: 'live', reason: 'Live now (no schedule set).' };
};

export const isNoticeLive = (
  notice: Pick<SiteNoticeState, 'enabled' | 'title' | 'start_time' | 'end_time'>,
  now: Date = new Date(),
): boolean => getNoticeStatus(notice, now).state === 'live';

/**
 * Convert an HTML `datetime-local` value (e.g. "2026-05-01T10:00") to a
 * proper ISO string for storage. Returns null for empty values.
 *
 * Browsers interpret datetime-local in the user's local timezone, which is
 * exactly what an admin expects when scheduling a banner — so we let the
 * native Date constructor do that conversion before serializing to UTC ISO.
 */
export const datetimeLocalToIso = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
};

/**
 * Convert a stored ISO timestamp back to a value usable in a
 * `datetime-local` input. Returns '' for null/invalid values.
 */
export const isoToDatetimeLocal = (value: string | null | undefined): string => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  // YYYY-MM-DDTHH:mm in local time
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
