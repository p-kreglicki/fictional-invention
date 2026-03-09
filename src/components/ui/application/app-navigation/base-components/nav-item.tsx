'use client';

import type { FC, HTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import { ChevronDown, Share04 } from '@untitledui/icons';
import { Badge } from '@/components/ui/base/badges/badges';
import { Link } from '@/libs/I18nNavigation';
import { cx } from '@/utils/cx';
import { navItemClassNames } from './nav-item-styles';

type NavItemBaseProps = {
  badge?: ReactNode;
  children?: ReactNode;
  current?: boolean;
  href?: string;
  icon?: FC<HTMLAttributes<HTMLOrSVGElement>>;
  onClick?: MouseEventHandler;
  truncate?: boolean;
  type: 'link' | 'collapsible' | 'collapsible-child';
};

export const NavItemBase = (props: NavItemBaseProps) => {
  const iconElement = props.icon
    ? (
        <span className={navItemClassNames.iconSlot}>
          <props.icon aria-hidden="true" className={navItemClassNames.icon} />
        </span>
      )
    : null;
  const badgeElement
    = props.badge && (typeof props.badge === 'string' || typeof props.badge === 'number')
      ? (
          <Badge className="ml-3" color="gray" size="sm" type="pill-color">
            {props.badge}
          </Badge>
        )
      : props.badge;

  const labelElement = (
    <span
      className={cx(
        navItemClassNames.label,
        props.truncate !== false && 'truncate',
        props.current && 'text-secondary_hover',
      )}
    >
      {props.children}
    </span>
  );

  const isExternal = props.href && props.href.startsWith('http');
  const externalIcon = isExternal ? <Share04 className={navItemClassNames.externalIcon} /> : null;

  if (props.type === 'collapsible') {
    return (
      <summary
        className={cx('px-3 py-2', navItemClassNames.root, props.current && navItemClassNames.rootSelected)}
        onClick={props.onClick}
      >
        {iconElement}
        {labelElement}
        {badgeElement}
        <ChevronDown aria-hidden="true" className="ml-3 size-4 shrink-0 stroke-[2.5px] text-fg-quaternary in-open:-scale-y-100" />
      </summary>
    );
  }

  if (props.type === 'collapsible-child') {
    if (isExternal) {
      return (
        <a
          aria-current={props.current ? 'page' : undefined}
          className={cx('py-2 pr-3 pl-10', navItemClassNames.root, props.current && navItemClassNames.rootSelected)}
          href={props.href!}
          onClick={props.onClick}
          rel="noopener noreferrer"
          target="_blank"
        >
          {labelElement}
          {externalIcon}
          {badgeElement}
        </a>
      );
    }

    return (
      <Link
        aria-current={props.current ? 'page' : undefined}
        className={cx('py-2 pr-3 pl-10', navItemClassNames.root, props.current && navItemClassNames.rootSelected)}
        href={props.href!}
        onClick={props.onClick}
      >
        {labelElement}
        {externalIcon}
        {badgeElement}
      </Link>
    );
  }

  if (isExternal) {
    return (
      <a
        aria-current={props.current ? 'page' : undefined}
        className={cx('px-3 py-2', navItemClassNames.root, props.current && navItemClassNames.rootSelected)}
        href={props.href!}
        onClick={props.onClick}
        rel="noopener noreferrer"
        target="_blank"
      >
        {iconElement}
        {labelElement}
        {externalIcon}
        {badgeElement}
      </a>
    );
  }

  return (
    <Link
      aria-current={props.current ? 'page' : undefined}
      className={cx('px-3 py-2', navItemClassNames.root, props.current && navItemClassNames.rootSelected)}
      href={props.href!}
      onClick={props.onClick}
    >
      {iconElement}
      {labelElement}
      {externalIcon}
      {badgeElement}
    </Link>
  );
};
