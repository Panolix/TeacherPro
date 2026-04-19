import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { useEffect, useRef, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, CheckSquare, Square, GripVertical } from "lucide-react";
import { useAppStore } from "../store";

export function CalendarView() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const [dragOverDayKey, setDragOverDayKey] = useState<string | null>(null);
  const [isDeletingLessons, setIsDeletingLessons] = useState(false);
  // Mouse-based drag state — bypasses HTML5 DnD which is unreliable in WKWebView.
  const draggingLessonRef = useRef<string | null>(null);
  const mouseDragActiveRef = useRef(false);
  const {
    lessonTree,
    openLesson,
    deleteLesson,
    createNewLesson,
    rescheduleLesson,
    subjects,
    lessonSubjectIndex,
  } = useAppStore();

  const start = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Monday
  
  const nextWeek = () => setCurrentWeek(addDays(currentWeek, 7));
  const prevWeek = () => setCurrentWeek(addDays(currentWeek, -7));
  const goToToday = () => setCurrentWeek(new Date());

  // Generate the 7 days of the week
  const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(start, i)), [start]);

  useEffect(() => {
    // Reset selection when changing week to avoid accidental cross-week deletes.
    setSelectedLessons(new Set());
    draggingLessonRef.current = null;
    setDragOverDayKey(null);
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
    return allLessonEntries.filter(p => p.name && p.name.includes(dateStr));
  };

  const getLessonDateToken = (lessonName: string): string | null => {
    const match = lessonName.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  };

  const moveLessonToDate = async (lessonName: string, day: Date) => {
    const targetDateStr = format(day, "yyyy-MM-dd");
    if (getLessonDateToken(lessonName) === targetDateStr) {
      return;
    }

    const nextFileName = await rescheduleLesson(lessonName, day);
    if (!nextFileName) {
      return;
    }

    setSelectedLessons((previous) => {
      if (!previous.has(lessonName)) {
        return previous;
      }

      const next = new Set(previous);
      next.delete(lessonName);
      next.add(nextFileName);
      return next;
    });
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
        setDragOverDayKey(findDayKeyAtPoint(ev.clientX, ev.clientY));
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

      if (!dragging || !wasLessonName) return;

      const targetDayKey = findDayKeyAtPoint(ev.clientX, ev.clientY);
      if (targetDayKey) {
        const targetDay = weekDays.find(d => format(d, 'yyyy-MM-dd') === targetDayKey);
        if (targetDay) void moveLessonToDate(wasLessonName, targetDay);
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
    const confirmed = confirm(`Move ${names.length} selected lesson plan(s) to Trash?`);
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
    console.log("Delete all clicked for:", date, "isDeletingLessons:", isDeletingLessons);
    if (isDeletingLessons) {
      return;
    }

    const lessons = getLessonsForDate(date).filter((lesson) => !!lesson.name);
    console.log("Lessons to delete:", lessons.length, lessons.map(l => l.name));
    if (lessons.length === 0) {
      return;
    }

    const dateLabel = format(date, "EEE, MMM d");
    const confirmed = confirm(`Move all ${lessons.length} lesson plan(s) for ${dateLabel} to Trash?`);
    if (!confirmed) {
      return;
    }

    setIsDeletingLessons(true);
    try {
      for (const lesson of lessons) {
        const lessonPath = lesson.relativePath || lesson.name || "";
        console.log("Delete all - deleting:", lessonPath);
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
            className="h-8 w-8 inline-flex items-center justify-center hover:[background:var(--tp-bg-3)] hover:[color:var(--tp-t-1)] transition-colors"
            style={{ color: "var(--tp-t-2)" }}
            title="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={nextWeek}
            className="h-8 w-8 inline-flex items-center justify-center hover:[background:var(--tp-bg-3)] hover:[color:var(--tp-t-1)] transition-colors"
            style={{ color: "var(--tp-t-2)" }}
            title="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={goToToday}
          className="h-8 px-3.5 rounded-md text-sm font-medium transition-colors hover:![background:var(--tp-bg-3)] hover:![color:var(--tp-t-1)] active:![background:var(--tp-bg-2)]"
          style={{
            background: "var(--tp-bg-1)",
            border: "1px solid var(--tp-b-1)",
            color: "var(--tp-t-2)",
          }}
        >
          Today
        </button>
        <span
          className="text-[15px] font-semibold tracking-[-0.01em]"
          style={{ color: "var(--tp-t-1)" }}
        >
          {format(start, "MMM d")} – {format(addDays(start, 6), "MMM d, yyyy")}
        </span>

        <div className="flex-1" />

        <button
          onClick={handleDeleteSelected}
          disabled={selectedLessons.size === 0 || isDeletingLessons}
          className="h-9 inline-flex items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: selectedLessons.size > 0 ? "rgba(239, 68, 68, 0.12)" : "var(--tp-bg-1)",
            border: selectedLessons.size > 0
              ? "1px solid rgba(239, 68, 68, 0.4)"
              : "1px solid var(--tp-b-1)",
            color: selectedLessons.size > 0 ? "#fca5a5" : "var(--tp-t-3)",
          }}
        >
          <Trash2 className="h-4 w-4" />
          {isDeletingLessons
            ? "Moving..."
            : `Move Selected to Trash (${selectedLessons.size})`}
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
                  {format(day, "EEE")}
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
                    Free day
                  </div>
                ) : (
                  lessons.map((lesson, lIdx) => {
                    // Clean title: strip date token, "Lesson" prefix, trailing IDs
                    const rawStem = (lesson.name || "").replace(/\.json$/i, "");
                    const withoutDate = rawStem.replace(/\d{4}-\d{2}-\d{2}-?/, "");
                    const withoutLesson = withoutDate.replace(/^Lesson-?/i, "");
                    const withoutTrailingId = withoutLesson.replace(/-?\d{3,6}$/, "").replace(/-$/, "");
                    const derivedTitle = withoutTrailingId.replace(/-/g, " ").trim();

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
                      : `Lesson · ${format(day, "MMM d")}`;
                    return (
                      <div
                        key={lIdx}
                        data-lesson-card
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
                          className="w-full px-2.5 pt-2.5 pb-1.5 text-left"
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
                        <div
                          className="flex items-center px-1.5 pb-1.5"
                          style={{ borderTop: "1px solid var(--tp-b-1)" }}
                        >
                          {/* Drag grip — onMouseDown starts mouse-based drag (reliable in WKWebView) */}
                          <div
                            onMouseDown={(e) => startMouseDrag(e, lessonName, cleanTitle)}
                            className="h-6 w-6 inline-flex items-center justify-center rounded cursor-grab active:cursor-grabbing select-none"
                            style={{ color: "var(--tp-t-3)" }}
                            title="Drag to reschedule"
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
                            className="h-6 w-6 inline-flex items-center justify-center rounded"
                            style={{ color: isSelected ? "var(--tp-accent)" : "var(--tp-t-3)" }}
                            title={isSelected ? "Deselect" : "Select"}
                          >
                            {isSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                          </button>

                          {/* Delete */}
                          {lessonName && (
                            <button
                              onClick={async (event) => {
                                event.stopPropagation();
                                if (confirm(`Move "${cleanTitle}" to Trash?`)) {
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
                                    alert("Error deleting: " + String(err));
                                  } finally {
                                    setIsDeletingLessons(false);
                                  }
                                }
                              }}
                              disabled={isDeletingLessons}
                              className="h-6 w-6 inline-flex items-center justify-center rounded disabled:opacity-30 disabled:cursor-not-allowed hover:text-red-400 hover:bg-red-400/10 active:text-red-500 transition-colors"
                              style={{ color: "var(--tp-t-3)" }}
                              title="Move to Trash"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Day footer */}
              <div
                className="shrink-0 p-2 flex gap-1.5"
                style={{ borderTop: "1px solid var(--tp-b-1)" }}
              >
                <button
                  onClick={() => void createNewLesson(day)}
                  className="flex-1 h-7 inline-flex items-center justify-center gap-1 rounded text-[11.5px] font-medium transition-colors hover:[background:var(--tp-bg-3)] hover:[color:var(--tp-t-1)]"
                  style={{ color: "var(--tp-t-3)" }}
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
                <button
                  onClick={() => void handleDeleteAllForDate(day)}
                  disabled={isDeletingLessons || lessons.length === 0}
                  className={`h-7 px-2.5 inline-flex items-center gap-1 rounded text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    lessons.length > 0 && !isDeletingLessons ? "hover:[filter:brightness(1.15)]" : ""
                  }`}
                  style={{
                    color: isDeletingLessons ? "var(--tp-t-3)" : lessons.length > 0 ? "#ef4444" : "var(--tp-t-4)",
                    background: isDeletingLessons ? "transparent" : lessons.length > 0 ? "rgba(239,68,68,0.12)" : "transparent",
                    border: isDeletingLessons ? "1px solid transparent" : lessons.length > 0 ? "1px solid rgba(239,68,68,0.35)" : "1px solid transparent",
                  }}
                  title={isDeletingLessons ? "Deleting..." : lessons.length > 0 ? `Move all ${lessons.length} lesson(s) to Trash` : "No lessons to delete"}
                >
                  <Trash2 className="w-3 h-3" /> All
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
