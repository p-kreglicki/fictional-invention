'use client';

import type { NavItemDividerType, NavItemType } from '../config';
import { useState } from 'react';
import { cx } from '@/utils/cx';
import { NavItemBase } from './nav-item';

type NavListProps = {
  activeUrl?: string;
  className?: string;
  items: (NavItemType | NavItemDividerType)[];
};

export const NavList = (props: NavListProps) => {
  const activeItem = props.items.find(item => item.href === props.activeUrl || item.items?.some(subItem => subItem.href === props.activeUrl));
  const [currentItem, setCurrentItem] = useState(activeItem);

  return (
    <ul className={cx('mt-4 flex flex-col px-2 lg:px-4', props.className)}>
      {props.items.map((item) => {
        if ('divider' in item && item.divider) {
          return (
            <li key={`divider-${item.label ?? item.href ?? 'section'}`} className="w-full px-0.5 py-2">
              <hr className="h-px w-full border-none bg-border-secondary" />
            </li>
          );
        }

        if (item.items?.length) {
          return (
            <details
              key={item.label}
              className="appearance-none py-0.5"
              onToggle={() => {
                setCurrentItem(item);
              }}
              open={activeItem?.href === item.href}
            >
              <NavItemBase badge={item.badge} href={item.href} icon={'icon' in item ? item.icon : undefined} type="collapsible">
                {item.label}
              </NavItemBase>

              <dd>
                <ul className="py-0.5">
                  {item.items.map(childItem => (
                    <li key={childItem.label} className="py-0.5">
                      <NavItemBase badge={childItem.badge} current={props.activeUrl === childItem.href} href={childItem.href} type="collapsible-child">
                        {childItem.label}
                      </NavItemBase>
                    </li>
                  ))}
                </ul>
              </dd>
            </details>
          );
        }

        return (
          <li key={item.label} className="py-0.5">
            <NavItemBase
              badge={item.badge}
              current={currentItem?.href === item.href || props.activeUrl === item.href}
              href={item.href}
              icon={'icon' in item ? item.icon : undefined}
              onClick={() => setCurrentItem(item)}
              type="link"
            >
              {item.label}
            </NavItemBase>
          </li>
        );
      })}
    </ul>
  );
};
