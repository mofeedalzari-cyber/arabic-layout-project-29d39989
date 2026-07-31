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

      // ---- Touch drag (finger drag scrolls this container in both axes) ----
      let tId: number | null = null;
      let tx = 0;
      let ty = 0;
      let tScrollLeft = 0;
      let tScrollTop = 0;
      let tDragging = false;
      let lastX = 0;
      let lastY = 0;
      let lastT = 0;
      let vx = 0;
      let vy = 0;
      let raf = 0;

      // nearest horizontally scrollable element (self or a descendant under finger)
      const hTarget = (from: EventTarget | null): HTMLElement => {
        let n = from as HTMLElement | null;
        while (n && n !== el.parentElement) {
          if (n.scrollWidth > n.clientWidth + 1) return n;
          n = n.parentElement;
        }
        return el;
      };
      let hEl: HTMLElement = el;

      const onTouchStart = (e: TouchEvent) => {
        if (!dragTouch || e.touches.length !== 1) return;
        cancelAnimationFrame(raf);
        const t = e.touches[0];
        tId = t.identifier;
        tDragging = false;
        tx = lastX = t.clientX;
        ty = lastY = t.clientY;
        lastT = performance.now();
        vx = vy = 0;
        hEl = hTarget(e.target);
        tScrollLeft = hEl.scrollLeft;
        tScrollTop = el.scrollTop;
      };

      const onTouchMove = (e: TouchEvent) => {
        if (!dragTouch || tId === null) return;
        const t = Array.from(e.touches).find((x) => x.identifier === tId);
        if (!t) return;
        const dx = t.clientX - tx;
        const dy = t.clientY - ty;
        if (!tDragging && Math.hypot(dx, dy) < THRESHOLD) return;
        tDragging = true;
        if (e.cancelable) e.preventDefault();
        hEl.scrollLeft = tScrollLeft - dx;
        el.scrollTop = tScrollTop - dy;
        const now = performance.now();
        const dt = Math.max(1, now - lastT);
        vx = (t.clientX - lastX) / dt;
        vy = (t.clientY - lastY) / dt;
        lastX = t.clientX;
        lastY = t.clientY;
        lastT = now;
      };

      const onTouchEnd = () => {
        if (!dragTouch || tId === null) return;
        tId = null;
        if (!tDragging) return;
        tDragging = false;
        // inertia
        let ivx = vx * 16;
        let ivy = vy * 16;
        const step = () => {
          ivx *= 0.94;
          ivy *= 0.94;
          if (Math.abs(ivx) < 0.2 && Math.abs(ivy) < 0.2) return;
          hEl.scrollLeft -= ivx;
          el.scrollTop -= ivy;
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
        cancelAnimationFrame(raf);
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
        el.removeEventListener("touchcancel", onTouchEnd);
      };
    }, [dragTouch]);


    return (
      <div
        ref={innerRef}
        className={cn("scroll-container", className)}
        style={
          dragTouch
            ? {
                // Native touch scrolling (smooth momentum, no jitter), confined
                // to this container so the page behind never moves.
                // `auto` (not "pan-x pan-y") — Android WebView ignores vertical
                // panning when both axes are listed explicitly.
                touchAction: "auto",
                overflowX: "auto",
                overflowY: "auto",
                overscrollBehavior: "contain",
                WebkitOverflowScrolling: "touch",
                ...style,
              }
            : style
        }
        {...rest}
      >
        {children}
      </div>
    );
  },
);

