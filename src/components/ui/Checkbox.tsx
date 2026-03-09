import { Checkbox as UntitledCheckbox } from '@/components/untitled/base/checkbox/checkbox';

/**
 * Render a shared checkbox backed by Untitled UI.
 * @param props - Checkbox props forwarded to the Untitled UI checkbox.
 * @returns A styled checkbox field.
 */
export function Checkbox(props: React.ComponentProps<typeof UntitledCheckbox>) {
  return <UntitledCheckbox {...props} size={props.size ?? 'md'} />;
}
