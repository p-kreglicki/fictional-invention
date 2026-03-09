import type { FC, ReactNode } from 'react';

export type NavItemType = {
  badge?: ReactNode;
  href?: string;
  icon?: FC<{ className?: string }>;
  items?: { badge?: ReactNode; href: string; icon?: FC<{ className?: string }>; label: string }[];
  label: string;
};

export type NavItemDividerType = Omit<NavItemType, 'icon' | 'label'> & {
  divider: true;
  label?: string;
};
