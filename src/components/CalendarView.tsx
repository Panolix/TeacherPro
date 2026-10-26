import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import { useEffect, useRef, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, CheckSquare, Square, GripVertical, Pencil } from "lucide-react";
import { useTranslation } from "../i18n/useTranslation";
import { ask } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store";

export function CalendarView() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const [dragOverDayKey, setDragOverDayKey] = useState<string | null>(null);
  const [lessonDropIndicator, setLessonDropIndicator] = useState<{
    dayKey: string;
    index: number;
  } | null>(null);
  const [isDraggingLesson, setIsDraggingLesson] = useState(false);
  const [isDeletingLessons, setIsDeletingLessons] = useState(false);
  const [renamingLesson, setRenamingLesson] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Mouse-based drag state - bypasses HTML5 DnD which is unreliable in WKWebView.
  const draggingLessonRef = useRef<string | null>(null);
  const mouseDragActiveRef = useRef(false);
  const renameTargetRef = useRef<string | null>(null);
  const renameCancelledRef = useRef(false);
  const {
    lessonTree,
    openLesson,
    deleteLesson,
    createNewLesson,
    rescheduleLesson,
    reorderCalendarLessons,
    renameVaultPath,
    subjects,
    lessonSubjectIndex,
    lessonPlannedDateIndex,
    lessonCalendarOrderIndex,
  } = useAppStore();

  const { t, language } = useTranslation();
  const dateLocale = language === "de" ? de : undefined;

  const start = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Monday
  
  const nextWeek = () => setCurrentWeek(addDays(currentWeek, 7));
  const prevWeek = () => setCurrentWeek(addDays(currentWeek, -7));
  const goToToday = () => setCurrentWeek(new Date());

  const beginRenameLesson = (
    event: React.MouseEvent,
    relativePath: string,
    seed: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    renameTargetRef.current = relativePath;
    renameCancelledRef.current = false;
    setRenameValue(seed);
    setRenamingLesson(relativePath);
  };

  const commitLessonRename = async () => {
    const target = renameTargetRef.current;
    const nextName = renameValue.trim();
    renameTargetRef.current = null;
    setRenamingLesson(null);
    setRenameValue("");

    if (!target || !nextName || renameCancelledRef.current) {
      renameCancelledRef.current = false;
      return;
    }

    const currentName = target.split("/").pop()?.replace(/\.json$/i, "") || "";
    if (nextName === currentName) {
      return;
    }

    await renameVaultPath("Lesson Plans", target, nextName);
    setSelectedLessons(new Set());
  };

  // Generate the 7 days of the week
  const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(start, i)), [start]);

  useEffect(() => {
    // Reset selection when changing week to avoid accidental cross-week deletes.
    setSelectedLessons(new Set());
    draggingLessonRef.current = null;
    setDragOverDayKey(null);
    setLessonDropIndicator(null);
    setIsDraggingLesson(false);
  }, [start.getTime()]);

  // We could filter `lessonPlans` by date if we stored it in the filename,
  // but for a robust system we would actually load the JSONs. Since loading all JSONs
  // can be slow, a quick hack is parsing the filename if we use intelligent naming: Lesson-YYYY-MM-DD...
  // Collect all lessons from lessonTree (includes both root and nested)
  const allLessonEntries = useMemo(() => {
    const entries: { name: string; relativePath: string }[] = [];
    const seen = new Set<string>();
    // Walk lessonTree to get all lessons (root + nested folders)
    const walk = (nodes: any[], parentPath: string) => {
      for (const n of nodes) {
        if (n.isDirectory) {
          walk(n.children || [], parentPath ? `${parentPath}/${n.name}` : n.name);
        } else if (n.name?.toLowerCase().endsWith(".json")) {
          const relativePath = parentPath ? `${parentPath}/${n.name}` : n.name;
          if (!seen.has(relativePath)) {
            seen.add(relativePath);
            entries.push({ name: n.name, relativePath });
          }
        }
      }
    };
    walk(lessonTree, "");
    return entries;
  }, [lessonTree]);

  const getLessonsForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return allLessonEntries
      .filter((lesson) => {
        const plannedIso = lessonPlannedDateIndex[lesson.relativePath];
        if (plannedIso) {
          const plannedDate = new Date(plannedIso);
          if (!Number.isNaN(plannedDate.getTime())) {
            return format(plannedDate, "yyyy-MM-dd") === dateStr;
          }
        }
        return lesson.name.includes(dateStr);
      })
      .sort((a, b) => {
        const aOrder = lessonCalendarOrderIndex[a.relativePath];
        const bOrder = lessonCalendarOrderIndex[b.relativePath];

        if (aOrder !== undefined || bOrder !== undefined) {
          if (aOrder === undefined) return 1;
          if (bOrder === undefined) return -1;
          if (aOrder !== bOrder) return aOrder - bOrder;
        }

        return a.relativePath.localeCompare(b.relativePath, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      });
  };

  const getLessonDateToken = (lessonRelativePath: string): string | null => {
    const plannedIso = lessonPlannedDateIndex[lessonRelativePath];
    if (plannedIso) {
      const plannedDate = new Date(plannedIso);
      if (!Number.isNaN(plannedDate.getTime())) {
        return format(plannedDate, "yyyy-MM-dd");
      }
    }
    const match = lessonRelativePath.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  };

  const getLessonInsertIndex = (dayKey: string, clientY: number): number => {
    const column = document.querySelector<HTMLElement>(`[data-day-key="${dayKey}"]`);
    const cards = column
      ? Array.from(column.querySelectorAll<HTMLElement>("[data-lesson-card]"))
      : [];

    for (let index = 0; index < cards.length; index += 1) {
      const rect = cards[index].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return index;
      }
    }

    return cards.length;
  };

  const handleLessonDrop = async (
    lessonName: string,
    targetDayKey: string,
    clientY: number,
  ) => {
    const targetDay = weekDays.find(
      (day) => format(day, "yyyy-MM-dd") === targetDayKey,
    );
    if (!targetDay) {
      return;
    }

    const targetPaths = getLessonsForDate(targetDay)
      .map((lesson) => lesson.relativePath)
      .filter(Boolean);
    let insertIndex = getLessonInsertIndex(targetDayKey, clientY);
    const sourceDayKey = getLessonDateToken(lessonName);

    if (sourceDayKey === targetDayKey) {
      const sourceIndex = targetPaths.indexOf(lessonName);
      const reordered = targetPaths.filter((path) => path !== lessonName);

      if (sourceIndex >= 0 && insertIndex > sourceIndex) {
        insertIndex -= 1;
      }
      insertIndex = Math.max(0, Math.min(insertIndex, reordered.length));
      reordered.splice(insertIndex, 0, lessonName);

      if (reordered.join("\n") !== targetPaths.join("\n")) {
        await reorderCalendarLessons(reordered);
      }
      return;
    }

    const sourceDay = sourceDayKey
      ? weekDays.find((day) => format(day, "yyyy-MM-dd") === sourceDayKey)
      : undefined;
    const sourcePaths = sourceDay
      ? getLessonsForDate(sourceDay)
          .map((lesson) => lesson.relativePath)
          .filter((path) => path && path !== lessonName)
      : [];

    const nextFileName = await rescheduleLesson(lessonName, targetDay);
    if (!nextFileName) {
      return;
    }

    const folderSlash = lessonName.lastIndexOf("/");
    const folderPrefix = folderSlash >= 0 ? lessonName.slice(0, folderSlash + 1) : "";
    const movedPath = folderPrefix + nextFileName;

    const targetWithMoved = targetPaths.filter((path) => path !== movedPath);
    insertIndex = Math.max(0, Math.min(insertIndex, targetWithMoved.length));
    targetWithMoved.splice(insertIndex, 0, movedPath);

    setSelectedLessons((previous) => {
      if (!previous.has(lessonName) || movedPath === lessonName) {
        return previous;
      }

      const next = new Set(previous);
      next.delete(lessonName);
      next.add(movedPath);
      return next;
    });

    await reorderCalendarLessons([...sourcePaths, ...targetWithMoved]);
  };

  /** Returns the data-day-key of whichever day column contains the point (x, y). */
  const findDayKeyAtPoint = (x: number, y: number): string | null => {
    const cols = document.querySelectorAll<HTMLElement>('[data-day-key]');
    for (const col of cols) {
      const r = col.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return col.getAttribute('data-day-key');
      }
    }
    return null;
  };

  /**
   * Mouse-based drag for lesson cards.
   * HTML5 dragstart on div elements does not fire reliably in WKWebView (Tauri/macOS).
   * We use mousedown → mousemove → mouseup with a floating ghost chip instead.
   */
  const startMouseDrag = (e: React.MouseEvent, lessonName: string, title: string) => {
    if (!lessonName) return;
    e.preventDefault(); // prevent text selection

    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let ghost: HTMLDivElement | null = null;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      if (!dragging && Math.sqrt(dx * dx + dy * dy) > 5) {
        dragging = true;
        mouseDragActiveRef.current = true;
        draggingLessonRef.current = lessonName;
        setIsDraggingLesson(true);

        ghost = document.createElement('div');
        Object.assign(ghost.style, {
          position: 'fixed',
          pointerEvents: 'none',
          zIndex: '9999',
          background: 'var(--tp-bg-3, #2a2a2a)',
          border: '2px solid var(--tp-accent, #2d86a5)',
          borderRadius: '8px',
          padding: '5px 10px',
          fontSize: '13px',
          fontWeight: '600',
          color: 'var(--tp-t-1, #fff)',
          whiteSpace: 'nowrap',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          transform: 'rotate(-2deg)',
          opacity: '0.95',
          userSelect: 'none',
        });
        ghost.textContent = title;
        document.body.appendChild(ghost);
      }

      if (dragging && ghost) {
        ghost.style.left = `${ev.clientX + 14}px`;
        ghost.style.top = `${ev.clientY - 12}px`;

        const targetDayKey = findDayKeyAtPoint(ev.clientX, ev.clientY);
        setDragOverDayKey(targetDayKey);
        if (targetDayKey) {
          const index = getLessonInsertIndex(targetDayKey, ev.clientY);
          setLessonDropIndicator((previous) =>
            previous?.dayKey === targetDayKey && previous.index === index
              ? previous
              : { dayKey: targetDayKey, index },
          );
        } else {
          setLessonDropIndicator(null);
        }
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      if (ghost) { ghost.remove(); ghost = null; }

      const wasLessonName = draggingLessonRef.current;
      draggingLessonRef.current = null;
      mouseDragActiveRef.current = false;
      setDragOverDayKey(null);
      setLessonDropIndicator(null);
      setIsDraggingLesson(false);

      if (!dragging || !wasLessonName) return;

      const targetDayKey = findDayKeyAtPoint(ev.clientX, ev.clientY);
      if (targetDayKey) {
        void handleLessonDrop(wasLessonName, targetDayKey, ev.clientY);
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const toggleSelectedLesson = (lessonName: string) => {
    setSelectedLessons((previous) => {
      const next = new Set(previous);
      if (next.has(lessonName)) {
        next.delete(lessonName);
      } else {
        next.add(lessonName);
      }
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedLessons.size === 0 || isDeletingLessons) {
      return;
    }

    const names = Array.from(selectedLessons);
    const confirmed = await ask(t('calendar.confirm.moveSelected', { count: names.length }), {
      okLabel: t('common.yes'),
      cancelLabel: t('common.no'),
    });
    if (!confirmed) {
      return;
    }

    setIsDeletingLessons(true);
    try {
      for (const name of names) {
        await deleteLesson(name);
      }

      setSelectedLessons(new Set());
    } finally {
      setIsDeletingLessons(false);
    }
  };

  const handleDeleteAllForDate = async (date: Date) => {
    if (isDeletingLessons) {
      return;
    }

    const lessons = getLessonsForDate(date).filter((lesson) => !!lesson.name);
    if (lessons.length === 0) {
      return;
    }

    const dateLabel = format(date, "EEE, MMM d", { locale: dateLocale });
    const confirmed = await ask(t('calendar.confirm.moveAll', { count: lessons.length, date: dateLabel }), {
      okLabel: t('common.yes'),
      cancelLabel: t('common.no'),
    });
    if (!confirmed) {
      return;
    }

    setIsDeletingLessons(true);
    try {
      for (const lesson of lessons) {
        const lessonPath = lesson.relativePath || lesson.name || "";
        if (lessonPath) await deleteLesson(lessonPath);
      }

      setSelectedLessons((previous) => {
        const next = new Set(previous);
        for (const lesson of lessons) {
          const lessonPath = lesson.relativePath || lesson.name || "";
          if (lessonPath) next.delete(lessonPath);
        }
        return next;
      });
    } finally {
      setIsDeletingLessons(false);
    }
  };

  const today = new Date();

  const renderLessonDropLine = (
    dayKey: string,
    index: number,
    placement: "top" | "bottom" = "top",
  ) => {
    if (lessonDropIndicator?.dayKey !== dayKey || lessonDropIndicator.index !== index) {
      return null;
    }

    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-0 z-10 h-[2px] rounded-full"
        style={{
          top: placement === "top" ? "-5px" : undefined,
          bottom: placement === "bottom" ? "-5px" : undefined,
          background: "var(--tp-accent)",
        }}
      />
    );
  };

  return (
    <div
      className="tp-calendar-page px-5 pt-4 pb-6 h-full flex flex-col gap-3"
      style={{ background: "var(--tp-bg-app)" }}
    >
      {/* Controls row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div
          className="inline-flex rounded-md overflow-hidden"
          style={{ background: "var(--tp-bg-1)", border: "1px solid var(--tp-b-1)" }}
        >
          <button
            onClick={prevWeek}
            className="h-8 w-8 inline-flex items-center justify-center text-[var(--tp-t-2)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-4)]"
            title={t('calendar.navigation.previousWeek')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={nextWeek}
            className="h-8 w-8 inline-flex items-center justify-center text-[var(--tp-t-2)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-4)]"
            title={t('calendar.navigation.nextWeek')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={goToToday}
          className="h-8 px-3.5 rounded-md text-sm font-medium bg-[var(--tp-bg-1)] border border-[var(--tp-b-1)] text-[var(--tp-t-2)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
        >
          {t('calendar.navigation.today')}
        </button>
        <span
          className="text-[15px] font-semibold tracking-[-0.01em]"
          style={{ color: "var(--tp-t-1)" }}
        >
          {t('calendar.weekLabel', { week: format(start, "I"), start: format(start, "MMM d", { locale: dateLocale }), end: format(addDays(start, 6), "MMM d, yyyy", { locale: dateLocale }) })}
        </span>

        <div className="flex-1" />

        <button
          onClick={handleDeleteSelected}
          disabled={selectedLessons.size === 0 || isDeletingLessons}
          className={`h-9 w-9 inline-flex items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-40 ${
            selectedLessons.size > 0 ? "hover:brightness-125" : ""
          }`}
          title={isDeletingLessons ? t('calendar.actions.moving') : t('calendar.tooltips.moveToTrash')}
          style={{
            background: selectedLessons.size > 0 ? "rgba(239, 68, 68, 0.12)" : "transparent",
            border: selectedLessons.size > 0
              ? "1px solid rgba(239, 68, 68, 0.4)"
              : "1px solid transparent",
            color: selectedLessons.size > 0 ? "#fca5a5" : "var(--tp-t-3)",
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Day columns */}
      <div className="flex-1 grid grid-cols-7 gap-3 min-h-0">
        {weekDays.map((day, idx) => {
          const lessons = getLessonsForDate(day);
          const dayKey = format(day, "yyyy-MM-dd");
          const isDropTarget = dragOverDayKey === dayKey;
          const isToday = isSameDay(day, today);

          const borderColor = isDropTarget
            ? "var(--tp-accent)"
            : isToday
              ? "var(--tp-accent)"
              : "var(--tp-b-1)";

          return (
            <div
              key={idx}
              data-day-key={dayKey}
              className="tp-calendar-day-card flex flex-col rounded-xl overflow-hidden transition-colors backdrop-blur-[2px]"
              style={{
                background: isDropTarget ? "var(--tp-accent-softer)" : "var(--tp-bg-1)",
                border: `1px solid ${borderColor}`,
                boxShadow: isToday ? "0 0 0 1px var(--tp-accent-softer)" : undefined,
              }}
            >
              {/* Day header */}
              <div
                className="px-3 py-3 shrink-0"
                style={{ borderBottom: "1px solid var(--tp-b-1)" }}
              >
                <div
                  className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: "var(--tp-t-4)" }}
                >
                  {format(day, "EEE", { locale: dateLocale })}
                </div>
                <div
                  className="text-[17px] font-semibold leading-none mt-0.5 tabular-nums"
                  style={{ color: isToday ? "var(--tp-accent)" : "var(--tp-t-1)" }}
                >
                  {format(day, "d")}
                </div>
              </div>

              {/* Lessons list */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                {lessons.length === 0 ? (
                  <div
                    className="h-full flex items-center justify-center text-[12px] italic min-h-[60px]"
                    style={{ color: "var(--tp-t-4)" }}
                  >
                    {t('calendar.placeholders.freeDay')}
                  </div>
                ) : (
                  <>
                    {lessons.map((lesson, lIdx) => {
                    // Clean title: strip date token, "Lesson" prefix, trailing IDs
                    const rawStem = (lesson.name || "").replace(/\.json$/i, "");
                    const uniqueStemMatch = rawStem.match(/^(Lesson|Stunde|Mindmap)-(\d+)$/i);
                    const uniqueTitle = uniqueStemMatch
                      ? `${uniqueStemMatch[1]} ${uniqueStemMatch[2]}`
                      : "";
                    const withoutDate = rawStem.replace(/\d{4}-\d{2}-\d{2}-?/, "");
                    const withoutLesson = withoutDate.replace(/^Lesson-?/i, "");
                    const withoutTrailingId = withoutLesson.replace(/-?\d{3,6}$/, "").replace(/-$/, "");
                    const derivedTitle = uniqueTitle || withoutTrailingId.replace(/-/g, " ").trim();

                    const lessonName = lesson.relativePath || lesson.name || "";
                    const isSelected = lessonName ? selectedLessons.has(lessonName) : false;
                    const subjectName = lessonName ? (lessonSubjectIndex[lessonName] || "") : "";
                    const subjectColor = subjectName ? subjects.find((s) => s.name === subjectName)?.color : undefined;

                    // If the derived title is just the subject name, the file was auto-named
                    // from the subject (e.g. "2026-04-17-English.json"). Use a date label so
                    // the subject badge isn't duplicated as the heading.
                    const titleEqualsSubject = !!subjectName && derivedTitle.toLowerCase() === subjectName.toLowerCase();
                    const cleanTitle = (derivedTitle && !titleEqualsSubject)
                      ? derivedTitle
                       : t('calendar.defaultLessonTitle', { date: format(day, "MMM d", { locale: dateLocale }) });
                    const renameSeed = uniqueTitle || derivedTitle || rawStem;
                    return (
                      <div
                        key={`${lessonName}:${lIdx}`}
                        className={`relative ${isDraggingLesson ? "pointer-events-none" : ""}`}
                      >
                        {renderLessonDropLine(dayKey, lIdx)}
                        <div
                          data-lesson-card
                          data-lesson-path={lessonName}
                        className="w-full rounded-lg overflow-hidden"
                        style={{
                          background: isSelected ? "var(--tp-accent-softer)" : "var(--tp-bg-2)",
                          border: `1px solid ${isSelected ? "var(--tp-accent)" : "var(--tp-b-2)"}`,
                          borderLeft: `3px solid ${subjectColor || "var(--tp-accent)"}`,
                        }}
                      >
                        {/* Title row — clickable to open */}
                        <button
                          onClick={() => lessonName && openLesson(lessonName)}
                          className="w-full px-2.5 pt-2.5 pb-1.5 text-left hover:bg-[var(--tp-bg-4)]"
                        >
                          <div
                            className="text-[13px] font-semibold leading-snug"
                            style={{ color: "var(--tp-t-1)", wordBreak: "break-word" }}
                          >
                            {cleanTitle}
                          </div>
                          {subjectName && (
                            <div
                              className="text-[11px] mt-0.5 font-medium"
                              style={{ color: subjectColor || "var(--tp-accent)" }}
                            >
                              {subjectName}
                            </div>
                          )}
                        </button>

                        {/* Action row — always visible, compact */}
                        {renamingLesson === lessonName && (
                          <div className="px-2.5 pb-1.5">
                            <input
                              autoFocus
                              value={renameValue}
                              aria-label={t('sidebar.contextMenu.rename')}
                              onChange={(event) => setRenameValue(event.target.value)}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => event.stopPropagation()}
                              onBlur={() => {
                                if (!renameCancelledRef.current) {
                                  void commitLessonRename();
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void commitLessonRename();
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  renameCancelledRef.current = true;
                                  renameTargetRef.current = null;
                                  setRenamingLesson(null);
                                  setRenameValue("");
                                }
                              }}
                              className="w-full rounded-md border px-2 py-1 text-[13px] font-semibold outline-none"
                              style={{
                                background: "var(--tp-bg-3)",
                                borderColor: "var(--tp-accent)",
                                color: "var(--tp-t-1)",
                              }}
                            />
                          </div>
                        )}

                        {/* Action row - always visible, compact */}
                        <div
                          className="flex items-center px-1.5 pb-1.5"
                          style={{ borderTop: "1px solid var(--tp-b-1)" }}
                        >
                          {/* Drag grip — onMouseDown starts mouse-based drag (reliable in WKWebView) */}
                          <div
                            onMouseDown={(e) => startMouseDrag(e, lessonName, cleanTitle)}
                            className="h-6 w-6 inline-flex items-center justify-center rounded cursor-grab active:cursor-grabbing select-none"
                            style={{ color: "var(--tp-t-3)" }}
                            title={t('calendar.tooltips.dragToReschedule')}
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </div>

                          <div className="flex-1" />

                          {/* Select */}
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              if (lessonName) toggleSelectedLesson(lessonName);
                            }}
                            className="h-6 w-6 inline-flex items-center justify-center rounded text-[var(--tp-t-3)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-4)]"
                            style={isSelected ? { color: "var(--tp-accent)" } : undefined}
                            title={isSelected ? t('calendar.tooltips.deselect') : t('calendar.tooltips.select')}
                          >
                            {isSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                          </button>

                          {/* Rename */}
                          {lessonName && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                beginRenameLesson(event, lessonName, renameSeed);
                              }}
                              className="h-6 w-6 inline-flex items-center justify-center rounded text-[var(--tp-t-3)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-4)]"
                              title={t('sidebar.contextMenu.rename')}
                              aria-label={t('sidebar.contextMenu.rename')}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Delete */}
                          {lessonName && (
                            <button
                              onClick={async (event) => {
                                event.stopPropagation();
                                setIsDeletingLessons(true);
                                try {
                                  await deleteLesson(lessonName);
                                  setSelectedLessons((previous) => {
                                    const next = new Set(previous);
                                    next.delete(lessonName);
                                    return next;
                                  });
                                } catch (err) {
                                  console.error("Failed to delete lesson:", err);
                                  alert(t("common.deleteError", { detail: String(err) }));
                                } finally {
                                  setIsDeletingLessons(false);
                                }
                              }}
                              disabled={isDeletingLessons}
                              className="h-6 w-6 inline-flex items-center justify-center rounded text-[var(--tp-t-3)] disabled:opacity-30 disabled:cursor-not-allowed hover:text-red-400 hover:bg-red-400/10"
                              title={t('calendar.tooltips.moveToTrash')}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        </div>
                        {lIdx === lessons.length - 1 &&
                          renderLessonDropLine(dayKey, lessons.length, "bottom")}
                      </div>
                    )
                  })}
                  </>
                )}
              </div>

              {/* Day footer */}
      <div
                className="shrink-0 flex items-center justify-center gap-1 p-2"
                style={{ borderTop: "1px solid var(--tp-b-1)" }}
              >
                <button
                  onClick={() => void createNewLesson(day)}
                  className="h-9 w-9 inline-flex items-center justify-center rounded text-[var(--tp-t-3)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-4)]"
                  title={t('calendar.actions.add')}
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => void handleDeleteAllForDate(day)}
                  disabled={isDeletingLessons || lessons.length === 0}
                  className={`h-9 w-9 inline-flex items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                    lessons.length > 0 && !isDeletingLessons ? "hover:[filter:brightness(1.15)]" : ""
                  }`}
                  title={isDeletingLessons ? t('calendar.actions.deleting') : t('calendar.tooltips.moveAllForDate', { count: lessons.length })}
                  style={{
                    color: isDeletingLessons ? "var(--tp-t-3)" : lessons.length > 0 ? "#ef4444" : "var(--tp-t-4)",
                    background: isDeletingLessons ? "transparent" : lessons.length > 0 ? "rgba(239,68,68,0.12)" : "transparent",
                    border: isDeletingLessons ? "1px solid transparent" : lessons.length > 0 ? "1px solid rgba(239,68,68,0.35)" : "1px solid transparent",
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
