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
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useAppStore } from "../store";
import { useTranslation } from "../i18n/useTranslation";

export function MiniCalendar() {
  const { t, language } = useTranslation();
  const dateLocale = language === "de" ? de : undefined;
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
            {format(currentDate, "MMMM yyyy", { locale: dateLocale })}
          </span>
          <div className="flex gap-1">
            <button
              onClick={prevMonth}
              className="tp-mini-cal-nav h-7 w-7 inline-flex items-center justify-center rounded"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextMonth}
              className="tp-mini-cal-nav h-7 w-7 inline-flex items-center justify-center rounded"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-[3px] text-center mb-1.5">
          {Array.from({ length: 7 }, (_, i) => t(`calendar.dayHeader${i}`)).map((day) => (
            <div
              key={day}
              className="text-[11px] font-semibold uppercase tracking-[0.04em] py-1"
              style={{ color: "var(--tp-t-4)" }}
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-[3px] text-[12.5px]">
          {daysInMonth.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isCurrentDay = isToday(day);

            let color = "var(--tp-t-2)";
            if (!isCurrentMonth) color = "var(--tp-t-4)";
            if (isSelected) color = "var(--tp-accent)";

            return (
              <button
                key={format(day, "yyyy-MM-dd")}
                onClick={() => setSelectedDate(day)}
                aria-label={format(day, "PPPP", { locale: dateLocale })}
                aria-current={isCurrentDay ? "date" : undefined}
                className={`box-border inline-flex aspect-square items-center justify-center rounded-[var(--tp-radius-control)] border tabular-nums transition-colors ${
                  isSelected
                    ? ""
                    : "hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
                }`}
                style={{
                  color,
                  borderColor: isSelected
                    ? "var(--tp-accent)"
                    : isCurrentDay
                      ? "var(--tp-b-3)"
                      : "transparent",
                  background: isSelected
                    ? "var(--tp-accent-tint)"
                    : "transparent",
                  fontWeight: isSelected ? 600 : 400,
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
            className="tp-mini-cal-create mt-3 w-full h-7 inline-flex items-center justify-center gap-1.5 rounded-md text-[12px] font-medium"
          >
            <Plus className="w-4 h-4" />
            {t("calendar.createLesson", { date: format(selectedDate, "MMM d", { locale: dateLocale }) })}
          </button>
        )}
      </div>
    </div>
  );
}
