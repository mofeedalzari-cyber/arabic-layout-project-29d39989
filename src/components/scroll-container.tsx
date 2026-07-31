import { forwardRef, useEffect, useImperativeHandle, useRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * ScrollContainer — smooth 2D scroll container with hidden scrollbars and
 * drag-to-scroll on both pointer (desktop) and touch (mobile) devices.
 *
 * - Hides native scrollbars in all browsers.
 * - Vertical + horizontal + diagonal scroll.
 * - Drag from anywhere; clicks on buttons/inputs still work (drag activates
 *   only after a small movement threshold).
 * - `dragTouch`: takes over touch gestures so the drag scrolls ONLY this
 *   container (with inertia) and never moves the rest of the page.
 */
export interface ScrollContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** Handle touch dragging manually so the page behind never scrolls. */
  dragTouch?: boolean;
}

export const ScrollContainer = forwardRef<HTMLDivElement, ScrollContainerProps>(
  function ScrollContainer({ className, children, dragTouch = false, style, ...rest }, ref) {
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
        // Only left mouse / pen; touch keeps native momentum scroll
        if (e.pointerType === "touch") return;
        if (e.button !== 0) return;
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
        el.scrollTop = scrollTop - dy;
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

      // ---- Touch: manual drag confined to this container ----
      let tStartX = 0;
      let tStartY = 0;
      let tScrollLeft = 0;
      let tScrollTop = 0;
      let tActive = false;
      let lastY = 0;
      let lastX = 0;
      let lastT = 0;
      let vy = 0;
      let vx = 0;
      let raf = 0;

      const onTouchStart = (e: TouchEvent) => {
        if (!dragTouch || e.touches.length !== 1) return;
        if (raf) cancelAnimationFrame(raf), (raf = 0);
        const t = e.touches[0];
        tActive = true;
        tStartX = lastX = t.clientX;
        tStartY = lastY = t.clientY;
        tScrollLeft = el.scrollLeft;
        tScrollTop = el.scrollTop;
        lastT = performance.now();
        vx = vy = 0;
      };

      const onTouchMove = (e: TouchEvent) => {
        if (!dragTouch || !tActive || e.touches.length !== 1) return;
        const t = e.touches[0];
        // Stop the page (and any ancestor) from scrolling.
        if (e.cancelable) e.preventDefault();
        el.scrollLeft = tScrollLeft - (t.clientX - tStartX);
        el.scrollTop = tScrollTop - (t.clientY - tStartY);
        const now = performance.now();
        const dt = now - lastT;
        if (dt > 0) {
          vy = (t.clientY - lastY) / dt;
          vx = (t.clientX - lastX) / dt;
        }
        lastT = now;
        lastX = t.clientX;
        lastY = t.clientY;
      };

      const onTouchEnd = () => {
        if (!dragTouch || !tActive) return;
        tActive = false;
        // Light inertia
        let velY = vy;
        let velX = vx;
        const step = () => {
          velY *= 0.94;
          velX *= 0.94;
          if (Math.abs(velY) < 0.02 && Math.abs(velX) < 0.02) {
            raf = 0;
            return;
          }
          el.scrollTop -= velY * 16;
          el.scrollLeft -= velX * 16;
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      };

      if (dragTouch) {
        el.addEventListener("touchstart", onTouchStart, { passive: true });
        el.addEventListener("touchmove", onTouchMove, { passive: false });
        el.addEventListener("touchend", onTouchEnd);
        el.addEventListener("touchcancel", onTouchEnd);
      }

      return () => {
        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", stop);
        el.removeEventListener("pointercancel", stop);
        el.removeEventListener("pointerleave", stop);
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
        el.removeEventListener("touchcancel", onTouchEnd);
        if (raf) cancelAnimationFrame(raf);
      };
    }, [dragTouch]);

    return (
      <div
        ref={innerRef}
        className={cn("scroll-container", className)}
        style={dragTouch ? { touchAction: "none", overscrollBehavior: "contain", ...style } : style}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
