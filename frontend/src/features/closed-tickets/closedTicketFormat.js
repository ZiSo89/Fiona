

export const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
export const WEEKDAYS = { Mon: 'Δευ', Tue: 'Τρί', Wed: 'Τετ', Thu: 'Πέμ', Fri: 'Παρ', Sat: 'Σάβ', Sun: 'Κυρ' };
export const COMPLETE_SECTION_KEY = 'fiona-complete-section';
export const COMPLETE_MONTH_KEY = 'fiona-complete-month';

export const currentMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' }).slice(0, 7);

export function readCompleteSection() {
  const savedSection = window.sessionStorage.getItem(COMPLETE_SECTION_KEY);
  return savedSection === 'list' || savedSection === 'stats' ? savedSection : 'stats';
}

export function readCompleteMonth() {
  const savedMonth = window.sessionStorage.getItem(COMPLETE_MONTH_KEY);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(savedMonth || '') ? savedMonth : currentMonth();
}

export function shiftMonth(month, offset) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const monthLabel = (month) => {
  const [year, number] = month.split('-').map(Number);
  return `${MONTHS[number - 1]} ${year}`;
};

export const tone = (percent) => (percent === null ? 'none' : percent >= 90 ? 'good' : percent >= 75 ? 'warn' : 'bad');

export const formatLate = (hours) => (hours >= 48 ? `+${Math.round(hours / 24)} ημ.` : `+${Math.round(hours)} ώρ.`);
export const formatDuration = (hours) => {
  if (hours === null || hours === undefined) return '—';
  if (hours < 24) return `${hours.toLocaleString('el-GR', { maximumFractionDigits: 1 })} ώρ.`;
  const days = Math.floor(hours / 24);
  const remainder = Math.round(hours % 24);
  return remainder ? `${days} ημ. ${remainder} ώρ.` : `${days} ημ.`;
};
export const countChange = (value, previous) => value === previous ? 'Ίδιος αριθμός με τον προηγ. μήνα' : `${value > previous ? '+' : ''}${value - previous} έναντι προηγ. μήνα`;
export const percentChange = (value, previous) => value === null || previous === null
  ? 'Δεν υπάρχουν επαρκή δεδομένα σύγκρισης'
  : `${value === previous ? 'Ίδιο' : `${value > previous ? '+' : ''}${value - previous}`} μ.π. έναντι προηγ. μήνα`;

export const formatClosed = (value) => new Date(value).toLocaleString('el-GR', {
  timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export const closedDatePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit',
});
export const closedDateLabelFormatter = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
export const closedDateTimeFormatter = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function closedDateKey(value) {
  const parts = Object.fromEntries(closedDatePartsFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function closedDateLabel(value) {
  return closedDateLabelFormatter.format(new Date(value));
}

export function shiftDateKey(key, offset) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export const DASH = '-';
export const COPY_ALL_DELAY_MS = 350;

export const text = (value) => (value === null || value === undefined || String(value).trim() === '' ? DASH : String(value));

export function splitDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return [DASH, DASH];
  const zone = { timeZone: 'Europe/Athens' };
  return [
    date.toLocaleDateString('el-GR', { ...zone, day: '2-digit', month: '2-digit', year: 'numeric' }),
    date.toLocaleTimeString('el-GR', { ...zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  ];
}

// Plain HTTP on a phone has no navigator.clipboard, so fall back to execCommand.
export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}
