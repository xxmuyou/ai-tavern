import { AppDropdown } from '@/components/AppDropdown';

export function AdminDropdown<T extends string | null>(props: {
  labelForValue: (value: T) => string;
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  return <AppDropdown {...props} />;
}
