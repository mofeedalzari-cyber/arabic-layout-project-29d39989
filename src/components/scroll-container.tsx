import { forwardRef, useEffect, useImperativeHandle, useRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * ScrollContainer — horizontal scroll only container with hidden scrollbars.
 * Vertical scroll passes through to the page/parent container.
 */
export interface ScrollContainerProps extends HTMLAttributes<HTMLDivElement> {}

export const ScrollContainer = forwardRef<HTMLDivElement, ScrollContainerProps>(
  function ScrollContainer({ className, children, ...rest }, ref) {
    const innerRef = useRef<HTMLDivElement | null>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLDivElement);

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;

      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;
      let startY = 0;

      const isInteractive = (t: EventTarget | null) => {
        const n = t as HTMLElement | null;
        return !!n?.closest?.(
          'button, a, input, textarea, select, label, [role="button"], [role="checkbox"], [data-no-drag]',
        );
      };

      const onPointerDown = (e: PointerEvent) => {
        if (isInteractive(e.target)) return;
        
        isDown = true;
        startX = e.clientX;
        startY = e.clientY;
        scrollLeft = el.scrollLeft;
        el.setPointerCapture?.(e.pointerId);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!isDown) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        // إذا كانت الحركة صغيرة جداً، نتجاهلها
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        
        // إذا كانت الحركة عمودية (فوق/تحت) أكثر من الأفقية
        if (Math.abs(dy) > Math.abs(dx)) {
          // نحرر القبضة للسماح للصفحة بالتمرير العمودي
          if (isDown) {
            try {
              el.releasePointerCapture?.(e.pointerId);
            } catch {}
            isDown = false;
          }
          return;
        }
        
        // حركة أفقية - نمرر الجدول يمين/يسار
        e.preventDefault();
        el.scrollLeft = scrollLeft - dx;
      };

      const onPointerUp = (e: PointerEvent) => {
        if (isDown) {
          try {
            el.releasePointerCapture?.(e.pointerId);
          } catch {}
        }
        isDown = false;
      };

      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);
      el.addEventListener("pointercancel", onPointerUp);
      
      return () => {
        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", onPointerUp);
        el.removeEventListener("pointercancel", onPointerUp);
      };
    }, []);

    return (
      <div ref={innerRef} className={cn("scroll-container", className)} {...rest}>
        {children}
      </div>
    );
  },
);
