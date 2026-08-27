// توليد صوت لمس خفيف عند التنقل/الضغط في التطبيق باستخدام Web Audio API.
// لا يحتاج ملفات صوتية خارجية؛ يعمل مباشرة في المتصفح وفي تطبيق Capacitor.

const SOUND_KEY = "karti_touch_sound_enabled";

let audioCtx: AudioContext | null = null;
let enabled = true;
let resumeAttempts = 0;

function readEnabled() {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(SOUND_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

function ensureAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export function isTouchSoundEnabled(): boolean {
  return enabled;
}

export function setTouchSoundEnabled(value: boolean) {
  enabled = value;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SOUND_KEY, String(value));
    } catch {
      /* ignore */
    }
  }
}

export function toggleTouchSound(): boolean {
  setTouchSoundEnabled(!enabled);
  return enabled;
}

/**
 * تشغيل صوت لمس خفيف (نقرة رقمية قصيرة). يتم استدعاؤه تلقائياً عند initTouchSound()
 * عند حدوث أي تنقل داخل التطبيق، ويمكن استدعاؤه يدوياً عند الضغط على أزرار مهمة.
 */
export function playTouchSound() {
  if (!enabled) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // نحاول تشغيل السياق إذا كان معلقاً (مطلوب في بعض المتصفحات/الجوال)
  if (ctx.state === "suspended") {
    if (resumeAttempts < 10) {
      resumeAttempts++;
      void ctx.resume();
    }
    return; // لا نحاول العزف حتى يستأنف؛ الصوت القادم سيعمل
  }

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // نقرة ناعمة قصيرة جداً وغير مزعجة
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(330, now + 0.05);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.03, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.07);
  } catch {
    // ignore audio errors
  }
}


/**
 * تفعيل صوت اللمس التلقائي عند التنقل بين الصفحات.
 * يستمع لأحداث resolved في الراوتر ويعزف صوتاً خفيفاً.
 */
export function initTouchSound(router: {
  subscribe: (event: "onResolved", cb: () => void) => () => void;
}) {
  enabled = readEnabled();

  // محاولة أولية لإعداد AudioContext بعد تفاعل المستخدم (يساعد في السماح بالتشغيل)
  const unlockAudio = () => {
    const ctx = ensureAudioContext();
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("touchstart", unlockAudio, { passive: true, once: true });
    window.addEventListener("click", unlockAudio, { passive: true, once: true });
  }

  return router.subscribe("onResolved", () => {
    playTouchSound();
  });
}
