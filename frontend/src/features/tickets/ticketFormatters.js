export const formatDateTime = (dateValue) => {
  if (!dateValue) return null;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString('el-GR', {
    timeZone: 'Europe/Athens',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatSiteNumber = (value) => {
  const raw = String(value ?? '').trim();
  return /^\+?\d+$/.test(raw)
    ? raw.replace(/^\+/, '').replace(/^0+(?=\d)/, '')
    : raw;
};

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const athensDay = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });

export const formatTimer = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const pad = (value) => String(value).padStart(2, '0');
  return `${days ? `${days}d ` : ''}${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

export const formatActionCountdown = (dateValue, now) => {
  if (!dateValue) return null;

  const remainingMs = new Date(dateValue).getTime() - now;
  if (Number.isNaN(remainingMs)) return null;
  return remainingMs > 0
    ? `σε ${formatTimer(remainingMs)}`
    : `εκπρόθεσμο κατά ${formatTimer(Math.abs(remainingMs))}`;
};
