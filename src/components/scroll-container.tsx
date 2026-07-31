import { forwardRef, useEffect, useImperativeHandle, useRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * ScrollContainer — smooth 2D scroll container with hidden scrollbars and
 * drag-to-scroll on both pointer (desktop) and touch (mobile momentum) devices.
 *
 * - Hides native scrollbars in all browsers.
 * - Vertical + horizontal + diagonal scroll.
 * - Drag from anywhere; clicks on buttons/inputs still work (drag activates
 *   only after a small movement threshold).
 * - Preserves native touch momentum scrolling on iOS/Android.
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
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let scrollLeft = 0;
      let scrollTop = 0;
      const THRESHOLD = 6; // px before we treat as drag

      const isInteractive = (t: EventTarget | null) => {
        const n = t as HTMLElement | null;
        return !!n?.closest?.(
          'button, a, input, textarea, select, label, [role="button"], [role="checkbox"], [data-no-drag]',
        );
      };

      const onPointerDown = (e: PointerEvent) => {
        // السماح باللمس (touch) مع الاحتفاظ بالتمرير العمودي للصفحة
        if (e.button !== 0 && e.pointerType !== "touch") return;
        if (isInteractive(e.target)) return;
        isDown = true;
        dragging = false;
        startX = e.clientX;
        startY = e.clientY;
        scrollLeft = el.scrollLeft;
        scrollTop = el.scrollTop;
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!isDown) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) < THRESHOLD) return;
        if (!dragging) {
          dragging = true;
          el.setPointerCapture?.(e.pointerId);
          el.classList.add("is-dragging");
        }
        e.preventDefault();
        // RTL-aware: scrollLeft direction already handled by browser
        el.scrollLeft = scrollLeft - dx;
        // ❌ لا نغير scrollTop ليظل التمرير العمودي للصفحة
        // el.scrollTop = scrollTop - dy;
      };

      const stop = (e: PointerEvent) => {
        if (dragging) {
          try {
            el.releasePointerCapture?.(e.pointerId);
          } catch {}
        }
        isDown = false;
        dragging = false;
        el.classList.remove("is-dragging");
      };

      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", stop);
      el.addEventListener("pointercancel", stop);
      el.addEventListener("pointerleave", stop);
      return () => {
        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", stop);
        el.removeEventListener("pointercancel", stop);
        el.removeEventListener("pointerleave", stop);
      };
    }, []);

    return (
      <div ref={innerRef} className={cn("scroll-container", className)} {...rest}>
        {children}
      </div>
    );
  },
);
