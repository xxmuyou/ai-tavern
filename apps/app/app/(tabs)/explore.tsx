import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const cloudTasks = [
  'Create Cloudflare account, zone, R2, D1, KV, Queues, and Durable Objects.',
  'Replace placeholder resource IDs in infra/cloudflare/wrangler.jsonc.',
  'Run Cloudflare type generation and D1 migrations before deploying.',
  'Keep AWS limited to backup buckets, archive buckets, and future heavy workloads.',
];

const endpoints = ['/health', '/db/ping', '/config/bootstrap', '/objects/:key', '/rooms/:roomId/events', '/jobs'];

export default function CloudScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Cloud setup</ThemedText>
        <ThemedText>Operational checklist for the Cloudflare-first stack.</ThemedText>
      </ThemedView>

      <ThemedView style={styles.panel}>
        <ThemedText type="subtitle">Next cloud tasks</ThemedText>
        <View style={styles.list}>
          {cloudTasks.map((task) => (
            <View key={task} style={styles.item}>
              <View style={styles.dot} />
              <ThemedText style={styles.itemText}>{task}</ThemedText>
            </View>
          ))}
        </View>
      </ThemedView>

      <ThemedView style={styles.panel}>
        <ThemedText type="subtitle">Worker endpoints</ThemedText>
        <View style={styles.endpointGrid}>
          {endpoints.map((endpoint) => (
            <View key={endpoint} style={styles.endpoint}>
              <ThemedText selectable type="defaultSemiBold">
                {endpoint}
              </ThemedText>
            </View>
          ))}
        </View>
      </ThemedView>
    </ScrollView>
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
  list: {
    gap: 12,
  },
  item: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    backgroundColor: '#1E6B52',
    borderRadius: 5,
    height: 10,
    marginTop: 6,
    width: 10,
  },
  itemText: {
    flex: 1,
  },
  endpointGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  endpoint: {
    borderColor: '#C5CBD3',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
