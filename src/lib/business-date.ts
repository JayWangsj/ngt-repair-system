import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { romeDay } from "./domain";

export type BusinessClockValue = {
  mode: "SYSTEM" | "MANUAL";
  manualDate: string;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function validBusinessDate(value: string) {
  return (
    datePattern.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function romeDateRange(startDay: string, endDayExclusive: string) {
  const boundary = (day: string) => {
    const utcMidnight = new Date(`${day}T00:00:00Z`);
    const offset = new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Rome",
      timeZoneName: "longOffset",
    })
      .formatToParts(utcMidnight)
      .find((part) => part.type === "timeZoneName")?.value;
    const match = /GMT(?:(\+|-)(\d{1,2})(?::(\d{2}))?)?/.exec(offset ?? "");
    const minutes = match?.[1]
      ? (Number(match[2]) * 60 + Number(match[3] ?? 0)) *
        (match[1] === "+" ? 1 : -1)
      : 0;
    return new Date(utcMidnight.getTime() - minutes * 60_000);
  };
  return { gte: boundary(startDay), lt: boundary(endDayExclusive) };
}

export function resolveBusinessDay(
  clock: { mode: string; manualDate: string | null } | null,
  systemDate = new Date(),
) {
  return clock?.mode === "MANUAL" &&
    clock.manualDate &&
    validBusinessDate(clock.manualDate)
    ? clock.manualDate
    : romeDay(systemDate);
}

type ClockClient = Pick<Prisma.TransactionClient, "businessClock">;

export async function getBusinessClock(
  client: ClockClient = db,
): Promise<BusinessClockValue> {
  const clock = await client.businessClock.findUnique({
    where: { id: "default" },
  });
  return {
    mode: clock?.mode === "MANUAL" ? "MANUAL" : "SYSTEM",
    manualDate: clock?.manualDate ?? "",
  };
}

export async function getBusinessDay(client: ClockClient = db) {
  const clock = await client.businessClock.findUnique({
    where: { id: "default" },
  });
  return resolveBusinessDay(clock);
}
