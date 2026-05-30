export const IST_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value = Date.now()) {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

function toIstDate(value = Date.now()) {
  return new Date(toDate(value).getTime() + IST_OFFSET_MS);
}

export function getIstDateKey(value = Date.now()) {
  const istDate = toIstDate(value);
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfIstDay(value = Date.now()) {
  const istDate = toIstDate(value);
  return new Date(
    Date.UTC(
      istDate.getUTCFullYear(),
      istDate.getUTCMonth(),
      istDate.getUTCDate(),
      0,
      0,
      0,
      0,
    ) - IST_OFFSET_MS,
  );
}

export function addIstDays(value = Date.now(), days = 0) {
  return new Date(startOfIstDay(value).getTime() + Number(days || 0) * DAY_MS);
}

export function diffIstDays(later, earlier = Date.now()) {
  return Math.round(
    (startOfIstDay(later).getTime() - startOfIstDay(earlier).getTime()) /
      DAY_MS,
  );
}

export function isSameIstDay(left, right) {
  return getIstDateKey(left) === getIstDateKey(right);
}
