'use client';

import type { FC } from 'react';
import * as React from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { cx } from '@/utils/cx';
import { isReactComponent } from '@/utils/is-react-component';
import { buttonStylesConfig } from './button-styles';

export type ButtonColor = keyof typeof buttonStylesConfig.colors;
export type ButtonSize = keyof typeof buttonStylesConfig.sizes;

type CommonProps = {
  color?: ButtonColor;
  iconLeading?: FC<{ className?: string }> | React.ReactNode;
  iconTrailing?: FC<{ className?: string }> | React.ReactNode;
  isLoading?: boolean;
  noTextPadding?: boolean;
  showTextWhileLoading?: boolean;
  size?: ButtonSize;
};

export type ButtonProps = CommonProps & Omit<React.ComponentProps<typeof AriaButton>, 'children' | 'className'> & {
  children?: React.ReactNode;
  className?: string;
};

export const Button = (props: ButtonProps) => {
  const {
    children,
    className,
    color = 'primary',
    iconLeading: IconLeading,
    iconTrailing: IconTrailing,
    isLoading,
    noTextPadding,
    showTextWhileLoading,
    size = 'sm',
    ...buttonProps
  } = props;

  const isIconOnly = (IconLeading || IconTrailing) && !children;

  return (
    <AriaButton
      {...buttonProps}
      className={cx(
        buttonStylesConfig.common.root,
        buttonStylesConfig.sizes[size].root,
        buttonStylesConfig.colors[color].root,
        isLoading && (showTextWhileLoading ? '[&>*:not([data-icon=loading]):not([data-text])]:hidden' : '[&>*:not([data-icon=loading])]:invisible'),
        className,
      )}
      data-icon-only={isIconOnly ? true : undefined}
      data-loading={isLoading ? true : undefined}
      isPending={isLoading}
    >
      {React.isValidElement(IconLeading) && IconLeading}
      {isReactComponent(IconLeading) && <IconLeading className={buttonStylesConfig.common.icon} data-icon="leading" />}

      {isLoading && (
        <svg
          fill="none"
          viewBox="0 0 20 20"
          className={cx(buttonStylesConfig.common.icon, !showTextWhileLoading && 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2')}
          data-icon="loading"
        >
          <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
          <circle
            className="origin-center animate-spin stroke-current"
            cx="10"
            cy="10"
            r="8"
            fill="none"
            strokeDasharray="12.5 50"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      )}

      {children && (
        <span className={cx('transition-inherit-all', !noTextPadding && 'px-0.5')} data-text>
          {children}
        </span>
      )}

      {React.isValidElement(IconTrailing) && IconTrailing}
      {isReactComponent(IconTrailing) && <IconTrailing className={buttonStylesConfig.common.icon} data-icon="trailing" />}
    </AriaButton>
  );
};
