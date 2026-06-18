import { Redirect } from 'expo-router';

import { DISCOVER_ROUTE } from '@/constants/routes';

export default function SafetyFallback() {
  return <Redirect href={DISCOVER_ROUTE} />;
}
