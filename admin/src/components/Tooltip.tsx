import { useState, useRef, useEffect, useCallback } from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    updatePosition();
    const hide = () => setVisible(false);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [visible, updatePosition]);

  // Close on click outside
  useEffect(() => {
    if (!visible) return;
    function handleClick(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [visible]);

  return (
    <div className="relative inline-flex">
      <div
        ref={triggerRef}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible((v) => !v)}
      >
        {children}
      </div>

      {visible && (
        <div
          className="fixed z-[9999] -translate-x-1/2 -translate-y-full min-w-[200px] max-w-[320px]
                     bg-gray-900 text-white text-xs leading-relaxed rounded-lg px-3 py-2.5
                     shadow-lg pointer-events-none"
          style={{ top: coords.top, left: coords.left }}
        >
          {content}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0
                          border-l-[6px] border-l-transparent
                          border-r-[6px] border-r-transparent
                          border-t-[6px] border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

/** Small info icon that triggers tooltip on hover/click */
export function InfoTooltip({ content }: { content: string }) {
  return (
    <Tooltip content={content}>
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full
                        bg-black/10 text-current text-[10px] font-bold cursor-help
                        hover:bg-black/20 transition-colors select-none leading-none">
        i
      </span>
    </Tooltip>
  );
}
