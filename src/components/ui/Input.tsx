import { Input as UntitledInput } from '@/components/untitled/base/input/input';

type InputProps = Omit<React.ComponentProps<typeof UntitledInput>, 'value'> & {
  max?: number;
  min?: number;
  value?: number | string;
};

/**
 * Render a shared text input backed by Untitled UI.
 * @param props - Input props forwarded to the Untitled UI input.
 * @returns A styled input field.
 */
export function Input(props: InputProps) {
  return <UntitledInput {...props} size={props.size ?? 'md'} value={typeof props.value === 'number' ? String(props.value) : props.value} />;
}
