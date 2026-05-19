import { Stack } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'AI Companion' }} />
      <Stack.Screen name="explore" options={{ title: 'Cloud' }} />
    </Stack>
  );
}
