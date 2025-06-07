import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MINIMOOG_LABEL_TEXT } from '../constants';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  size?: number; // diameter in pixels
  sensitivity?: number; // pixels per full range
  displayFormatter?: (value: number) => string;
}

const Knob: React.FC<KnobProps> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  size = 50,
  sensitivity = 150,
  displayFormatter,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const knobRef = useRef<HTMLDivElement>(null);
  
  // Use a ref to store values that change during the drag operation.
  // This avoids stale closures in the event handlers.
  const dragState = useRef({
    startY: 0,
    startValue: 0,
  });

  // These handlers are now stable and won't be recreated on every render,
  // preventing issues with event listener removal and addition.
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const deltaY = dragState.current.startY - e.clientY;
    let newValue = dragState.current.startValue + (deltaY / sensitivity) * (max - min);
    
    // Clamp the value to the min/max range
    newValue = Math.max(min, Math.min(max, newValue));

    // Apply the step value
    if (step) {
      newValue = Math.round(newValue / step) * step;
    }

    // Determine precision from the step to avoid floating point errors
    const precision = step.toString().includes('.')
      ? step.toString().split('.').pop()!.length
      : 0;
    
    newValue = parseFloat(newValue.toFixed(precision));

    onChange(newValue);
  }, [min, max, onChange, sensitivity, step]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Initialize the drag state using the current props and mouse position
    dragState.current.startY = e.clientY;
    dragState.current.startValue = value;
    setIsDragging(true); // This state change will trigger the useEffect below
  }, [value]);

  // This effect adds and removes the global event listeners based on the dragging state.
  useEffect(() => {
    if (isDragging) {
      document.body.style.cursor = 'ns-resize';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.body.style.cursor = 'default';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const percentage = ((value - min) / (max - min)) * 100;
  const rotation = (percentage / 100) * 270 - 135; // -135 to 135 degrees

  const formattedValue = displayFormatter ? displayFormatter(value) : value.toFixed(step < 0.1 ? 2 : (step < 1 ? 1 : 0));

  return (
    <div className="flex flex-col items-center space-y-1 knob-container relative" style={{ touchAction: 'none' }}>
      <div
        ref={knobRef}
        className="rounded-full bg-gray-600 border-2 border-gray-500 relative cursor-grab select-none"
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            onChange(Math.min(max, value + step));
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            onChange(Math.max(min, value - step));
          }
        }}
      >
        <div
          className="absolute top-1/2 left-1/2 w-1 h-1/2 bg-gray-300 origin-bottom transform -translate-x-1/2 -translate-y-full"
          style={{
            height: `${size * 0.4}px`,
            transform: `translateX(-50%) translateY(-100%) rotate(${rotation}deg)`,
            transformOrigin: '50% 100%',
            backgroundColor: '#cbd5e1'
          }}
        />
        <div 
            className="knob-value-display"
            style={{bottom: `-${size * 0.4}px`}}
        >
            {formattedValue}
        </div>
      </div>
      <label className={`${MINIMOOG_LABEL_TEXT} text-center`}>{label}</label>
    </div>
  );
};

export default Knob;