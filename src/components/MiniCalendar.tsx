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
  const { createNewLesson, vaultPath } = useAppStore();

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

  return (
    <div className="tp-mini-calendar px-2 pb-3">
      <div
        className="rounded-lg p-4"
        style={{
          background: "var(--tp-bg-2)",
          border: "1px solid var(--tp-b-1)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-[15px] font-semibold tracking-[-0.01em]"
            style={{ color: "var(--tp-t-1)" }}
          >
            {format(currentDate, "MMMM yyyy")}
          </span>
          <div className="flex gap-1">
            <button
              onClick={prevMonth}
              className="h-7 w-7 inline-flex items-center justify-center rounded transition-colors hover:[background:var(--tp-bg-4)] hover:[color:var(--tp-t-1)]"
              style={{ color: "var(--tp-t-3)" }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextMonth}
              className="h-7 w-7 inline-flex items-center justify-center rounded transition-colors hover:[background:var(--tp-bg-4)] hover:[color:var(--tp-t-1)]"
              style={{ color: "var(--tp-t-3)" }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-[3px] text-center mb-1.5">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
            <div
              key={day}
              className="text-[11px] font-semibold uppercase tracking-[0.04em] py-1"
              style={{ color: "var(--tp-t-4)" }}
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-[3px] text-xs">
          {daysInMonth.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isCurrentDay = isToday(day);

            let color = "var(--tp-t-2)";
            if (!isCurrentMonth) color = "var(--tp-t-4)";
            if (isSelected) color = "#fff";

            return (
              <button
                key={format(day, "yyyy-MM-dd")}
                onClick={() => setSelectedDate(day)}
                className="aspect-square inline-flex items-center justify-center rounded-[6px] border box-border tabular-nums transition-colors text-[13px]"
                style={{
                  color,
                  borderColor:
                    isCurrentDay && !isSelected ? "var(--tp-accent)" : "transparent",
                  background: isSelected ? "var(--tp-accent)" : "transparent",
                  fontWeight: isSelected ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "var(--tp-bg-4)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--tp-t-1)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    (e.currentTarget as HTMLButtonElement).style.color = color;
                  }
                }}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>

        {vaultPath && (
          <button
            onClick={handleCreateLessonForDate}
            className="mt-3 w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors hover:[background:var(--tp-bg-4)] hover:[color:var(--tp-t-1)]"
            style={{
              background: "var(--tp-bg-3)",
              border: "1px solid var(--tp-b-2)",
              color: "var(--tp-t-2)",
            }}
          >
            <Plus className="w-4 h-4" />
            Plan for {format(selectedDate, "MMM d")}
          </button>
        )}
      </div>
    </div>
  );
}
