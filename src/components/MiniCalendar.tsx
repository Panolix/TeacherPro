import { useState } from "react";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useAppStore } from "../store";

export function MiniCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { createNewLesson, vaultPath, sidebarOpen } = useAppStore();

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate });

  const handleCreateLessonForDate = () => {
    if (vaultPath) {
      createNewLesson(selectedDate);
    }
  };

  if (!sidebarOpen) return null;

  return (
    <div className="p-4 border-b border-[#333333]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-200">
          {format(currentDate, "MMMM yyyy")}
        </span>
        <div className="flex gap-1">
          <button
            onClick={prevMonth}
            className="p-1 hover:bg-[#2d2d2d] rounded text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={nextMonth}
            className="p-1 hover:bg-[#2d2d2d] rounded text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
          <div key={day} className="text-gray-500 font-medium">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs">
        {daysInMonth.map((day, idx) => {
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isCurrentDay = isToday(day);

          return (
            <button
              key={idx}
              onClick={() => setSelectedDate(day)}
              className={`
                p-1 rounded-md transition-colors flex items-center justify-center
                ${!isCurrentMonth ? "text-gray-600" : "text-gray-300"}
                ${
                  isSelected
                    ? "text-white font-bold"
                    : "hover:bg-[#2d2d2d]"
                }
                ${isCurrentDay && !isSelected ? "border" : ""}
              `}
              style={
                isSelected
                  ? { backgroundColor: "var(--tp-accent)" }
                  : isCurrentDay
                    ? { borderColor: "var(--tp-accent)" }
                    : undefined
              }
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      {vaultPath && (
        <button
          onClick={handleCreateLessonForDate}
          className="mt-3 w-full flex items-center justify-center gap-2 py-1.5 px-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] border border-[#444] rounded-md text-xs text-gray-200 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Plan for {format(selectedDate, "MMM d")}
        </button>
      )}
    </div>
  );
}
