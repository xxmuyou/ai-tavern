import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { AuthGuard } from '@/components/AuthGuard';

export default function TabLayout() {
  return (
    <AuthGuard>
      <Tabs
        initialRouteName="index"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#1E6B52',
          tabBarInactiveTintColor: '#687076',
          tabBarStyle: {
            borderTopColor: '#D8DEE6',
            height: 64,
            paddingBottom: 8,
            paddingTop: 8,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Today',
            tabBarIcon: ({ color, size }) => <Ionicons color={color} name="sunny-outline" size={size} />,
          }}
        />
        <Tabs.Screen
          name="scenes"
          options={{
            title: 'Scenes',
            tabBarIcon: ({ color, size }) => <Ionicons color={color} name="map-outline" size={size} />,
          }}
        />
        <Tabs.Screen
          name="companions"
          options={{
            title: 'Companions',
            tabBarIcon: ({ color, size }) => <Ionicons color={color} name="people-outline" size={size} />,
          }}
        />
        <Tabs.Screen
          name="me"
          options={{
            title: 'Me',
            tabBarIcon: ({ color, size }) => <Ionicons color={color} name="person-circle-outline" size={size} />,
          }}
        />
      </Tabs>
    </AuthGuard>
  );
}
