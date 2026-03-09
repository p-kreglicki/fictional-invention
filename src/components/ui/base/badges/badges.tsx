'use client';

import type { ReactNode } from 'react';
import type { BadgeColors, BadgeTypes, BadgeTypeToColorMap, Sizes } from './badge-types';
import { cx } from '@/utils/cx';
import { badgeTypes } from './badge-types';

const filledColors: Record<BadgeColors, { root: string }> = {
  'gray': { root: 'bg-utility-gray-50 text-utility-gray-700 ring-utility-gray-200' },
  'brand': { root: 'bg-utility-brand-50 text-utility-brand-700 ring-utility-brand-200' },
  'error': { root: 'bg-utility-error-50 text-utility-error-700 ring-utility-error-200' },
  'warning': { root: 'bg-utility-warning-50 text-utility-warning-700 ring-utility-warning-200' },
  'success': { root: 'bg-utility-success-50 text-utility-success-700 ring-utility-success-200' },
  'gray-blue': { root: 'bg-utility-gray-blue-50 text-utility-gray-blue-700 ring-utility-gray-blue-200' },
  'blue-light': { root: 'bg-utility-blue-light-50 text-utility-blue-light-700 ring-utility-blue-light-200' },
  'blue': { root: 'bg-utility-blue-50 text-utility-blue-700 ring-utility-blue-200' },
  'indigo': { root: 'bg-utility-indigo-50 text-utility-indigo-700 ring-utility-indigo-200' },
  'purple': { root: 'bg-utility-purple-50 text-utility-purple-700 ring-utility-purple-200' },
  'pink': { root: 'bg-utility-pink-50 text-utility-pink-700 ring-utility-pink-200' },
  'orange': { root: 'bg-utility-orange-50 text-utility-orange-700 ring-utility-orange-200' },
};

const commonStyles = {
  [badgeTypes.pillColor]: 'size-max flex items-center whitespace-nowrap rounded-full ring-1 ring-inset',
  [badgeTypes.badgeColor]: 'size-max flex items-center whitespace-nowrap rounded-md ring-1 ring-inset',
  [badgeTypes.badgeModern]: 'size-max flex items-center whitespace-nowrap rounded-md ring-1 ring-inset bg-primary text-secondary ring-primary shadow-xs',
} as const;

const sizeStyles = {
  [badgeTypes.pillColor]: {
    sm: 'px-2 py-0.5 text-xs font-medium',
    md: 'px-2.5 py-0.5 text-sm font-medium',
    lg: 'px-3 py-1 text-sm font-medium',
  },
  [badgeTypes.badgeColor]: {
    sm: 'px-1.5 py-0.5 text-xs font-medium',
    md: 'px-2 py-0.5 text-sm font-medium',
    lg: 'rounded-lg px-2.5 py-1 text-sm font-medium',
  },
  [badgeTypes.badgeModern]: {
    sm: 'px-1.5 py-0.5 text-xs font-medium',
    md: 'px-2 py-0.5 text-sm font-medium',
    lg: 'rounded-lg px-2.5 py-1 text-sm font-medium',
  },
} as const;

type BadgeProps<T extends BadgeTypes> = {
  children: ReactNode;
  className?: string;
  color?: BadgeTypeToColorMap<typeof commonStyles>[T];
  size?: Sizes;
  type?: T;
};

export const Badge = <T extends BadgeTypes>(props: BadgeProps<T>) => {
  const type = props.type ?? 'pill-color';
  const size = props.size ?? 'md';
  const color = props.color ?? 'gray';

  return (
    <span className={cx(commonStyles[type], sizeStyles[type][size], filledColors[color as BadgeColors]?.root, props.className)}>
      {props.children}
    </span>
  );
};
