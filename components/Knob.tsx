
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
  const [currentValue, setCurrentValue] = useState(value);
  const [startY, setStartY] = useState(0);
  const [startValue, setStartValue] = useState(0);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setStartY(e.clientY);
    setStartValue(currentValue);
    e.preventDefault(); // Prevent text selection
    document.body.style.cursor = 'ns-resize';
  }, [currentValue]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const deltaY = startY - e.clientY;
    let newValue = startValue + (deltaY / sensitivity) * (max - min);
    newValue = Math.max(min, Math.min(max, newValue));
    
    if (step) {
      newValue = Math.round(newValue / step) * step;
    }
    
    // Ensure precision for small steps
    const precision = step.toString().split('.')[1]?.length || 2;
    newValue = parseFloat(newValue.toFixed(precision));


    setCurrentValue(newValue);
    onChange(newValue);
  }, [isDragging, startY, startValue, min, max, step, onChange, sensitivity]);
  
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      document.body.style.cursor = 'default';
    }
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      // Use window event listeners for mouse move and up to allow dragging outside the knob
      // Type assertion needed as addEventListener/removeEventListener on window are generic
      const upHandler = handleMouseUp as unknown as EventListener;
      const moveHandler = handleMouseMove as unknown as EventListener;
      
      window.addEventListener('mousemove', moveHandler);
      window.addEventListener('mouseup', upHandler);
      return () => {
        window.removeEventListener('mousemove', moveHandler);
        window.removeEventListener('mouseup', upHandler);
        document.body.style.cursor = 'default';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);


  const percentage = ((currentValue - min) / (max - min)) * 100;
  const rotation = (percentage / 100) * 270 - 135; // -135 to 135 degrees

  const formattedValue = displayFormatter ? displayFormatter(currentValue) : currentValue.toFixed(step < 0.1 ? 2 : (step < 1 ? 1 : 0));

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
        aria-valuenow={currentValue}
        aria-label={label}
        tabIndex={0} // Make it focusable for accessibility (basic)
        onKeyDown={(e) => { // Basic keyboard control
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            onChange(Math.min(max, currentValue + step));
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            onChange(Math.max(min, currentValue - step));
          }
        }}
      >
        <div
          className="absolute top-1/2 left-1/2 w-1 h-1/2 bg-gray-300 origin-bottom transform -translate-x-1/2 -translate-y-full"
          style={{
            height: `${size * 0.4}px`,
            transform: `translateX(-50%) translateY(-100%) rotate(${rotation}deg)`,
            transformOrigin: '50% 100%',
            backgroundColor: '#cbd5e1' // slate-300
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
