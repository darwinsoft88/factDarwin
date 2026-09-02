"use strict";

const BUSINESS_TIME_ZONE = "America/Guayaquil";

function businessTimeMetadata(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error("Fecha de ciclo invalida.");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const offsetMinutes = Math.round((localAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, "0")}:${String(absoluteOffset % 60).padStart(2, "0")}`;
  const compactDate = `${parts.year}${parts.month}${parts.day}`;
  const compactTime = `${parts.hour}${parts.minute}${parts.second}`;
  return Object.freeze({
    businessTimeZone: BUSINESS_TIME_ZONE,
    createdAtEcuador: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`,
    createdAtUtc: date.toISOString(),
    cyclePrefix: `EC-${compactDate}-${compactTime}`,
    futureRemoteDatePath: `${parts.year}/${parts.month}/${parts.day}/`
  });
}

module.exports = { BUSINESS_TIME_ZONE, businessTimeMetadata };
