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

// Recent data needs no age label; older data says how old it is so "Live" is not misleading.
export const formatDataAge = (dateValue, now) => {
  const ageMs = now - new Date(dateValue).getTime();
  if (!dateValue || Number.isNaN(ageMs) || ageMs < 2 * 60 * 1000) return null;
  const minutes = Math.floor(ageMs / 60000);
  return minutes < 60 ? `πριν ${minutes} λεπ.` : `πριν ${Math.floor(minutes / 60)} ώρ.`;
};

export const athensDay = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });

// Seconds matter only in the last hour; longer waits read better as days, hours and minutes.
export const formatTimer = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days} ημ. ${hours} ώρ.`;
  if (hours) return `${hours} ώρ. ${minutes} λεπ.`;
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
