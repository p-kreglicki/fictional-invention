export type Sizes = 'sm' | 'md' | 'lg';

export type BadgeColors
  = | 'gray'
    | 'brand'
    | 'error'
    | 'warning'
    | 'success'
    | 'gray-blue'
    | 'blue-light'
    | 'blue'
    | 'indigo'
    | 'purple'
    | 'pink'
    | 'orange';

export const badgeTypes = {
  pillColor: 'pill-color',
  badgeColor: 'badge-color',
  badgeModern: 'badge-modern',
} as const;

export type BadgeTypes = typeof badgeTypes[keyof typeof badgeTypes];

export type BadgeTypeToColorMap<T extends Record<string, unknown>> = {
  [K in keyof T]: K extends 'badge-modern' ? 'gray' : BadgeColors;
};
