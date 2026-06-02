import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { LoadingScreen } from '@/components/LoadingScreen';
import { WebAuthControls } from '@/components/web/WebAuthControls';
import { WebCompanionDirectory } from '@/components/web/WebCompanionDirectory';
import { WebCard, WebTag } from '@/components/web/ui';
import { useSession } from '@/hooks/use-session';

const SKELETON_CARDS = ['catalog-slot-1', 'catalog-slot-2', 'catalog-slot-3', 'catalog-slot-4'];

export default function WebIndex() {
  const { isLoading, session } = useSession();

  if (isLoading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  if (session) {
    return (
      <WebCompanionDirectory
        title="Companions"
        subtitle="Your homepage is the cast. Browse everyone available, open a profile, or create someone new."
      />
    );
  }

  return <PublicCompanionHome />;
}

function PublicCompanionHome() {
  return (
    <View className="min-h-screen bg-app-canvas">
      <View pointerEvents="none" className="absolute inset-x-0 top-0 h-[360px] bg-gradient-warm opacity-70" />
      <View className="relative mx-auto w-full max-w-[1440px] px-6 py-5 lg:px-10">
        <View className="sticky top-0 z-20 mb-10 flex-row items-center justify-between rounded-2xl border border-app-line bg-app-surface/90 px-4 py-3 shadow-card backdrop-blur lg:px-5">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-rose-soft">
              <Text className="font-serif text-title-sm text-rose-deep">A</Text>
            </View>
            <View>
              <Text className="font-serif text-title-sm text-app-ink">AI Apps Box</Text>
              <Text className="text-caption text-app-muted">Companion-first workspace</Text>
            </View>
          </View>
          <WebAuthControls />
        </View>

        <View className="grid grid-cols-1 gap-8 xl:grid-cols-[0.9fr_1.4fr]">
          <View className="pb-4">
            <WebTag size="md" variant="rose">Companions are the homepage</WebTag>
            <Text className="mt-5 max-w-2xl font-serif text-display-xl leading-[1.04] text-app-ink">
              Browse the real cast after you sign in.
            </Text>
            <Text className="mt-5 max-w-xl text-body-lg leading-7 text-app-ink-soft">
              This page no longer uses placeholder people or historical preview art. Sign in from the topbar and the same route becomes the live companion catalog.
            </Text>
            <View className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {['Real companions only', 'Topbar sign-in', 'Create after login'].map((label) => (
                <View key={label} className="flex-row items-center gap-2 rounded-2xl border border-app-line bg-app-brand-soft px-4 py-3 shadow-card">
                  <Ionicons color="#14493A" name="checkmark-circle" size={16} />
                  <Text className="text-caption font-semibold text-app-brand-deep">{label}</Text>
                </View>
              ))}
            </View>
          </View>

          <WebCard padding="lg" className="gap-5">
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <View>
                <Text className="text-overline text-rose-deep">Catalog preview</Text>
                <Text className="mt-1 font-serif text-title text-app-ink">Real companion directory</Text>
              </View>
              <WebAuthControls />
            </View>
            <View className="flex-row flex-wrap gap-2">
              {['All companions', 'My companions', 'Official'].map((label, index) => (
                <View
                  key={label}
                  className={`rounded-full border px-4 py-2 ${
                    index === 0 ? 'border-app-rose/35 bg-app-rose-soft' : 'border-app-line bg-app-canvas/80'
                  }`}
                >
                  <Text className={`text-caption font-semibold ${index === 0 ? 'text-app-rose-deep' : 'text-app-muted'}`}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
            <View className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {SKELETON_CARDS.map((id) => (
                <View key={id} className="overflow-hidden rounded-2xl border border-app-line bg-app-sunken/60">
                  <View className="aspect-[4/5] items-center justify-center bg-gradient-warm">
                    <View className="h-20 w-20 rounded-full border border-app-rose/20 bg-app-surface/50" />
                  </View>
                  <View className="gap-3 p-5">
                    <View className="h-4 w-2/3 rounded-full bg-app-line" />
                    <View className="h-3 w-1/2 rounded-full bg-app-line-soft" />
                    <View className="h-3 w-3/4 rounded-full bg-app-line-soft" />
                  </View>
                </View>
              ))}
            </View>
            <Text className="text-caption leading-5 text-app-muted">
              The live catalog loads only after authentication, so this area intentionally shows structure instead of fake people.
            </Text>
          </WebCard>
        </View>
      </View>
    </View>
  );
}
