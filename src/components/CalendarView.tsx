import { format, startOfWeek, addDays } from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useAppStore } from "../store";

export function CalendarView() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const { lessonPlans, openLesson } = useAppStore();

  const start = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Monday
  
  const nextWeek = () => setCurrentWeek(addDays(currentWeek, 7));
  const prevWeek = () => setCurrentWeek(addDays(currentWeek, -7));

  // Generate the 7 days of the week
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(start, i));

  // We could filter `lessonPlans` by date if we stored it in the filename,
  // but for a robust system we would actually load the JSONs. Since loading all JSONs
  // can be slow, a quick hack is parsing the filename if we use intelligent naming: Lesson-YYYY-MM-DD...
  const getLessonsForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return lessonPlans.filter(p => p.name && p.name.includes(dateStr));
  };

  return (
    <div className="p-8 h-full flex flex-col bg-[#1e1e1e]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-100">Weekly Planner</h1>
          <p className="text-gray-400 mt-1">Plan your lessons across the week.</p>
        </div>
        <div className="flex items-center gap-4 bg-[#2a2a2a] p-1 rounded-lg border border-[#333]">
          <button onClick={prevWeek} className="p-2 hover:bg-[#333] rounded-md text-gray-300">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-gray-200 min-w-[140px] text-center">
            {format(start, "MMM d")} - {format(addDays(start, 6), "MMM d, yyyy")}
          </span>
          <button onClick={nextWeek} className="p-2 hover:bg-[#333] rounded-md text-gray-300">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-7 gap-4 min-h-0">
        {weekDays.map((day, idx) => {
          const lessons = getLessonsForDate(day);
          
          return (
            <div key={idx} className="flex flex-col bg-[#191919] border border-[#2a2a2a] rounded-xl overflow-hidden shadow-sm">
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
                    return (
                      <button
                        key={lIdx}
                        onClick={() => openLesson(lesson.name!)}
                        className="w-full text-left p-2 bg-[#2d2d2d] hover:bg-[#3a3a3a] border border-[#444] rounded-lg transition-colors group relative"
                      >
                        <div className="font-medium text-gray-200 text-sm truncate">{title}</div>
                      </button>
                    )
                  })
                )}
              </div>
              <div className="p-2 border-t border-[#2a2a2a] bg-[#222]">
                 <button className="w-full flex items-center justify-center gap-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-[#333] rounded transition-colors">
                    <Plus className="w-3 h-3" /> Add
                 </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
