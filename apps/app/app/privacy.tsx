import { Redirect } from 'expo-router';

import { DISCOVER_ROUTE } from '@/constants/routes';

export default function PrivacyFallback() {
  return <Redirect href={DISCOVER_ROUTE} />;
}
