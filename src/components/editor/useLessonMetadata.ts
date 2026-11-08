import { useState } from "react";
import type { LessonData } from "../../store";
import { formatIsoToEuropeanDate, parseEuropeanDateToDate } from "../../utils/dates";

/** The editor is keyed by document identity. Save echoes must never reset live inputs. */
export function useLessonMetadata(lesson: LessonData | null) {
  const [subject, setSubject] = useState(lesson?.metadata.subject || "");
  const [teacher, setTeacher] = useState(lesson?.metadata.teacher || "");
  const [lessonNotes, setLessonNotes] = useState(lesson?.notes || "");
  const [plannedForInput, setPlannedForInput] = useState(
    formatIsoToEuropeanDate(lesson?.metadata.plannedFor),
  );
  const [plannedCalendarMonth, setPlannedCalendarMonth] = useState(() =>
    parseEuropeanDateToDate(formatIsoToEuropeanDate(lesson?.metadata.plannedFor)) || new Date(),
  );
  return {
    subject, setSubject, teacher, setTeacher, lessonNotes, setLessonNotes,
    plannedForInput, setPlannedForInput, plannedCalendarMonth, setPlannedCalendarMonth,
  };
}
