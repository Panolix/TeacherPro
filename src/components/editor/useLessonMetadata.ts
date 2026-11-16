import { useState } from "react";
import type { LessonData } from "../../store";
import { formatIsoToEuropeanDate, parseEuropeanDateToDate } from "../../utils/dates";

/** The editor is keyed by document identity. Save echoes must never reset live inputs. */
export function useLessonMetadata(lesson: LessonData | null, language: string = "en") {
  const dateSeparator = language === "de" ? "." : "/";
  const [subject, setSubject] = useState(lesson?.metadata.subject || "");
  const [className, setClassName] = useState(lesson?.metadata.className || "");
  const [period, setPeriod] = useState(lesson?.metadata.period || "");
  const [room, setRoom] = useState(lesson?.metadata.room || "");
  const [topic, setTopic] = useState(lesson?.metadata.topic || "");
  const [lessonNotes, setLessonNotes] = useState(lesson?.notes || "");
  const [plannedForInput, setPlannedForInput] = useState(
    formatIsoToEuropeanDate(lesson?.metadata.plannedFor, dateSeparator),
  );
  const [plannedCalendarMonth, setPlannedCalendarMonth] = useState(() =>
    parseEuropeanDateToDate(formatIsoToEuropeanDate(lesson?.metadata.plannedFor)) || new Date(),
  );
  return {
    subject, setSubject,
    className, setClassName,
    period, setPeriod,
    room, setRoom,
    topic, setTopic,
    lessonNotes, setLessonNotes,
    plannedForInput, setPlannedForInput,
    plannedCalendarMonth, setPlannedCalendarMonth,
  };
}
