import { Redirect } from 'expo-router';

import { SCENES_ROUTE } from '@/constants/routes';

export default function TabsIndex() {
  return <Redirect href={SCENES_ROUTE} />;
}
