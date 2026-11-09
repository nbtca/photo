'use client';

import { ReactNode, useLayoutEffect, useRef } from 'react';
import { useAppState } from '@/app/AppState';
import usePrefersReducedMotion from '@/utility/usePrefersReducedMotion';

export type AnimationType = 'none' | 'scale' | 'left' | 'right' | 'bottom';

export interface AnimationConfig {
  type?: AnimationType
  duration?: number
  staggerDelay?: number
  scaleOffset?: number
  distanceOffset?: number
}

interface Props extends AnimationConfig {
  className?: string
  classNameItem?: string
  items: ReactNode[]
  itemKeys?: string[]
  canStart?: boolean
  animateFromAppState?: boolean
  animateOnFirstLoadOnly?: boolean
  staggerOnFirstLoadOnly?: boolean
  onAnimationComplete?: () => void
}

function AnimateItems({
  className,
  classNameItem,
  items,
  itemKeys,
  canStart: _canStart,
  type = 'scale',
  duration = 0.6,
  staggerDelay = 0.1,
  scaleOffset = 0.9,
  distanceOffset = 20,
  animateFromAppState,
  animateOnFirstLoadOnly,
  staggerOnFirstLoadOnly,
  onAnimationComplete,
}: Props) {
  const {
    hasLoadedWithAnimations,
    nextPhotoAnimation,
    getNextPhotoAnimationId,
    clearNextPhotoAnimation,
  } = useAppState();

  const nextPhotoAnimationId = useRef<string>(undefined);

  const prefersReducedMotion = usePrefersReducedMotion();
  
  const nextPhotoAnimationInitial = useRef(nextPhotoAnimation);

  const shouldAnimate = type !== 'none' &&
    !prefersReducedMotion &&
    !(animateOnFirstLoadOnly && hasLoadedWithAnimations);
  const shouldStagger =
    !(staggerOnFirstLoadOnly && hasLoadedWithAnimations);

  const typeResolved = animateFromAppState
    ? (nextPhotoAnimationInitial.current?.type ?? type)
    : type;

  const durationResolved = animateFromAppState
    ? (nextPhotoAnimationInitial.current?.duration ?? duration)
    : duration;

  const hidden: Keyframe =
    (() => {
      switch (typeResolved) {
        case 'left': return {
          opacity: 0,
          transform: `translateX(${distanceOffset}px)`,
        };
        case 'right': return {
          opacity: 0,
          transform: `translateX(${-distanceOffset}px)`,
        };
        case 'bottom': return {
          opacity: 0,
          transform: `translateY(${distanceOffset}px)`,
        };
        default: return {
          opacity: 0,
          transform: `translateY(${distanceOffset}px) scale(${scaleOffset})`,
        };
      }})();

  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(new WeakSet<Element>());
  const hasMounted = useRef(false);
  // Whether to animate is settled when the items first appear; items added
  // later, such as the next page of photos, follow without a stagger.
  const shouldAnimateItems = useRef(shouldAnimate);

  useLayoutEffect(() => {
    const isMount = !hasMounted.current;
    hasMounted.current = true;
    const added = [...ref.current?.children ?? []]
      .filter(element => !seen.current.has(element));
    added.forEach(element => seen.current.add(element));
    if (isMount) {
      nextPhotoAnimationId.current = getNextPhotoAnimationId?.();
    }
    const animations = shouldAnimateItems.current
      ? added.map((element, index) => element.animate([hidden, {
        opacity: 1,
        transform: 'none',
      }], {
        duration: durationResolved * 1000,
        delay: isMount && shouldStagger ? index * staggerDelay * 1000 : 0,
        easing: 'ease-out',
        fill: 'backwards',
      }))
      : [];
    if (isMount) {
      Promise.all(animations.map(animation => animation.finished))
        .then(() => {
          if (animateFromAppState) {
            clearNextPhotoAnimation?.(nextPhotoAnimationId.current);
          }
          onAnimationComplete?.();
        })
        .catch(() => {});
    }
  });

  return (
    <div ref={ref} className={className}>
      {items.map((item, index) =>
        <div
          key={itemKeys ? itemKeys[index] : index}
          className={classNameItem}
        >
          {item}
        </div>)}
    </div>
  );
};

export default AnimateItems;
