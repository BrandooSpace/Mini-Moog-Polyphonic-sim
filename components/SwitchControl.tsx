
import React from 'react';
import { MINIMOOG_LABEL_TEXT } from '../constants';

interface SwitchOption<T> {
  label: string;
  value: T;
}

interface SwitchControlProps<T> {
  label: string;
  options: SwitchOption<T>[];
  currentValue: T;
  onChange: (value: T) => void;
  type?: 'rocker' | 'rotary'; // Rotary not fully implemented, rocker is default
}

const SwitchControl = <T extends string | number,>({
  label,
  options,
  currentValue,
  onChange,
  type = 'rocker',
}: SwitchControlProps<T>): React.ReactElement => {
  if (type === 'rocker') {
    // A simple rocker switch style, good for 2-3 options
    return (
      <div className="flex flex-col items-center space-y-1">
        <div className="flex space-x-1 bg-gray-600 p-0.5 rounded-md shadow-inner">
          {options.map((option) => (
            <button
              key={option.label}
              onClick={() => onChange(option.value)}
              className={`px-2 py-1 text-xs rounded ${
                currentValue === option.value
                  ? 'bg-amber-400 text-slate-800 font-semibold shadow-md'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-500'
              } transition-colors duration-150`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className={`${MINIMOOG_LABEL_TEXT} text-center`}>{label}</label>
      </div>
    );
  }

  // Fallback or other switch types (e.g. rotary style) can be implemented here
  // For now, simple select for more options if not rocker
  return (
    <div className="flex flex-col items-center space-y-1">
       <label htmlFor={`${label}-select`} className={`${MINIMOOG_LABEL_TEXT} text-center`}>{label}</label>
      <select
        id={`${label}-select`}
        value={currentValue}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-gray-700 text-gray-200 border border-gray-600 rounded px-2 py-1 text-xs focus:ring-amber-500 focus:border-amber-500"
      >
        {options.map((option) => (
          <option key={option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SwitchControl;
