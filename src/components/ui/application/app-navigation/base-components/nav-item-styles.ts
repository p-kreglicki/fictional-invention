import { sortCx } from '@/utils/cx';

export const navItemClassNames = sortCx({
  root: 'group relative flex w-full cursor-pointer items-center rounded-md bg-primary outline-focus-ring transition duration-100 ease-linear select-none hover:bg-primary_hover focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2',
  rootSelected: 'bg-active hover:bg-secondary_hover',
  iconSlot: 'mr-2 flex size-5 shrink-0 items-center justify-start',
  icon: 'size-5 shrink-0 text-fg-quaternary transition-inherit-all',
  label: 'flex-1 text-md font-semibold text-secondary transition-inherit-all group-hover:text-secondary_hover',
  externalIcon: 'size-4 stroke-[2.5px] text-fg-quaternary',
});
