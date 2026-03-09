import { NativeSelect } from '@/components/untitled/base/select/select-native';

/**
 * Render a shared native select backed by Untitled UI.
 * @param props - Select props forwarded to the Untitled UI native select.
 * @returns A styled select field.
 */
export function Select(props: React.ComponentProps<typeof NativeSelect>) {
  return <NativeSelect {...props} />;
}
