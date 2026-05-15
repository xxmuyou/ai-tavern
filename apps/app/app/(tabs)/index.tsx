import { CLOUD_BOUNDARY, type AppRegistryEntry, type HealthResponse } from '@xtbit/shared';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8787';
const BILLING_EMAIL_STORAGE_KEY = 'xtbit.billing.email';

type HealthState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; data: HealthResponse }
  | { status: 'error'; message: string };

type BillingState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; message: string }
  | { status: 'error'; message: string };

type AppsState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; apps: AppRegistryEntry[] }
  | { status: 'error'; message: string };

export default function RuntimeScreen() {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const params = useLocalSearchParams<{ billing?: string }>();
  const [health, setHealth] = useState<HealthState>({ status: 'idle' });
  const [apps, setApps] = useState<AppsState>({ status: 'idle' });
  const [billingEmail, setBillingEmail] = useState('');
  const [billingState, setBillingState] = useState<BillingState>({ status: 'idle' });

  const boundaryRows = useMemo(
    () => [
      ['API', CLOUD_BOUNDARY.primaryRuntime],
      ['Web', CLOUD_BOUNDARY.primaryWeb],
      ['Files', CLOUD_BOUNDARY.primaryObjectStorage],
      ['Data', CLOUD_BOUNDARY.primaryDatabase],
      ['Rooms', CLOUD_BOUNDARY.primaryRealtimeState],
      ['Jobs', CLOUD_BOUNDARY.primaryAsyncQueue],
      ['Fallback', CLOUD_BOUNDARY.backupObjectStorage],
    ],
    [],
  );

  const checkHealth = useCallback(async () => {
    setHealth({ status: 'loading' });

    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setHealth({ status: 'ready', data: (await response.json()) as HealthResponse });
    } catch (error) {
      setHealth({ status: 'error', message: String(error) });
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  const loadApps = useCallback(async () => {
    setApps({ status: 'loading' });

    try {
      const response = await fetch(`${apiBaseUrl}/apps`);
      const payload = (await response.json()) as { apps?: AppRegistryEntry[]; error?: string };

      if (!response.ok || !payload.apps) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }

      setApps({ status: 'ready', apps: payload.apps });
    } catch (error) {
      setApps({ status: 'error', message: String(error) });
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  useEffect(() => {
    setBillingEmail(readStoredBillingEmail());
  }, []);

  const updateBillingEmail = useCallback((value: string) => {
    setBillingEmail(value);
    writeStoredBillingEmail(value);
  }, []);

  const checkSubscription = useCallback(async () => {
    setBillingState({ status: 'loading' });

    try {
      const email = billingEmail.trim();
      if (!email) {
        throw new Error('Enter the email used for checkout.');
      }

      const params = new URLSearchParams({ email });
      const response = await fetch(`${apiBaseUrl}/billing/subscription?${params.toString()}`);
      const payload = (await response.json()) as {
        active?: boolean;
        currentPeriodEnd?: string | null;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.status ?? `HTTP ${response.status}`);
      }

      const periodEnd = payload.currentPeriodEnd
        ? ` Current period ends ${new Date(payload.currentPeriodEnd).toLocaleDateString()}.`
        : '';

      setBillingState({
        status: 'ready',
        message: payload.active
          ? `Subscription is ${payload.status}.${periodEnd}`
          : `No active subscription: ${payload.status}.`,
      });
    } catch (error) {
      setBillingState({ status: 'error', message: String(error) });
    }
  }, [apiBaseUrl, billingEmail]);

  useEffect(() => {
    if (params.billing === 'success') {
      setBillingState({ status: 'ready', message: 'Checkout returned. Confirming subscription...' });
      const timer = setTimeout(() => {
        void checkSubscription();
      }, 1500);

      return () => clearTimeout(timer);
    }

    if (params.billing === 'cancelled') {
      setBillingState({ status: 'ready', message: 'Checkout was cancelled.' });
    }

    return undefined;
  }, [checkSubscription, params.billing]);

  const startCheckout = useCallback(async () => {
    setBillingState({ status: 'loading' });

    try {
      const email = billingEmail.trim();
      if (!email) {
        throw new Error('Enter an email before checkout.');
      }

      writeStoredBillingEmail(email);
      const response = await fetch(`${apiBaseUrl}/billing/checkout`, {
        body: JSON.stringify({ appKey: 'platform', email }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }

      await WebBrowser.openBrowserAsync(payload.url);
      setBillingState({ status: 'ready', message: 'Checkout opened. Status will refresh after payment returns.' });
    } catch (error) {
      setBillingState({ status: 'error', message: String(error) });
    }
  }, [apiBaseUrl, billingEmail]);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">xtbit apps</ThemedText>
        <ThemedText>Cloudflare-first runtime for Web, Android, and iOS.</ThemedText>
      </ThemedView>

      <ThemedView style={styles.panel}>
        <View style={styles.panelHeader}>
          <ThemedText type="subtitle">API health</ThemedText>
          <StatusBadge state={health} />
        </View>
        <ThemedText selectable>{apiBaseUrl}</ThemedText>
        {health.status === 'ready' ? (
          <ThemedText>
            {health.data.service} {health.data.version} is running in {health.data.environment}.
          </ThemedText>
        ) : null}
        {health.status === 'error' ? <ThemedText>{health.message}</ThemedText> : null}
        <Pressable accessibilityRole="button" onPress={checkHealth} style={styles.button}>
          <ThemedText type="defaultSemiBold">Check again</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.panel}>
        <ThemedText type="subtitle">Cloud boundary</ThemedText>
        <View style={styles.rows}>
          {boundaryRows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <ThemedText type="defaultSemiBold" style={styles.rowLabel}>
                {label}
              </ThemedText>
              <ThemedText style={styles.rowValue}>{value}</ThemedText>
            </View>
          ))}
        </View>
      </ThemedView>

      <ThemedView style={styles.panel}>
        <ThemedText type="subtitle">Platform pass</ThemedText>
        <ThemedText>$0.90 USD monthly test pass through Stripe Checkout.</ThemedText>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={updateBillingEmail}
          placeholder="Email for test checkout"
          style={styles.input}
          value={billingEmail}
        />
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={startCheckout} style={styles.button}>
            <ThemedText type="defaultSemiBold">Subscribe</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={checkSubscription} style={styles.button}>
            <ThemedText type="defaultSemiBold">Check status</ThemedText>
          </Pressable>
        </View>
        {billingState.status === 'ready' || billingState.status === 'error' ? (
          <ThemedText>{billingState.message}</ThemedText>
        ) : null}
      </ThemedView>

      <ThemedView style={styles.panel}>
        <View style={styles.panelHeader}>
          <ThemedText type="subtitle">App registry</ThemedText>
          <Pressable accessibilityRole="button" onPress={loadApps} style={styles.button}>
            <ThemedText type="defaultSemiBold">Refresh</ThemedText>
          </Pressable>
        </View>
        {apps.status === 'ready' ? (
          <View style={styles.rows}>
            {apps.apps.map((app) => (
              <Pressable
                accessibilityRole="button"
                key={app.appKey}
                onPress={() => {
                  if (app.appKey === 'ai-tv-dating') {
                    router.push('/ai-tv-dating');
                  }
                }}
                style={styles.appRow}>
                <View style={styles.appMeta}>
                  <ThemedText type="defaultSemiBold">{app.name}</ThemedText>
                  <ThemedText>{app.appKey}</ThemedText>
                </View>
                <AppStatusPill status={app.status} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {apps.status === 'error' ? <ThemedText>{apps.message}</ThemedText> : null}
      </ThemedView>
    </ScrollView>
  );
}

function readStoredBillingEmail(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(BILLING_EMAIL_STORAGE_KEY) ?? '';
}

function writeStoredBillingEmail(value: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(BILLING_EMAIL_STORAGE_KEY, value.trim());
}

function StatusBadge({ state }: { state: HealthState }) {
  const label = state.status === 'ready' ? 'Ready' : state.status === 'error' ? 'Offline' : 'Checking';
  const style = state.status === 'ready' ? styles.badgeReady : state.status === 'error' ? styles.badgeError : styles.badgeMuted;

  return (
    <View style={[styles.badge, style]}>
      <ThemedText type="defaultSemiBold" style={styles.badgeText}>
        {label}
      </ThemedText>
    </View>
  );
}

function AppStatusPill({ status }: { status: AppRegistryEntry['status'] }) {
  const style =
    status === 'active' ? styles.badgeReady : status === 'hidden' ? styles.badgeMuted : styles.badgeError;

  return (
    <View style={[styles.badge, style]}>
      <ThemedText type="defaultSemiBold" style={styles.badgeText}>
        {status}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    padding: 20,
  },
  header: {
    gap: 6,
  },
  panel: {
    borderColor: '#D4D8DD',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeMuted: {
    backgroundColor: '#E8EAED',
  },
  badgeReady: {
    backgroundColor: '#DDF3E4',
  },
  badgeError: {
    backgroundColor: '#F9D7D2',
  },
  badgeText: {
    fontSize: 12,
  },
  button: {
    alignItems: 'center',
    borderColor: '#1E6B52',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  appMeta: {
    flex: 1,
    gap: 2,
  },
  appRow: {
    alignItems: 'center',
    borderTopColor: '#ECEFF3',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  input: {
    borderColor: '#C5CBD3',
    borderRadius: 8,
    borderWidth: 1,
    color: '#11181C',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  rows: {
    gap: 10,
  },
  row: {
    alignItems: 'flex-start',
    borderTopColor: '#ECEFF3',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 10,
  },
  rowLabel: {
    width: 72,
  },
  rowValue: {
    flex: 1,
  },
});
