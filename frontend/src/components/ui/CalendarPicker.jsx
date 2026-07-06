import React, { useState } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';

export function CalendarPicker({ selectedDate, onSelectDate }) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date());

  const renderHeader = () => {
    return (
      <div className="flex justify-between items-center mb-2">
        <button type="button" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
          <ChevronLeft size={18} className="text-slate-600 dark:text-slate-400" />
        </button>
        <span className="text-sm font-semibold capitalize text-slate-800 dark:text-slate-200">
          {format(currentMonth, 'MMMM yyyy', { locale: es })}
        </span>
        <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
          <ChevronRight size={18} className="text-slate-600 dark:text-slate-400" />
        </button>
      </div>
    );
  };

  const renderDays = () => {
    const days = [];
    const startDate = startOfWeek(currentMonth, { weekStartsOn: 1 });
    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 capitalize w-8">
          {format(addDays(startDate, i), 'EEEEEE', { locale: es })}
        </div>
      );
    }
    return <div className="flex justify-between mb-2">{days}</div>;
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = '';
    const selDateObj = selectedDate ? new Date(selectedDate + 'T12:00:00') : null;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, 'd');
        const cloneDay = day;
        const dateStr = format(cloneDay, 'yyyy-MM-dd');
        const isSelected = selDateObj && isSameDay(cloneDay, selDateObj);
        
        days.push(
          <button
            type="button"
            key={dateStr}
            onClick={() => onSelectDate(dateStr)}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-full text-sm transition-all",
              !isSameMonth(day, monthStart) ? "text-slate-300 dark:text-slate-700" : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
              isSelected ? "bg-emerald-500 text-white hover:bg-emerald-600 font-bold dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:text-white" : ""
            )}
          >
            {formattedDate}
          </button>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="flex justify-between mb-1" key={day}>
          {days}
        </div>
      );
      days = [];
    }
    return <div>{rows}</div>;
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-sm">
      {renderHeader()}
      {renderDays()}
      {renderCells()}
    </div>
  );
}
