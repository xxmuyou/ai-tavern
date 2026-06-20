import { Redirect } from 'expo-router';

import { DISCOVER_ROUTE } from '@/constants/routes';

export default function LandingFallback() {
  return <Redirect href={DISCOVER_ROUTE} />;
}
