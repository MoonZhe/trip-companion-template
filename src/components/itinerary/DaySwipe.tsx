'use client';
import { useRef, useState, type Ref } from 'react';
import { motion, useMotionValue, useMotionValueEvent, useTransform, type PanInfo } from 'motion/react';
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import type { Day } from '@/lib/sheet/types';
import { cityOf } from '@/lib/trip/city';
import { shortDate } from '@/lib/format';
import { haptic } from '@/lib/ui/haptic';

/** How far (share of the screen) or how fast (px/s) a swipe has to go to change day. */
const COMMIT_SHARE = 0.22;
const COMMIT_VELOCITY = 450;
const SPRING = { type: 'spring', stiffness: 320, damping: 34, mass: 0.9, restDelta: 0.5, restSpeed: 10 } as const;

const screenW = () => (typeof window === 'undefined' ? 400 : window.innerWidth);

/**
 * Days slide like pages: the outgoing day leaves one way while the next comes in from the other.
 * Used with AnimatePresence `custom={dir}` (1 = forward, -1 = back).
 */
export const dayPageVariants = {
  enter: ({ dir, reduce }: { dir: number; reduce: boolean }) =>
    reduce || !dir ? { opacity: 0 } : { x: dir * screenW(), opacity: 0.6, scale: 0.94 },
  center: { x: 0, opacity: 1, scale: 1 },
  exit: ({ dir, reduce }: { dir: number; reduce: boolean }) =>
    reduce || !dir ? { opacity: 0 } : { x: -dir * screenW(), opacity: 0.6, scale: 0.94 },
};

/**
 * One day's page. It follows the finger left and right, shows the neighbouring day peeking in at the
 * edge, gives a haptic tick once the swipe is far enough to count, and springs back if not.
 */
export function DayPage({
  ref,
  custom,
  prev,
  next,
  draggable,
  onSwipe,
  children,
}: {
  ref?: Ref<HTMLDivElement>;
  custom: { dir: number; reduce: boolean };
  prev?: Day;
  next?: Day;
  draggable: boolean;
  onSwipe: (step: 1 | -1) => void;
  children: React.ReactNode;
}) {
  const x = useMotionValue(0);
  const [armed, setArmed] = useState<0 | 1 | -1>(0);
  const dragged = useRef(false);
  const w = screenW();

  // Track whether letting go now would change day, and tick once when it starts to.
  useMotionValueEvent(x, 'change', (v) => {
    const a = v < -w * COMMIT_SHARE && next ? 1 : v > w * COMMIT_SHARE && prev ? -1 : 0;
    if (a !== armed) {
      if (a) haptic();
      setArmed(a);
    }
  });

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    const far = Math.abs(offset.x) > w * COMMIT_SHARE;
    const fast = Math.abs(velocity.x) > COMMIT_VELOCITY && Math.abs(offset.x) > 24;
    if (far || fast) {
      if (offset.x < 0 && next) onSwipe(1);
      else if (offset.x > 0 && prev) onSwipe(-1);
    }
    setArmed(0);
    // Let the click that ends a drag fall through without opening a stop.
    setTimeout(() => (dragged.current = false), 0);
  };

  return (
    <motion.div
      ref={ref}
      custom={custom}
      variants={dayPageVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ x: SPRING, scale: SPRING, opacity: { duration: 0.2 } }}
      style={{ x, touchAction: 'pan-y' }}
      drag={draggable ? 'x' : false}
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: next ? 0.9 : 0.12, right: prev ? 0.9 : 0.12 }}
      dragTransition={{ bounceStiffness: 420, bounceDamping: 36 }}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={onDragEnd}
      onClickCapture={(e) => {
        if (dragged.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className="relative"
    >
      {prev && <Peek day={prev} side="left" x={x} w={w} armed={armed === -1} />}
      {next && <Peek day={next} side="right" x={x} w={w} armed={armed === 1} />}
      {children}
    </motion.div>
  );
}

/** The neighbouring day, waiting just off the edge of the page; it slides into view with the drag. */
function Peek({
  day,
  side,
  x,
  w,
  armed,
}: {
  day: Day;
  side: 'left' | 'right';
  x: ReturnType<typeof useMotionValue<number>>;
  w: number;
  armed: boolean;
}) {
  const s = side === 'right' ? -1 : 1;
  const opacity = useTransform(x, [s * 12, s * 90, s * w * 0.6, s * w], [0, 1, 1, 0]);
  const scale = useTransform(x, [0, s * w * COMMIT_SHARE], [0.85, 1]);
  const c = cityOf(day.city);
  const Arrow = side === 'right' ? ArrowRight : ArrowLeft;

  return (
    <motion.div
      aria-hidden
      style={{ opacity, scale, '--accent': c.accent } as never}
      className={`pointer-events-none absolute top-6 flex w-28 flex-col items-center gap-2 text-center ${
        side === 'right' ? 'left-[calc(100%+1rem)]' : 'right-[calc(100%+1rem)]'
      }`}
    >
      <motion.span
        animate={{ scale: armed ? 1.12 : 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        className={`grid size-12 place-items-center rounded-full border-2 transition-colors duration-200 ${
          armed ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-card text-ink-soft'
        }`}
      >
        <Arrow size={20} weight="bold" />
      </motion.span>
      <span className="text-sm leading-tight font-semibold text-ink">Day {day.day}</span>
      <span className="text-xs leading-tight text-ink-faint">
        {shortDate(day.isoDate)}
        <br />
        {c.name}
      </span>
    </motion.div>
  );
}
