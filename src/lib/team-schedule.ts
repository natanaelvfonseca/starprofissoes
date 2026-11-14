export type TeamRepeat = "none" | "daily" | "weekdays" | "weekly" | "monthly";

export function localFields(value: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const n = (key: string) => Number(f.find((item) => item.type === key)?.value ?? "0");
  return {
    year: n("year"),
    month: n("month"),
    day: n("day"),
    hour: n("hour"),
    minute: n("minute"),
    second: n("second"),
  };
}

function fromLocal(c: ReturnType<typeof localFields>) {
  const wanted = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
  let utc = wanted;
  for (let i = 0; i < 3; i++) {
    const observed = localFields(new Date(utc));
    const got = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    utc += wanted - got;
  }
  return new Date(utc);
}

export function nextOccurrence(
  currentISO: string,
  anchorISO: string,
  recurrence: TeamRepeat,
  repeatUntil?: string | null,
) {
  if (recurrence === "none") return null;
  const c = localFields(new Date(currentISO));
  const anchor = localFields(new Date(anchorISO));
  if (recurrence === "monthly") {
    const nextMonth = new Date(Date.UTC(c.year, c.month, 1));
    const lastDay = new Date(
      Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0),
    ).getUTCDate();
    c.year = nextMonth.getUTCFullYear();
    c.month = nextMonth.getUTCMonth() + 1;
    c.day = Math.min(anchor.day, lastDay);
  } else {
    const date = new Date(Date.UTC(c.year, c.month - 1, c.day));
    date.setUTCDate(date.getUTCDate() + (recurrence === "weekly" ? 7 : 1));
    if (recurrence === "weekdays") {
      while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
    }
    c.year = date.getUTCFullYear();
    c.month = date.getUTCMonth() + 1;
    c.day = date.getUTCDate();
  }
  const day = [
    String(c.year).padStart(4, "0"),
    String(c.month).padStart(2, "0"),
    String(c.day).padStart(2, "0"),
  ].join("-");
  if (repeatUntil && day > repeatUntil) return null;
  return fromLocal(c).toISOString();
}
