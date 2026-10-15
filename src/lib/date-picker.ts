export type DatePickerType = "date" | "month" | "datetime-local";

export type DatePickerRules = {
  type: DatePickerType;
  min?: string;
  max?: string;
  step?: number | "any";
  stepBase?: string;
};

export type DateParts = { year: number; month: number; day: number };

const DAY_MS = 86_400_000;
const DATETIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

export function dateParts(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  return isValidParts(parts) ? parts : null;
}

export function monthParts(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12
    ? { year, month }
    : null;
}

export function formatMonthValue(value: string, locale: string) {
  const parts = monthParts(value);
  if (!parts) return "";
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(parts.year, parts.month - 1, 1);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

export function isValidParts({ year, month, day }: DateParts) {
  return (
    year >= 1 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

export function daysInMonth(year: number, month: number) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}

export function dateSerial(value: DateParts) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(value.year, value.month - 1, value.day);
  return Math.floor(date.getTime() / DAY_MS);
}

export function partsFromSerial(serial: number): DateParts {
  const date = new Date(serial * DAY_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function addDays(value: DateParts, days: number): DateParts {
  return partsFromSerial(dateSerial(value) + days);
}

export function weekday(value: DateParts) {
  return new Date(dateSerial(value) * DAY_MS).getUTCDay();
}

export function isoDate({ year, month, day }: DateParts) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isoMonth(year: number, month: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function shiftMonth(year: number, month: number, delta: number) {
  const serial = year * 12 + month - 1 + delta;
  return {
    year: Math.floor(serial / 12),
    month: (((serial % 12) + 12) % 12) + 1,
  };
}

export function dateTimeSerial(value: string) {
  const match = DATETIME_PATTERN.exec(value);
  if (!match) return null;
  const parts = dateParts(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] ?? 0);
  const millisecond = Number((match[5] ?? "").padEnd(3, "0"));
  if (!parts || hour > 23 || minute > 59 || second > 59) return null;
  return (
    dateSerial(parts) * DAY_MS +
    hour * 3_600_000 +
    minute * 60_000 +
    second * 1000 +
    millisecond
  );
}

export function isCompleteValue(value: string, type: DatePickerType) {
  return type === "date"
    ? dateParts(value) !== null
    : type === "month"
      ? monthParts(value) !== null
      : dateTimeSerial(value) !== null;
}

function stepValue({ step, type }: DatePickerRules) {
  const defaultStep = type === "datetime-local" ? 60 : 1;
  if (step === "any") return null;
  return typeof step === "number" && Number.isFinite(step) && step > 0
    ? step
    : defaultStep;
}

function stepBase({ min, stepBase, type }: DatePickerRules) {
  if (type === "date") {
    const value = dateParts(min ?? "") ?? dateParts(stepBase ?? "");
    return dateSerial(value ?? { year: 1970, month: 1, day: 1 });
  }
  if (type === "month") {
    const value = monthParts(min ?? "") ?? monthParts(stepBase ?? "");
    return value ? value.year * 12 + value.month - 1 : 1970 * 12;
  }
  return (
    dateTimeSerial(min ?? "") ??
    dateTimeSerial(stepBase ?? "") ??
    dateSerial({ year: 1970, month: 1, day: 1 }) * DAY_MS
  );
}

function followsStep(value: number, rules: DatePickerRules) {
  const step = stepValue(rules);
  if (step === null) return true;
  const unit = rules.type === "datetime-local" ? 1000 : 1;
  const quotient = (value - stepBase(rules)) / (step * unit);
  return Math.abs(quotient - Math.round(quotient)) < 1e-7;
}

export function isAllowedValue(value: string, rules: DatePickerRules) {
  if (!isCompleteValue(value, rules.type)) return false;
  if (rules.type === "date") {
    const minimum = dateParts(rules.min ?? "");
    const maximum = dateParts(rules.max ?? "");
    const serial = dateSerial(dateParts(value)!);
    if (
      (minimum && serial < dateSerial(minimum)) ||
      (maximum && serial > dateSerial(maximum))
    )
      return false;
    return followsStep(serial, rules);
  }
  if (rules.type === "month") {
    const minimum = monthParts(rules.min ?? "");
    const maximum = monthParts(rules.max ?? "");
    const valueParts = monthParts(value)!;
    const serial = valueParts.year * 12 + valueParts.month - 1;
    const minimumSerial = minimum
      ? minimum.year * 12 + minimum.month - 1
      : null;
    const maximumSerial = maximum
      ? maximum.year * 12 + maximum.month - 1
      : null;
    if (
      (minimumSerial !== null && serial < minimumSerial) ||
      (maximumSerial !== null && serial > maximumSerial)
    )
      return false;
    return followsStep(serial, rules);
  }
  const serial = dateTimeSerial(value)!;
  const minimum = dateTimeSerial(rules.min ?? "");
  const maximum = dateTimeSerial(rules.max ?? "");
  if (
    (minimum !== null && serial < minimum) ||
    (maximum !== null && serial > maximum)
  )
    return false;
  return followsStep(serial, rules);
}

export function hasAllowedDateTimeOnDay(
  day: DateParts,
  rules: DatePickerRules,
) {
  if (rules.type !== "datetime-local")
    return isAllowedValue(isoDate(day), rules);
  const start = dateSerial(day) * DAY_MS;
  const minimum = dateTimeSerial(rules.min ?? "");
  const maximum = dateTimeSerial(rules.max ?? "");
  const lower = Math.max(start, minimum ?? start);
  const upper = Math.min(start + DAY_MS - 1, maximum ?? start + DAY_MS - 1);
  if (lower > upper) return false;
  const step = stepValue(rules);
  if (step === null) return true;
  const interval = step * 1000;
  const count = Math.ceil((lower - stepBase(rules)) / interval - 1e-9);
  return stepBase(rules) + count * interval <= upper + 1e-7;
}

export function isAllowedYear(year: number, rules: DatePickerRules) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return false;
  if (rules.type === "month") {
    return Array.from({ length: 12 }, (_, index) =>
      isAllowedValue(isoMonth(year, index + 1), rules),
    ).some(Boolean);
  }
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= daysInMonth(year, month); day++) {
      if (hasAllowedDateTimeOnDay({ year, month, day }, rules)) return true;
    }
  }
  return false;
}

export function formatRomeDateTimeLocal(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
