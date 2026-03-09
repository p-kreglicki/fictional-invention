import {
  RadioButton as UntitledRadioButton,
  RadioGroup as UntitledRadioGroup,
} from '@/components/untitled/base/radio-buttons/radio-buttons';

/**
 * Render a shared radio group backed by Untitled UI.
 * @param props - Radio group props forwarded to the Untitled UI radio group.
 * @returns A styled radio group.
 */
export function RadioGroup(props: React.ComponentProps<typeof UntitledRadioGroup>) {
  return <UntitledRadioGroup {...props} size={props.size ?? 'md'} />;
}

/**
 * Render a shared radio button backed by Untitled UI.
 * @param props - Radio button props forwarded to the Untitled UI radio button.
 * @returns A styled radio button.
 */
export function RadioButton(props: React.ComponentProps<typeof UntitledRadioButton>) {
  return <UntitledRadioButton {...props} size={props.size ?? 'md'} />;
}
