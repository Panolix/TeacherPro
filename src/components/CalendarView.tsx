import { format, startOfWeek, addDays } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, CheckSquare, Square } from "lucide-react";
import { useAppStore } from "../store";

export function CalendarView() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const { lessonPlans, openLesson, deleteLesson, createNewLesson } = useAppStore();

  const start = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Monday
  
  const nextWeek = () => setCurrentWeek(addDays(currentWeek, 7));
  const prevWeek = () => setCurrentWeek(addDays(currentWeek, -7));
  const goToToday = () => setCurrentWeek(new Date());

  // Generate the 7 days of the week
  const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(start, i)), [start]);

  useEffect(() => {
    // Reset selection when changing week to avoid accidental cross-week deletes.
    setSelectedLessons(new Set());
  }, [start.getTime()]);

  // We could filter `lessonPlans` by date if we stored it in the filename,
  // but for a robust system we would actually load the JSONs. Since loading all JSONs
  // can be slow, a quick hack is parsing the filename if we use intelligent naming: Lesson-YYYY-MM-DD...
  const getLessonsForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return lessonPlans.filter(p => p.name && p.name.includes(dateStr));
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
    if (selectedLessons.size === 0) {
      return;
    }

    const names = Array.from(selectedLessons);
    const confirmed = confirm(`Move ${names.length} selected lesson plan(s) to Trash?`);
    if (!confirmed) {
      return;
    }

    for (const name of names) {
      await deleteLesson(name);
    }

    setSelectedLessons(new Set());
  };

  const handleDeleteAllForDate = async (date: Date) => {
    const lessons = getLessonsForDate(date).filter((lesson) => !!lesson.name);
    if (lessons.length === 0) {
      return;
    }

    const dateLabel = format(date, "EEE, MMM d");
    const confirmed = confirm(`Move all ${lessons.length} lesson plan(s) for ${dateLabel} to Trash?`);
    if (!confirmed) {
      return;
    }

    for (const lesson of lessons) {
      await deleteLesson(lesson.name!);
    }

    setSelectedLessons((previous) => {
      const next = new Set(previous);
      for (const lesson of lessons) {
        if (lesson.name) {
          next.delete(lesson.name);
        }
      }
      return next;
    });
  };

  return (
    <div className="tp-calendar-page p-8 h-full flex flex-col bg-[#1e1e1e]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-100">Weekly Planner</h1>
          <p className="text-gray-400 mt-1">Plan your lessons across the week.</p>
        </div>
        <div className="tp-calendar-nav flex items-center gap-4 bg-[#2a2a2a] p-1 rounded-lg border border-[#333]">
          <button onClick={prevWeek} className="p-2 hover:bg-[#333] rounded-md text-gray-300">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#333] text-gray-100 hover:bg-[#3f3f3f] transition-colors"
          >
            Today
          </button>
          <span className="font-semibold text-gray-200 min-w-[140px] text-center">
            {format(start, "MMM d")} - {format(addDays(start, 6), "MMM d, yyyy")}
          </span>
          <button onClick={nextWeek} className="p-2 hover:bg-[#333] rounded-md text-gray-300">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDeleteSelected}
            disabled={selectedLessons.size === 0}
            className="flex items-center gap-2 rounded-md border border-[#5a2b2b] bg-[#3a1f1f] px-3 py-2 text-sm text-red-200 transition-colors hover:bg-[#4a2525] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> Move Selected to Trash ({selectedLessons.size})
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-7 gap-4 min-h-0">
        {weekDays.map((day, idx) => {
          const lessons = getLessonsForDate(day);
          
          return (
            <div key={idx} className="tp-calendar-day-card flex flex-col bg-[#191919] border border-[#2a2a2a] rounded-xl overflow-hidden shadow-sm">
              <div className="p-3 border-b border-[#2a2a2a] bg-[#222] text-center">
                <div className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{format(day, "EEEE")}</div>
                <div className="text-2xl font-bold text-gray-200 mt-1">{format(day, "d")}</div>
              </div>
              <div className="p-3 flex-1 overflow-y-auto space-y-2">
                {lessons.length === 0 ? (
                   <div className="text-center mt-4 text-xs text-gray-600 italic">Free day</div>
                ) : (
                  lessons.map((lesson, lIdx) => {
                    const title = lesson.name?.replace(`-${format(day, "yyyy-MM-dd")}-`, "").replace(".json", "") || "Lesson";
                    const lessonName = lesson.name || "";
                    const isSelected = lessonName ? selectedLessons.has(lessonName) : false;
                    return (
                      <div
                        key={lIdx}
                        className={`w-full p-2 border rounded-lg transition-colors ${
                          isSelected
                            ? "bg-[#2f2940] border-[var(--tp-accent)]"
                            : "bg-[#2d2d2d] border-[#444]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              if (lessonName) {
                                toggleSelectedLesson(lessonName);
                              }
                            }}
                            className="text-gray-300 hover:text-white"
                            title={isSelected ? "Unselect" : "Select"}
                          >
                            {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => lesson.name && openLesson(lesson.name)}
                            className="min-w-0 flex-1 text-left hover:text-white"
                          >
                            <div className="font-medium text-gray-200 text-sm truncate">{title}</div>
                          </button>
                          {lessonName && (
                            <button
                              onClick={async (event) => {
                                event.stopPropagation();
                                if (confirm(`Move lesson plan \"${title}\" to Trash?`)) {
                                  await deleteLesson(lessonName);
                                  setSelectedLessons((previous) => {
                                    const next = new Set(previous);
                                    next.delete(lessonName);
                                    return next;
                                  });
                                }
                              }}
                              className="text-red-300 hover:text-red-200"
                              title="Move lesson to Trash"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="p-2 border-t border-[#2a2a2a] bg-[#222]">
                 <div className="flex gap-2">
                   <button
                     onClick={() => void createNewLesson(day)}
                     className="flex-1 flex items-center justify-center gap-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-[#333] rounded transition-colors"
                   >
                      <Plus className="w-3 h-3" /> Add
                   </button>
                   <button
                     onClick={() => void handleDeleteAllForDate(day)}
                     className="flex items-center justify-center gap-1 py-1.5 px-2 text-xs text-red-300 hover:text-red-200 hover:bg-[#3a2020] rounded transition-colors"
                     title="Delete all lessons for this day"
                   >
                     <Trash2 className="w-3 h-3" /> All
                   </button>
                 </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
