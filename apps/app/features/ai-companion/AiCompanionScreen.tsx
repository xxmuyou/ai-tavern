import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type DimensionValue } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import {
  type AsyncState,
  type ShowGuest,
  type ShowSessionPayload,
  type ShowWorkspacePayload,
  type SpeechPreviewPayload,
  type SystemAsset,
  type WorkspaceGuest,
  answerShowTurnStream,
  createChapterOneSession,
  fetchShowCharacters,
  fetchShowSession,
  fetchShowWorkspace,
  finalizeShowSession,
  joinWorkspaceGuest,
  objectUrl,
  previewShowSpeech,
  startCheckout as createCheckout,
  uploadSystemAsset,
} from '@/api/companion-client';
import { useAuthEmail } from '@/hooks/use-auth-email';

type ScreenMode = 'home' | 'workspace' | 'faq' | 'chapter-one';
type GuestLibrary = Awaited<ReturnType<typeof fetchShowCharacters>>;
type PendingAction =
  | { characterKey: string; type: 'join' }
  | { type: 'chapters' }
  | { type: 'price' }
  | { type: 'workspace' };

const DEFAULT_CHAPTER_ONE_SLOT_COUNT = 5;

const DEFAULT_SHOW_ASSET_MAP = {
  'apps/ai-tv-dating/backgrounds/studio.png': require('@/assets/ai-companion/show/studio-background.png'),
  'apps/ai-tv-dating/guests/ivy.png': require('@/assets/ai-companion/show/ivy.png'),
  'apps/ai-tv-dating/guests/leo.png': require('@/assets/ai-companion/show/leo.png'),
  'apps/ai-tv-dating/guests/mia.png': require('@/assets/ai-companion/show/mia.png'),
  'apps/ai-tv-dating/guests/noah.png': require('@/assets/ai-companion/show/noah.png'),
};

const DEFAULT_CHARACTER_ASSET_MAP = {
  host: require('@/assets/ai-companion/show/host.png'),
  ivy: require('@/assets/ai-companion/show/ivy.png'),
  leo: require('@/assets/ai-companion/show/leo.png'),
  mia: require('@/assets/ai-companion/show/mia.png'),
  noah: require('@/assets/ai-companion/show/noah.png'),
};

export default function AiCompanionHome() {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const { draftEmail, email, persistEmail, setDraftEmail, signOut } = useAuthEmail();
  const signedIn = email.trim().length > 0;
  const username = email ? email.split('@')[0] || 'Player' : '';

  const [mode, setMode] = useState<ScreenMode>('home');
  const [signinOpen, setSigninOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [library, setLibrary] = useState<AsyncState<GuestLibrary>>({ status: 'idle' });
  const [workspace, setWorkspace] = useState<AsyncState<ShowWorkspacePayload>>({ status: 'idle' });
  const [joiningKey, setJoiningKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [selectedGuestKeys, setSelectedGuestKeys] = useState<string[]>([]);
  const [showSession, setShowSession] = useState<AsyncState<ShowSessionPayload>>({ status: 'idle' });
  const [guestStreamingLines, setGuestStreamingLines] = useState<Record<string, string>>({});
  const [turnSubmitting, setTurnSubmitting] = useState(false);

  const guests = useMemo(
    () => library.status === 'ready' ? library.data.characters.filter((guest) => guest.role === 'guest') : [],
    [library],
  );
  const officialGuests = useMemo(
    () => library.status === 'ready' ? library.data.officialCharacters.filter((guest) => guest.role === 'guest') : [],
    [library],
  );
  const communityGuests = useMemo(
    () => library.status === 'ready' ? library.data.communityCharacters.filter((guest) => guest.role === 'guest') : [],
    [library],
  );
  const workspaceGuestKeys = useMemo(() => {
    if (workspace.status !== 'ready') {
      return new Set<string>();
    }

    return new Set(workspace.data.guestAssets.map((guest) => guest.characterKey));
  }, [workspace]);

  const workspaceLineupGuests = useMemo(() => {
    if (workspace.status !== 'ready') {
      return [] as Array<ShowGuest | WorkspaceGuest>;
    }

    return uniqueGuests([...workspace.data.guestAssets, ...workspace.data.userCharacters]);
  }, [workspace]);

  const workspaceLineupGuestKeys = useMemo(
    () => new Set(workspaceLineupGuests.map((guest) => guest.characterKey)),
    [workspaceLineupGuests],
  );

  const chapterOneSlotCount = workspace.status === 'ready'
    ? clampSlotCount(workspace.data.chapterOne?.slotCount)
    : DEFAULT_CHAPTER_ONE_SLOT_COUNT;

  const loadLibrary = useCallback(async (nextEmail = email) => {
    setLibrary({ status: 'loading' });
    try {
      setLibrary({ status: 'ready', data: await fetchShowCharacters(nextEmail) });
    } catch (error) {
      setLibrary({ status: 'error', message: String(error) });
    }
  }, [email]);

  const loadWorkspace = useCallback(async (nextEmail = email) => {
    if (!nextEmail.trim()) {
      setWorkspace({ status: 'idle' });
      return;
    }

    setWorkspace({ status: 'loading' });
    try {
      setWorkspace({ status: 'ready', data: await fetchShowWorkspace(nextEmail) });
    } catch (error) {
      setWorkspace({ status: 'error', message: String(error) });
    }
  }, [email]);

  const performCheckout = useCallback(async (nextEmail = email) => {
    setNotice('Opening checkout...');
    try {
      await WebBrowser.openBrowserAsync(await createCheckout(nextEmail));
      setNotice('Checkout opened. Return here when you are done.');
    } catch (error) {
      setNotice(String(error));
    }
  }, [email]);

  const performJoin = useCallback(async (characterKey: string, nextEmail = email, options?: { silent?: boolean }) => {
    if (!nextEmail.trim()) {
      return false;
    }

    setJoiningKey(characterKey);
    try {
      const nextWorkspace = await joinWorkspaceGuest(characterKey, nextEmail);
      setWorkspace({ status: 'ready', data: nextWorkspace });
      if (!options?.silent) {
        const joined = nextWorkspace.guestAssets.find((guest) => guest.characterKey === characterKey);
        setNotice(`${joined?.name ?? 'Guest'} added to Workspace.`);
      }
      return true;
    } catch (error) {
      setNotice(String(error));
      return false;
    } finally {
      setJoiningKey(null);
    }
  }, [email]);

  const runPendingAction = useCallback(async (action: PendingAction, nextEmail: string) => {
    if (action.type === 'chapters') {
      setChapterModalOpen(true);
      return;
    }

    if (action.type === 'workspace') {
      setMode('workspace');
      await loadWorkspace(nextEmail);
      return;
    }

    if (action.type === 'price') {
      await performCheckout(nextEmail);
      return;
    }

    await performJoin(action.characterKey, nextEmail);
  }, [loadWorkspace, performCheckout, performJoin]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (signedIn) {
      void loadWorkspace(email);
      return;
    }

    setWorkspace({ status: 'idle' });
  }, [email, loadWorkspace, signedIn]);

  useEffect(() => {
    if (!email || !pendingAction) {
      return;
    }

    const action = pendingAction;
    setPendingAction(null);
    void runPendingAction(action, email);
  }, [email, pendingAction, runPendingAction]);

  useEffect(() => {
    setSelectedGuestKeys((current) => current.slice(0, chapterOneSlotCount));
  }, [chapterOneSlotCount]);

  const openSignIn = useCallback((action?: PendingAction) => {
    if (action) {
      setPendingAction(action);
    }
    setDraftEmail(email);
    setSigninOpen(true);
  }, [email, setDraftEmail]);

  const requireSignIn = useCallback((action: PendingAction) => {
    if (signedIn) {
      return false;
    }

    openSignIn(action);
    return true;
  }, [openSignIn, signedIn]);

  const confirmSignIn = useCallback(async () => {
    const normalized = draftEmail.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      setNotice('Enter a valid email to continue.');
      return;
    }

    setSigningIn(true);
    try {
      await persistEmail(normalized);
      setSigninOpen(false);
      setNotice(null);
    } catch (error) {
      setNotice(String(error));
    } finally {
      setSigningIn(false);
    }
  }, [draftEmail, persistEmail]);

  const logout = useCallback(() => {
    signOut();
    setMode('home');
    setWorkspace({ status: 'idle' });
    setSelectedGuestKeys([]);
    setShowSession({ status: 'idle' });
    setNotice(null);
  }, [signOut]);

  const openHome = useCallback(() => {
    setMode('home');
    setChapterModalOpen(false);
  }, []);

  const openWorkspace = useCallback(() => {
    if (requireSignIn({ type: 'workspace' })) {
      return;
    }

    setMode('workspace');
    void loadWorkspace(email);
  }, [email, loadWorkspace, requireSignIn]);

  const openPrice = useCallback(() => {
    if (requireSignIn({ type: 'price' })) {
      return;
    }

    void performCheckout(email);
  }, [email, performCheckout, requireSignIn]);

  const openChapters = useCallback(() => {
    if (requireSignIn({ type: 'chapters' })) {
      return;
    }

    setChapterModalOpen(true);
  }, [requireSignIn]);

  const joinGuest = useCallback((characterKey: string) => {
    if (requireSignIn({ characterKey, type: 'join' })) {
      return;
    }

    void performJoin(characterKey, email);
  }, [email, performJoin, requireSignIn]);

  const enterChapterOne = useCallback(() => {
    setChapterModalOpen(false);
    setMode('chapter-one');
    setShowSession({ status: 'idle' });
  }, []);

  const insertChapterGuest = useCallback((guest: ShowGuest | WorkspaceGuest) => {
    if (requireSignIn({ type: 'chapters' })) {
      return;
    }

    if (!workspaceLineupGuestKeys.has(guest.characterKey)) {
      setNotice('Add this Guest to your Workspace before using them in Chapter 1.');
      return;
    }
    if (!selectedGuestKeys.includes(guest.characterKey) && selectedGuestKeys.length >= chapterOneSlotCount) {
      setNotice('Chapter 1 supports up to 5 guests.');
      return;
    }

    setSelectedGuestKeys((current) => {
      if (current.includes(guest.characterKey)) {
        return current;
      }

      return [...current, guest.characterKey].slice(0, chapterOneSlotCount);
    });
  }, [chapterOneSlotCount, requireSignIn, selectedGuestKeys, workspaceLineupGuestKeys]);

  const removeChapterGuest = useCallback((characterKey: string) => {
    setSelectedGuestKeys((current) => current.filter((key) => key !== characterKey));
  }, []);

  const startChapterOne = useCallback(async () => {
    if (requireSignIn({ type: 'chapters' })) {
      return;
    }
    if (selectedGuestKeys.length < 1) {
      setNotice('Select at least one Guest before entering Chapter 1.');
      return;
    }
    if (selectedGuestKeys.some((key) => !workspaceLineupGuestKeys.has(key))) {
      setNotice('One selected Guest is no longer in your Workspace.');
      return;
    }
    setShowSession({ status: 'loading' });
    try {
      setShowSession({
        status: 'ready',
        data: await createChapterOneSession({ email, selectedGuestKeys }),
      });
      await loadWorkspace(email);
    } catch (error) {
      setShowSession({ status: 'error', message: String(error) });
    }
  }, [email, loadWorkspace, requireSignIn, selectedGuestKeys, workspaceLineupGuestKeys]);

  const replaceSystemAsset = useCallback(async (asset: SystemAsset) => {
    if (workspace.status !== 'ready' || !workspace.data.admin?.isAdmin) {
      setNotice('Admin access is required.');
      return;
    }

    const file = await pickImageFile();
    if (!file) {
      return;
    }

    setNotice('Uploading system image...');
    try {
      await uploadSystemAsset({
        characterKey: asset.characterKey,
        file,
        kind: asset.kind,
      });
      await Promise.all([loadWorkspace(email), loadLibrary(email)]);
      setNotice(`${asset.label} image updated.`);
    } catch (error) {
      setNotice(String(error));
    }
  }, [email, loadLibrary, loadWorkspace, workspace]);

  const refreshChapterSession = useCallback(async () => {
    if (showSession.status !== 'ready') {
      return;
    }

    setShowSession({ status: 'loading' });
    try {
      setShowSession({
        status: 'ready',
        data: await fetchShowSession(showSession.data.session.id, email),
      });
    } catch (error) {
      setShowSession({ status: 'error', message: String(error) });
    }
  }, [email, showSession]);

  const answerChapterTurn = useCallback(async (input: {
    freeText: string;
    selectedCharacterKey?: string;
    selectedOptionId: string;
    turnId: string;
  }) => {
    if (!email || showSession.status !== 'ready') {
      return;
    }
    if (turnSubmitting) {
      return;
    }

    setTurnSubmitting(true);
    setGuestStreamingLines({});
    try {
      const fallbackSpeakerKey = showSession.data.currentTurn?.speakerKey ?? 'host';
      setShowSession({
        status: 'ready',
        data: await answerShowTurnStream(showSession.data.session.id, input.turnId, {
          email,
          freeText: input.freeText,
          selectedCharacterKey: input.selectedCharacterKey,
          selectedOptionId: input.selectedOptionId,
        }, {
          onDelta: (delta) => {
            const key = delta.speakerKey ?? fallbackSpeakerKey;
            setGuestStreamingLines((prev) => ({ ...prev, [key]: (prev[key] ?? '') + delta.text }));
          },
          onStart: () => setGuestStreamingLines({}),
        }),
      });
      setGuestStreamingLines({});
    } catch (error) {
      setShowSession({ status: 'error', message: String(error) });
    } finally {
      setTurnSubmitting(false);
    }
  }, [email, showSession, turnSubmitting]);

  const previewSpeech = useCallback(async (input: {
    messageId?: string;
    speakerKey?: string | null;
    text?: string;
  }): Promise<SpeechPreviewPayload> => {
    if (!email || showSession.status !== 'ready') {
      return {
        audioUrl: null,
        speakerKey: input.speakerKey ?? null,
        status: 'not_configured',
        text: input.text ?? '',
      };
    }

    return previewShowSpeech(showSession.data.session.id, {
      email,
      messageId: input.messageId,
      speakerKey: input.speakerKey,
      text: input.text,
    });
  }, [email, showSession]);

  const finalizeChapterOne = useCallback(async (characterKey: string | null) => {
    if (!email || showSession.status !== 'ready') {
      return;
    }

    setShowSession({ status: 'loading' });
    try {
      const data = await finalizeShowSession(showSession.data.session.id, { characterKey, email });
      setShowSession({ status: 'ready', data });
      await loadWorkspace(email);
    } catch (error) {
      setShowSession({ status: 'error', message: String(error) });
    }
  }, [email, loadWorkspace, showSession]);

  return (
    <View style={styles.screen}>
      <Topbar
        activeMode={mode}
        compact={compact}
        email={email}
        onFaq={() => setMode('faq')}
        onHome={openHome}
        onPrice={openPrice}
        onSignIn={() => openSignIn()}
        onSignOut={logout}
        onWorkspace={openWorkspace}
        username={username}
      />

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
        {mode === 'workspace' ? (
          <WorkspaceView
            onMore={openHome}
            onRefresh={() => void loadWorkspace(email)}
            onReplaceSystemAsset={replaceSystemAsset}
            workspace={workspace}
          />
        ) : mode === 'faq' ? (
          <FaqView />
        ) : mode === 'chapter-one' ? (
          <ChapterOneView
            availableGuests={workspaceLineupGuests}
            compact={compact}
            onBack={openHome}
            onFinalize={finalizeChapterOne}
            onMoreGuests={openHome}
            onRefreshSession={refreshChapterSession}
            onRemoveGuest={removeChapterGuest}
            onStart={startChapterOne}
            onInsertGuest={insertChapterGuest}
            onPreviewSpeech={previewSpeech}
            onSubmitTurn={answerChapterTurn}
            selectedGuestKeys={selectedGuestKeys}
            sessionState={showSession}
            slotCount={chapterOneSlotCount}
            guestStreamingLines={guestStreamingLines}
            turnSubmitting={turnSubmitting}
            workspaceState={workspace}
          />
        ) : (
          <HomeView
            communityGuests={communityGuests}
            compact={compact}
            joiningKey={joiningKey}
            library={library}
            notice={notice}
            officialGuests={officialGuests}
            onJoin={joinGuest}
            onRefresh={() => void loadLibrary(email)}
            onStart={openChapters}
            workspaceGuestKeys={workspaceGuestKeys}
          />
        )}
      </ScrollView>

      {chapterModalOpen ? <ChapterModal onClose={() => setChapterModalOpen(false)} onEnter={enterChapterOne} /> : null}
      {signinOpen ? (
        <SignInOverlay
          draftEmail={draftEmail}
          onChangeDraft={setDraftEmail}
          onClose={() => {
            setSigninOpen(false);
            setPendingAction(null);
          }}
          onSubmit={confirmSignIn}
          signingIn={signingIn}
        />
      ) : null}
    </View>
  );
}

function Topbar({
  activeMode,
  compact,
  email,
  onFaq,
  onHome,
  onPrice,
  onSignIn,
  onSignOut,
  onWorkspace,
  username,
}: {
  activeMode: ScreenMode;
  compact: boolean;
  email: string;
  onFaq: () => void;
  onHome: () => void;
  onPrice: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onWorkspace: () => void;
  username: string;
}) {
  return (
    <View style={[styles.topbar, compact && styles.topbarCompact]}>
      <Pressable accessibilityRole="button" onPress={onHome} style={styles.brandBlock}>
        <Text style={styles.brand}>AI Companion</Text>
        <Text style={styles.brandSub}>Story guest game</Text>
      </Pressable>

      <View style={styles.nav}>
        <TopbarButton active={activeMode === 'home'} label="Home" onPress={onHome} />
        <TopbarButton label="Price" onPress={onPrice} />
        <TopbarButton active={activeMode === 'faq'} label="FAQ" onPress={onFaq} />
      </View>

      <View style={styles.accountActions}>
        {email ? (
          <>
            <Pressable accessibilityRole="button" onPress={onWorkspace} style={styles.profileButton}>
              <View style={styles.profilePill}>
                <Text style={styles.profileInitialSmall}>{username.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text numberOfLines={1} style={styles.profileName}>{username}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.signInPill}>
              <Text style={styles.signInText}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" onPress={onSignIn} style={styles.signInPill}>
            <Text style={styles.signInText}>Sign in</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function TopbarButton({ active, label, onPress }: { active?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.navButton, active && styles.navButtonActive]}>
      <Text style={[styles.navButtonText, active && styles.navButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function HomeView({
  communityGuests,
  compact,
  joiningKey,
  library,
  notice,
  officialGuests,
  onJoin,
  onRefresh,
  onStart,
  workspaceGuestKeys,
}: {
  communityGuests: ShowGuest[];
  compact: boolean;
  joiningKey: string | null;
  library: AsyncState<GuestLibrary>;
  notice: string | null;
  officialGuests: ShowGuest[];
  onJoin: (characterKey: string) => void;
  onRefresh: () => void;
  onStart: () => void;
  workspaceGuestKeys: Set<string>;
}) {
  return (
    <>
      <View style={[styles.hero, compact && styles.heroCompact]}>
        <View style={styles.heroCopy}>
          <Text style={styles.kickerText}>Chapter 1 is a dating-show story</Text>
          <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>Meet guests. Start the story.</Text>
          <Text style={styles.heroBody}>
            Pick Guests from the gallery, add them to your Workspace, then enter Chapter 1 where the lineup reacts to you.
          </Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onStart} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Start Now</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onRefresh} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Refresh</Text>
            </Pressable>
          </View>
          {notice ? <Text selectable style={styles.statusLine}>{notice}</Text> : null}
        </View>
        <View style={styles.heroPreview}>
          <Text style={styles.previewEyebrow}>Chapter card</Text>
          <Text style={styles.previewTitle}>Heart Signal Live</Text>
          <Text style={styles.previewBody}>Add 1 to 5 Guests, answer the host, and discover which connection opens later chapters.</Text>
        </View>
      </View>

      <GuestSection
        emptyBody={library.status === 'error' ? library.message : 'System Guests will appear after the API responds.'}
        guests={officialGuests}
        joiningKey={joiningKey}
        onJoin={onJoin}
        title="System hot Guests"
        workspaceGuestKeys={workspaceGuestKeys}
      />

      <GuestSection
        emptyBody="Community Guests will appear here after published characters are available."
        guests={communityGuests}
        joiningKey={joiningKey}
        onJoin={onJoin}
        title="Community hot Guests"
        workspaceGuestKeys={workspaceGuestKeys}
      />
    </>
  );
}

function GuestSection({
  emptyBody,
  guests,
  joiningKey,
  onJoin,
  title,
  workspaceGuestKeys,
}: {
  emptyBody: string;
  guests: ShowGuest[];
  joiningKey: string | null;
  onJoin: (characterKey: string) => void;
  title: string;
  workspaceGuestKeys: Set<string>;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.galleryGrid}>
        {guests.length ? guests.map((guest) => (
          <GuestCard
            added={workspaceGuestKeys.has(guest.characterKey)}
            guest={guest}
            joining={joiningKey === guest.characterKey}
            key={guest.characterKey}
            onJoin={() => onJoin(guest.characterKey)}
          />
        )) : <EmptyState title="No Guests yet" body={emptyBody} />}
      </View>
    </View>
  );
}

function GuestCard({
  added,
  guest,
  joining,
  onJoin,
}: {
  added: boolean;
  guest: ShowGuest;
  joining: boolean;
  onJoin: () => void;
}) {
  return (
    <View style={styles.guestCard}>
      <GuestPortrait guest={guest} />
      <Text numberOfLines={1} style={styles.characterName}>{guest.name}</Text>
      <Text numberOfLines={2} style={styles.characterTraits}>{guestDefinition(guest)}</Text>
      <Text numberOfLines={1} style={styles.characterMeta}>{guestPublisher(guest)}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={added || joining}
        onPress={onJoin}
        style={[styles.characterCardAction, added && styles.characterCardActionAdded]}>
        <Text style={[styles.characterCardActionText, added && styles.characterCardActionTextAdded]}>
          {joining ? 'Adding...' : added ? 'Added' : 'Join'}
        </Text>
      </Pressable>
    </View>
  );
}

function WorkspaceView({
  onMore,
  onRefresh,
  onReplaceSystemAsset,
  workspace,
}: {
  onMore: () => void;
  onRefresh: () => void;
  onReplaceSystemAsset: (asset: SystemAsset) => void;
  workspace: AsyncState<ShowWorkspacePayload>;
}) {
  if (workspace.status === 'error') {
    return <EmptyState title="Workspace unavailable" body={workspace.message} />;
  }

  if (workspace.status !== 'ready') {
    return <EmptyState title="Loading Workspace" body="Fetching your Guest assets and recent story sessions." />;
  }

  const joinedGuests = workspace.data.guestAssets;
  const userGuests = workspace.data.userCharacters;

  return (
    <>
      <View style={styles.workspaceHeader}>
        <View style={styles.profilePillLarge}>
          <Text style={styles.profileInitialLarge}>{workspace.data.profile.displayName.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.detailCopy}>
          <Text style={styles.sectionTitle}>{workspace.data.profile.displayName}</Text>
          <Text style={styles.heroBody}>Your Workspace keeps joined Guests, created Guests, unlocked companions, and recent sessions.</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onMore} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>More Guests</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onRefresh} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Refresh</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <WorkspaceGuestSection guests={joinedGuests} title="Joined Guest assets" />
      <WorkspaceGuestSection guests={userGuests} title="Created Guests" />
      {workspace.data.admin?.isAdmin ? (
        <SystemAssetsSection
          assets={workspace.data.admin.systemAssets}
          onReplace={onReplaceSystemAsset}
        />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Unlocked companions</Text>
        <View style={styles.rows}>
          {workspace.data.companions.length ? workspace.data.companions.map((companion) => (
            <View key={companion.id} style={styles.dataRow}>
              <Text style={styles.rowTitle}>{companion.name}</Text>
              <Text style={styles.rowMeta}>{companion.unlockStatus} / {companion.storyTurnCount} story turns</Text>
            </View>
          )) : <EmptyState title="No companions unlocked" body="Chapter outcomes will add continuing companions here." />}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent sessions</Text>
        <View style={styles.rows}>
          {workspace.data.recentSessions.length ? workspace.data.recentSessions.map((session) => (
            <View key={session.id} style={styles.dataRow}>
              <Text style={styles.rowTitle}>{session.currentStage}</Text>
              <Text style={styles.rowMeta}>{session.status} / {session.messageCount} messages</Text>
            </View>
          )) : <EmptyState title="No sessions yet" body="Start Chapter 1 to create the first story session." />}
        </View>
      </View>
    </>
  );
}

function WorkspaceGuestSection({ guests, title }: { guests: Array<ShowGuest | WorkspaceGuest>; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.galleryGrid}>
        {guests.length ? guests.map((guest) => (
          <View key={guest.characterKey} style={styles.guestCardCompact}>
            <GuestPortrait guest={guest} />
            <Text numberOfLines={1} style={styles.characterName}>{guest.name}</Text>
            <Text numberOfLines={2} style={styles.characterTraits}>{guestDefinition(guest)}</Text>
            <Text numberOfLines={1} style={styles.characterMeta}>{guestPublisher(guest)}</Text>
          </View>
        )) : <EmptyState title="Nothing here yet" body="Use More Guests to add characters from the homepage gallery." />}
      </View>
    </View>
  );
}

function SystemAssetsSection({
  assets,
  onReplace,
}: {
  assets: SystemAsset[];
  onReplace: (asset: SystemAsset) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>System Assets</Text>
        <Text style={styles.counterText}>Admin</Text>
      </View>
      <View style={styles.galleryGrid}>
        {assets.map((asset) => (
          <View key={`${asset.kind}-${asset.characterKey ?? 'background'}`} style={styles.systemAssetCard}>
            <SystemAssetPreview asset={asset} />
            <Text numberOfLines={1} style={styles.characterName}>{asset.label}</Text>
            <Text numberOfLines={1} style={styles.characterMeta}>{asset.role}</Text>
            <Pressable accessibilityRole="button" onPress={() => onReplace(asset)} style={styles.characterCardAction}>
              <Text style={styles.characterCardActionText}>Replace image</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

function SystemAssetPreview({ asset }: { asset: SystemAsset }) {
  const source = asset.kind === 'background'
    ? imageSourceForObjectKey(asset.objectKey ?? 'apps/ai-tv-dating/backgrounds/studio.png')
    : imageSourceForCharacter(asset.characterKey ?? '', asset.objectKey);

  return source ? (
    <Image
      contentFit="cover"
      source={source}
      style={asset.kind === 'background' ? styles.systemBackgroundPreview : styles.characterImage}
    />
  ) : (
    <View style={styles.characterImagePlaceholder}>
      <Text style={styles.characterInitial}>{asset.label.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function FaqView() {
  return (
    <View style={styles.section}>
      <Text style={styles.heroTitleSmall}>FAQ</Text>
      <View style={styles.rows}>
        <FaqRow title="What is this game?" body="AI Companion is a story game where Guest cards become characters in relationship-driven chapters." />
        <FaqRow title="How do I start?" body="Sign in, add at least one Guest, press Start Now, and enter Chapter 1." />
        <FaqRow title="What is Workspace?" body="Workspace is your personal asset shelf for joined Guests, created Guests, unlocked companions, and story progress." />
        <FaqRow title="Why are later chapters locked?" body="Only Chapter 1 is playable in this pass. Later chapters will unlock after companion progress is connected." />
      </View>
    </View>
  );
}

function FaqRow({ body, title }: { body: string; title: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowMeta}>{body}</Text>
    </View>
  );
}

function ChapterOneView({
  availableGuests,
  compact,
  onBack,
  onFinalize,
  onInsertGuest,
  onMoreGuests,
  onRefreshSession,
  onRemoveGuest,
  onStart,
  onPreviewSpeech,
  onSubmitTurn,
  selectedGuestKeys,
  sessionState,
  slotCount,
  guestStreamingLines,
  turnSubmitting,
  workspaceState,
}: {
  availableGuests: Array<ShowGuest | WorkspaceGuest>;
  compact: boolean;
  onBack: () => void;
  onFinalize: (characterKey: string | null) => void;
  onInsertGuest: (guest: ShowGuest | WorkspaceGuest) => void;
  onMoreGuests: () => void;
  onRefreshSession: () => void;
  onRemoveGuest: (characterKey: string) => void;
  onStart: () => void;
  onPreviewSpeech: (input: {
    messageId?: string;
    speakerKey?: string | null;
    text?: string;
  }) => Promise<SpeechPreviewPayload>;
  onSubmitTurn: (input: {
    freeText: string;
    selectedCharacterKey?: string;
    selectedOptionId: string;
    turnId: string;
  }) => void;
  selectedGuestKeys: string[];
  sessionState: AsyncState<ShowSessionPayload>;
  slotCount: number;
  guestStreamingLines: Record<string, string>;
  turnSubmitting: boolean;
  workspaceState: AsyncState<ShowWorkspacePayload>;
}) {
  const selectedGuests = selectedGuestKeys
    .map((key) => availableGuests.find((guest) => guest.characterKey === key))
    .filter((guest): guest is ShowGuest | WorkspaceGuest => Boolean(guest));
  const started = sessionState.status === 'loading' || sessionState.status === 'ready';

  if (started) {
    return (
      <StorySessionPanel
        compact={compact}
        onBack={onBack}
        onFinalize={onFinalize}
        onPreviewSpeech={onPreviewSpeech}
        onRefresh={onRefreshSession}
        onSubmitTurn={onSubmitTurn}
        sessionState={sessionState}
        guestStreamingLines={guestStreamingLines}
        turnSubmitting={turnSubmitting}
      />
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(260)} layout={LinearTransition} style={styles.chapterOneShell}>
      <View style={styles.detailHero}>
        <View style={styles.blankChapterImage}>
          <Text style={styles.characterInitial}>1</Text>
        </View>
        <View style={styles.detailCopy}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Back home</Text>
          </Pressable>
          <Text style={styles.heroTitleSmall}>Chapter 1: Heart Signal Live</Text>
          <Text style={styles.heroBody}>Choose 1 to 5 Guests, then step into the opening dating-show story. You will introduce yourself inside the show.</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Guest lineup</Text>
          <Text style={styles.counterText}>{selectedGuestKeys.length}/{slotCount} selected</Text>
        </View>
        <ChapterOneLineupStage
          availableGuests={availableGuests}
          onInsertGuest={onInsertGuest}
          onMoreGuests={onMoreGuests}
          onRemoveGuest={onRemoveGuest}
          selectedGuests={selectedGuests}
          slotCount={slotCount}
          workspaceState={workspaceState}
        />
        <Pressable accessibilityRole="button" onPress={onStart} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Enter Chapter 1</Text>
        </Pressable>
        {sessionState.status === 'error' ? (
          <Text selectable style={styles.errorText}>{sessionState.message}</Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

function ChapterOneLineupStage({
  availableGuests,
  onInsertGuest,
  onMoreGuests,
  onRemoveGuest,
  selectedGuests,
  slotCount,
  workspaceState,
}: {
  availableGuests: Array<ShowGuest | WorkspaceGuest>;
  onInsertGuest: (guest: ShowGuest | WorkspaceGuest) => void;
  onMoreGuests: () => void;
  onRemoveGuest: (characterKey: string) => void;
  selectedGuests: Array<ShowGuest | WorkspaceGuest>;
  slotCount: number;
  workspaceState: AsyncState<ShowWorkspacePayload>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedKeySet = useMemo(() => new Set(selectedGuests.map((guest) => guest.characterKey)), [selectedGuests]);
  const slots = Array.from({ length: slotCount }, (_, index) => selectedGuests[index] ?? null);

  return (
    <View style={styles.lineupStage}>
      <View style={styles.slotGrid}>
        {slots.map((guest, index) => guest ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(160)}
            key={guest.characterKey}
            layout={LinearTransition}
            style={styles.lineupSlotFilled}>
            <GuestPortrait guest={guest} />
            <Text numberOfLines={1} style={styles.characterName}>{guest.name}</Text>
            <Text numberOfLines={1} style={styles.characterMeta}>{guestDefinition(guest)}</Text>
            <Pressable accessibilityRole="button" onPress={() => onRemoveGuest(guest.characterKey)} style={styles.removeSlotButton}>
              <Text style={styles.removeSlotButtonText}>Remove</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <Pressable
            accessibilityRole="button"
            key={`slot-${index}`}
            onPress={() => setPickerOpen(true)}
            style={styles.lineupSlotEmpty}>
            <Text style={styles.plusMark}>+</Text>
          </Pressable>
        ))}
      </View>

      <GuestPickerModal
        availableGuests={availableGuests}
        lineupFull={selectedGuests.length >= slotCount}
        onClose={() => setPickerOpen(false)}
        onJoin={(guest) => {
          onInsertGuest(guest);
          setPickerOpen(false);
        }}
        onMoreGuests={() => {
          setPickerOpen(false);
          onMoreGuests();
        }}
        open={pickerOpen}
        selectedKeySet={selectedKeySet}
        workspaceState={workspaceState}
      />
    </View>
  );
}

function GuestPickerModal({
  availableGuests,
  lineupFull,
  onClose,
  onJoin,
  onMoreGuests,
  open,
  selectedKeySet,
  workspaceState,
}: {
  availableGuests: Array<ShowGuest | WorkspaceGuest>;
  lineupFull: boolean;
  onClose: () => void;
  onJoin: (guest: ShowGuest | WorkspaceGuest) => void;
  onMoreGuests: () => void;
  open: boolean;
  selectedKeySet: Set<string>;
  workspaceState: AsyncState<ShowWorkspacePayload>;
}) {
  const [selectedGuestKey, setSelectedGuestKey] = useState<string>('');
  const selectedGuest = availableGuests.find((guest) => guest.characterKey === selectedGuestKey);
  const canJoin = Boolean(selectedGuest && !selectedKeySet.has(selectedGuest.characterKey) && !lineupFull);

  useEffect(() => {
    if (!open) {
      setSelectedGuestKey('');
    }
  }, [open]);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.modalBackdrop}>
        <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOut.duration(140)} style={styles.guestPickerModal}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.eyebrow}>Workspace assets</Text>
              <Text style={styles.sectionTitle}>Choose a Guest</Text>
            </View>
          </View>

          {workspaceState.status === 'loading' ? (
            <EmptyState title="Loading Workspace" body="Fetching Guests you already own." />
          ) : availableGuests.length ? (
            <View style={styles.pickerGrid}>
              {availableGuests.map((guest) => {
                const alreadySelected = selectedKeySet.has(guest.characterKey);
                const active = selectedGuestKey === guest.characterKey;
                return (
                  <Pressable
                    accessibilityRole="button"
                    disabled={alreadySelected}
                    key={guest.characterKey}
                    onPress={() => setSelectedGuestKey(guest.characterKey)}
                    style={[
                      styles.pickerGuestCard,
                      active && styles.pickerGuestCardActive,
                      alreadySelected && styles.guestCardSelected,
                    ]}>
                    <GuestMiniPortrait guest={guest} />
                    <View style={styles.pickerGuestCopy}>
                      <Text numberOfLines={1} style={styles.characterName}>{guest.name}</Text>
                      <Text numberOfLines={2} style={styles.characterTraits}>{guestDefinition(guest)}</Text>
                      <Text numberOfLines={1} style={styles.characterMeta}>{alreadySelected ? 'Already in lineup' : guestPublisher(guest)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyInline}>
              <Text style={styles.rowTitle}>No Workspace Guests yet</Text>
              <Text style={styles.rowMeta}>Add a Guest from the homepage before entering Chapter 1.</Text>
              <Pressable accessibilityRole="button" onPress={onMoreGuests} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>More Guests</Text>
              </Pressable>
            </View>
          )}

          {lineupFull ? <Text selectable style={styles.errorText}>The lineup is full. Remove a Guest before adding another.</Text> : null}
          <View style={styles.modalFooterActions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!canJoin}
              onPress={() => selectedGuest && onJoin(selectedGuest)}
              style={[styles.primaryButton, !canJoin && styles.disabledAction]}>
              <Text style={styles.primaryButtonText}>Join</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function StorySessionPanel({
  compact,
  onBack,
  onFinalize,
  onPreviewSpeech,
  onRefresh,
  onSubmitTurn,
  sessionState,
  guestStreamingLines,
  turnSubmitting,
}: {
  compact: boolean;
  onBack: () => void;
  onFinalize: (characterKey: string | null) => void;
  onPreviewSpeech: (input: {
    messageId?: string;
    speakerKey?: string | null;
    text?: string;
  }) => Promise<SpeechPreviewPayload>;
  onRefresh: () => void;
  onSubmitTurn: (input: {
    freeText: string;
    selectedCharacterKey?: string;
    selectedOptionId: string;
    turnId: string;
  }) => void;
  sessionState: AsyncState<ShowSessionPayload>;
  guestStreamingLines: Record<string, string>;
  turnSubmitting: boolean;
}) {
  const payload = sessionState.status === 'ready' ? sessionState.data : null;
  const currentTurn = payload?.currentTurn ?? null;
  const [freeText, setFreeText] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedCharacterKey, setSelectedCharacterKey] = useState<string | undefined>();
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [selfIntroProfile, setSelfIntroProfile] = useState({ ageRange: '', hobbies: '', occupation: '' });
  useEffect(() => {
    setFreeText('');
    setSelectedOptionId(currentTurn?.options[0]?.id ?? '');
    setSelectedCharacterKey(currentTurn?.stageKey === 'initial_pick' ? payload?.guests[0]?.characterKey : undefined);
    setSelfIntroProfile({ ageRange: '', hobbies: '', occupation: '' });
  }, [currentTurn?.id, currentTurn?.stageKey, payload?.guests]);

  if (sessionState.status === 'idle') {
    return null;
  }

  if (sessionState.status === 'loading') {
    return (
      <Animated.View entering={FadeIn.duration(220)} style={[styles.gameStage, compact && styles.gameStageCompact]}>
        <Image contentFit="cover" source={imageSourceForObjectKey('apps/ai-tv-dating/backgrounds/studio.png')} style={styles.stageBackgroundImage} />
        <View style={styles.stageScrim} />
        <View style={styles.stageLoadingPanel}>
          <Text style={styles.eyebrowLight}>Chapter 1</Text>
          <Text style={styles.stageTitle}>Preparing Heart Signal Live</Text>
          <Text style={styles.stageSubtitle}>Creating your show session and guest lineup.</Text>
        </View>
      </Animated.View>
    );
  }

  if (sessionState.status === 'error') {
    return <EmptyState title="Chapter unavailable" body={sessionState.message} />;
  }

  if (sessionState.status !== 'ready') {
    return null;
  }

  if (!payload) {
    return null;
  }

  const opening = payload.messages[0];
  const finalChoiceReady = payload.session.currentStage === 'final_choice';
  const completed = payload.session.status === 'completed';
  const availableGuests = payload.guests.filter((guest) => guest.available);
  const backgroundSource = imageSourceForObjectKey(payload.show.backgroundImageKey ?? 'apps/ai-tv-dating/backgrounds/studio.png');
  const hostStreamingText = guestStreamingLines['host'] ?? null;
  const hostPrompt = hostStreamingText
    ? hostStreamingText
    : currentTurn?.question ?? null;
  const canSubmitTurn = Boolean(
    currentTurn &&
    selectedOptionId &&
    selectedCharacterKey &&
    currentTurn.stageKey === 'initial_pick',
  ) && !turnSubmitting;

  return (
    <Animated.View entering={FadeIn.duration(240)} layout={LinearTransition} style={[styles.gameStage, compact && styles.gameStageCompact]}>
      <View style={styles.stageVisualPane}>
        {backgroundSource ? <Image contentFit="cover" source={backgroundSource} style={styles.stageBackgroundImage} /> : null}
        <View style={styles.stageScrim} />
        <View style={styles.stageTopbar}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.stageGhostButton}>
            <Text style={styles.stageGhostButtonText}>Back</Text>
          </Pressable>
          <View style={styles.stageTopbarActions}>
            <Pressable accessibilityRole="button" onPress={() => setHistoryOpen(true)} style={styles.stageGhostButton}>
              <Text style={styles.stageGhostButtonText}>History</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onRefresh} style={styles.stageGhostButton}>
              <Text style={styles.stageGhostButtonText}>Refresh</Text>
            </Pressable>
          </View>
        </View>

        {hostPrompt ? (
          <Animated.View entering={FadeInDown.duration(180)} style={styles.hostCueCard}>
            <SpeakerAvatar fallbackName="Host" payload={payload} speakerKey="host" />
            <View style={styles.hostCueCopy}>
              <Text style={styles.hostCueName}>Host cue</Text>
              <Text numberOfLines={3} style={styles.hostCueText}>{hostPrompt}</Text>
            </View>
          </Animated.View>
        ) : null}

        <GuestStagePanel
          guestStreamingLines={guestStreamingLines}
          guests={payload.guests}
          guestStates={payload.guestStates}
          messages={payload.messages}
          turnSubmitting={turnSubmitting}
        />
      </View>

      <View style={[styles.stageInteractionPane, compact && styles.stageInteractionPaneCompact]}>
        <ScrollView
          contentContainerStyle={styles.stageInteractionContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.eyebrow}>Heart Signal Live</Text>
              <Text style={styles.sectionTitle}>Your move</Text>
            </View>
          </View>

          {completed ? (
            <View style={styles.resultPanel}>
              <Text style={styles.rowTitle}>{payload.session.matchSuccess ? 'Companion unlocked' : 'Episode complete'}</Text>
              <Text style={styles.rowMeta}>{payload.session.resultSummary ?? 'The first episode has ended.'}</Text>
            </View>
          ) : finalChoiceReady ? (
            <View style={styles.turnPanel}>
              <Text style={styles.rowTitle}>Final choice</Text>
              <Text style={styles.rowMeta}>Choose one available Guest, or walk away clean.</Text>
              <View style={styles.optionGrid}>
                {availableGuests.map((guest) => (
                  <Pressable
                    accessibilityRole="button"
                    key={guest.characterKey}
                    onPress={() => onFinalize(guest.characterKey)}
                    style={styles.optionButton}>
                    <View style={styles.optionGuestHeader}>
                    <SessionGuestAvatar guest={guest} />
                    <View style={styles.optionGuestCopy}>
                      <Text style={styles.optionTitle}>{guest.name}</Text>
                      <Text style={styles.optionPreview}>{guest.profile.occupationTag ?? 'Invite to the final spotlight'}</Text>
                      <AttractionProgress value={guestStateFor(payload, guest.characterKey)?.affinityScore ?? 50} />
                      {guestStateFor(payload, guest.characterKey)?.lastReason ? (
                        <Text numberOfLines={2} style={styles.optionReasonText}>{guestStateFor(payload, guest.characterKey)?.lastReason}</Text>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
                ))}
                <Pressable accessibilityRole="button" onPress={() => onFinalize(null)} style={styles.optionButtonMuted}>
                  <Text style={styles.optionTitle}>Walk away</Text>
                  <Text style={styles.optionPreview}>End the episode without forcing a match.</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {currentTurn && !completed && !finalChoiceReady ? (
            <View style={styles.turnPanel}>
              <View style={styles.currentPromptCard}>
                <SpeakerAvatar fallbackName={currentTurn.speakerName} payload={payload} speakerKey={currentTurn.speakerKey} />
                <View style={styles.currentPromptCopy}>
                  <Text style={styles.eventSpeaker}>{currentTurn.speakerName}</Text>
                  <Text style={styles.currentPromptText}>{currentTurn.question}</Text>
                </View>
              </View>

              {/* initial_pick: choose a guest */}
              {currentTurn.stageKey === 'initial_pick' ? (
                <>
                  <View style={styles.optionGrid}>
                    {payload.guests.map((guest) => (
                      <Pressable
                        accessibilityRole="button"
                        key={guest.characterKey}
                        onPress={() => setSelectedCharacterKey(guest.characterKey)}
                        style={[styles.optionButton, selectedCharacterKey === guest.characterKey && styles.optionButtonSelected]}>
                        <View style={styles.optionGuestHeader}>
                          <SessionGuestAvatar guest={guest} />
                          <View style={styles.optionGuestCopy}>
                            <Text style={styles.optionTitle}>{guest.name}</Text>
                            <Text style={styles.optionPreview}>{guest.profile.occupationTag ?? 'First heartbeat'}</Text>
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.optionGrid}>
                    {currentTurn.options.map((option) => (
                      <Pressable
                        accessibilityRole="button"
                        key={option.id}
                        onPress={() => setSelectedOptionId(option.id)}
                        style={[styles.optionButton, selectedOptionId === option.id && styles.optionButtonSelected]}>
                        <Text style={styles.optionTitle}>{option.label}</Text>
                        <Text style={styles.optionPreview}>{option.preview}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    multiline
                    onChangeText={setFreeText}
                    placeholder="Add your own words..."
                    placeholderTextColor="#8b8f98"
                    style={[styles.input, styles.storyInput]}
                    value={freeText}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canSubmitTurn}
                    onPress={() => currentTurn && onSubmitTurn({ freeText, selectedCharacterKey, selectedOptionId, turnId: currentTurn.id })}
                    style={[styles.primaryButton, styles.turnSubmitButton, !canSubmitTurn && styles.disabledAction]}>
                    <Text style={styles.primaryButtonText}>{turnSubmitting ? 'Streaming...' : 'Choose this guest'}</Text>
                  </Pressable>
                </>
              ) : null}

              {/* self_intro: profile form inside the game */}
              {currentTurn.stageKey === 'self_intro' ? (
                <>
                  <View style={styles.formGrid}>
                    <LabeledInput
                      label="Age range"
                      onChangeText={(ageRange) => setSelfIntroProfile((p) => ({ ...p, ageRange }))}
                      placeholder="25-35"
                      value={selfIntroProfile.ageRange}
                    />
                    <LabeledInput
                      label="Occupation"
                      onChangeText={(occupation) => setSelfIntroProfile((p) => ({ ...p, occupation }))}
                      placeholder="designer, student, founder..."
                      value={selfIntroProfile.occupation}
                    />
                    <LabeledInput
                      label="Hobbies"
                      onChangeText={(hobbies) => setSelfIntroProfile((p) => ({ ...p, hobbies }))}
                      placeholder="music, cooking, hiking..."
                      value={selfIntroProfile.hobbies}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={turnSubmitting || (!selfIntroProfile.ageRange.trim() && !selfIntroProfile.occupation.trim())}
                    onPress={() => currentTurn && onSubmitTurn({
                      freeText: JSON.stringify(selfIntroProfile),
                      selectedOptionId: '',
                      turnId: currentTurn.id,
                    })}
                    style={[styles.primaryButton, styles.turnSubmitButton, (turnSubmitting || (!selfIntroProfile.ageRange.trim() && !selfIntroProfile.occupation.trim())) && styles.disabledAction]}>
                    <Text style={styles.primaryButtonText}>{turnSubmitting ? 'Streaming...' : 'Introduce myself'}</Text>
                  </Pressable>
                </>
              ) : null}

              {/* guest_questions: answer + move-on button */}
              {currentTurn.stageKey === 'guest_questions' ? (
                <>
                  <View style={styles.optionGrid}>
                    {currentTurn.options.filter((o) => o.id !== 'move_on').map((option) => (
                      <Pressable
                        accessibilityRole="button"
                        key={option.id}
                        onPress={() => setSelectedOptionId(option.id)}
                        style={[styles.optionButton, selectedOptionId === option.id && styles.optionButtonSelected]}>
                        <Text style={styles.optionTitle}>{option.label}</Text>
                        <Text style={styles.optionPreview}>{option.preview}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    multiline
                    onChangeText={setFreeText}
                    placeholder="Add your own words..."
                    placeholderTextColor="#8b8f98"
                    style={[styles.input, styles.storyInput]}
                    value={freeText}
                  />
                  <View style={styles.turnButtonRow}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!canSubmitTurn}
                      onPress={() => currentTurn && onSubmitTurn({ freeText, selectedOptionId, turnId: currentTurn.id })}
                      style={[styles.primaryButton, styles.turnSubmitButton, styles.turnButtonFlex, !canSubmitTurn && styles.disabledAction]}>
                      <Text style={styles.primaryButtonText}>{turnSubmitting ? 'Streaming...' : 'Send answer'}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={turnSubmitting}
                      onPress={() => currentTurn && onSubmitTurn({ freeText: '', selectedOptionId: 'move_on', turnId: currentTurn.id })}
                      style={[styles.secondaryButton, styles.turnButtonFlex, turnSubmitting && styles.disabledAction]}>
                      <Text style={styles.secondaryButtonText}>Ask my questions →</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}

              {/* user_questions: pick guest + ask question */}
              {currentTurn.stageKey === 'user_questions' ? (
                <>
                  <Text style={styles.rowMeta}>Pick a guest and ask them anything.</Text>
                  <View style={styles.optionGrid}>
                    {payload.guests.filter((g) => g.available).map((guest) => (
                      <Pressable
                        accessibilityRole="button"
                        key={guest.characterKey}
                        onPress={() => setSelectedCharacterKey(guest.characterKey)}
                        style={[styles.optionButton, selectedCharacterKey === guest.characterKey && styles.optionButtonSelected]}>
                        <View style={styles.optionGuestHeader}>
                          <SessionGuestAvatar guest={guest} />
                          <View style={styles.optionGuestCopy}>
                            <Text style={styles.optionTitle}>{guest.name}</Text>
                            <Text style={styles.optionPreview}>{guest.profile.occupationTag ?? 'Ask anything'}</Text>
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    multiline
                    onChangeText={setFreeText}
                    placeholder="Ask anything..."
                    placeholderTextColor="#8b8f98"
                    style={[styles.input, styles.storyInput]}
                    value={freeText}
                  />
                  <View style={styles.turnButtonRow}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={turnSubmitting || !freeText.trim() || !selectedCharacterKey}
                      onPress={() => currentTurn && onSubmitTurn({ freeText, selectedCharacterKey, selectedOptionId: '', turnId: currentTurn.id })}
                      style={[styles.primaryButton, styles.turnSubmitButton, styles.turnButtonFlex, (turnSubmitting || !freeText.trim() || !selectedCharacterKey) && styles.disabledAction]}>
                      <Text style={styles.primaryButtonText}>{turnSubmitting ? 'Streaming...' : 'Ask this guest'}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={turnSubmitting}
                      onPress={() => currentTurn && onSubmitTurn({ freeText: '', selectedOptionId: 'move_to_final', turnId: currentTurn.id })}
                      style={[styles.secondaryButton, styles.turnButtonFlex, turnSubmitting && styles.disabledAction]}>
                      <Text style={styles.secondaryButtonText}>Make my choice →</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </View>

      <Modal animationType="fade" transparent visible={historyOpen}>
        <View style={styles.modalBackdrop}>
          <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOut.duration(140)} style={styles.historyPanel}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.eyebrow}>Live room</Text>
                <Text style={styles.modalTitle}>Conversation history</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setHistoryOpen(false)} style={styles.linkButton}>
                <Text style={styles.linkButtonText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.historyScrollContent} nestedScrollEnabled showsVerticalScrollIndicator>
              <SpeakerMessageList guestStreamingLines={guestStreamingLines} payload={payload} streaming={turnSubmitting} />
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </Animated.View>
  );
}

function GuestStatusRail({
  activeSpeakerKey,
  payload,
}: {
  activeSpeakerKey: string | null;
  payload: ShowSessionPayload;
}) {
  return (
    <View style={styles.guestStatusRail}>
      {payload.guests.map((guest) => {
        const character = payload.characters.find((item) => item.characterKey === guest.characterKey);
        const active = activeSpeakerKey === guest.characterKey;
        const lightState = character?.lightState ?? 'on';
        const guestState = guestStateFor(payload, guest.characterKey);
        return (
          <View key={guest.characterKey} style={[styles.guestStatusCard, active && styles.guestStatusCardActive, !guest.available && styles.guestStatusCardMuted]}>
            <SessionGuestAvatar guest={guest} />
            <View style={styles.guestStatusCopy}>
              <Text numberOfLines={1} style={styles.guestStatusName}>{guest.name}</Text>
              <AttractionProgress value={guestState?.affinityScore ?? (character?.lightState === 'blow_up' ? 100 : 50)} />
              <View style={styles.lightStateRow}>
                <View style={[
                  styles.lightDot,
                  lightState === 'blow_up' ? styles.lightDotHot : lightState === 'off' ? styles.lightDotOff : styles.lightDotOn,
                ]} />
                <Text style={styles.guestStatusMeta}>
                  {guest.available ? lightState : 'off'} {formatDelta(guestState?.lastDelta ?? 0)}
                </Text>
              </View>
              {guestState?.lastReason ? (
                <Text numberOfLines={2} style={styles.guestReasonText}>{guestState.lastReason}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function AttractionProgress({ value }: { value: number }) {
  const width = `${Math.min(100, Math.max(0, value))}%` as DimensionValue;
  return (
    <View style={styles.attractionTrack}>
      <View style={[styles.attractionFill, { width }]} />
    </View>
  );
}

function SpeakerMessageList({
  guestStreamingLines,
  payload,
  streaming,
}: {
  guestStreamingLines: Record<string, string>;
  payload: ShowSessionPayload;
  streaming: boolean;
}) {
  const rows = payload.messages.slice(-30).map((message) => ({
    content: message.content,
    id: message.id,
    speakerKey: message.speakerKey,
    speakerName: message.speakerName,
    type: message.role,
  }));

  return (
    <View style={styles.eventList}>
      <Text style={styles.eventListTitle}>Live room</Text>
      {rows.map((row) => (
        <View key={row.id} style={styles.speakerMessageRow}>
          <SpeakerAvatar fallbackName={row.speakerName} payload={payload} speakerKey={row.speakerKey} />
          <View style={styles.speakerMessageBubble}>
            <View style={styles.messageMetaRow}>
              <Text style={styles.eventSpeaker}>{row.speakerName}</Text>
              <Text style={styles.messageTypeText}>{row.type}</Text>
            </View>
            <Text style={styles.eventText}>{row.content}</Text>
          </View>
        </View>
      ))}
      {streaming && Object.entries(guestStreamingLines).map(([speakerKey, text]) => (
        <View key={`streaming-${speakerKey}`} style={styles.speakerMessageRow}>
          <SpeakerAvatar fallbackName={speakerKey} payload={payload} speakerKey={speakerKey} />
          <View style={[styles.speakerMessageBubble, styles.streamingBubble]}>
            <Text style={styles.eventSpeaker}>Live typing</Text>
            <Text style={styles.eventText}>{text || 'Thinking through the room...'}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function SpeakerAvatar({
  fallbackName,
  payload,
  speakerKey,
}: {
  fallbackName: string;
  payload: ShowSessionPayload;
  speakerKey: string | null;
}) {
  const speaker = speakerKey ? resolveSessionSpeaker(payload, speakerKey) : null;
  const source = speaker ? imageSourceForCharacter(speaker.characterKey, speaker.avatarObjectKey ?? speaker.profile.avatarObjectKey) : null;
  const label = speaker?.name ?? fallbackName;

  return source ? (
    <Image contentFit="cover" source={source} style={styles.speakerAvatarImage} />
  ) : (
    <View style={styles.speakerAvatarFallback}>
      <Text style={styles.speakerAvatarInitial}>{label.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function GuestStagePanel({
  guestStreamingLines,
  guests,
  guestStates,
  messages,
  turnSubmitting,
}: {
  guestStreamingLines: Record<string, string>;
  guests: ShowSessionPayload['guests'];
  guestStates: ShowSessionPayload['guestStates'];
  messages: ShowSessionPayload['messages'];
  turnSubmitting: boolean;
}) {
  const useFan = guests.length > 4;
  if (useFan) {
    return (
      <GuestFanLayout
        guestStreamingLines={guestStreamingLines}
        guests={guests}
        guestStates={guestStates}
        messages={messages}
        turnSubmitting={turnSubmitting}
      />
    );
  }
  return (
    <GuestRowLayout
      guestStreamingLines={guestStreamingLines}
      guests={guests}
      guestStates={guestStates}
      messages={messages}
      turnSubmitting={turnSubmitting}
    />
  );
}

function GuestRowLayout({
  guestStreamingLines,
  guests,
  guestStates,
  messages,
  turnSubmitting,
}: {
  guestStreamingLines: Record<string, string>;
  guests: ShowSessionPayload['guests'];
  guestStates: ShowSessionPayload['guestStates'];
  messages: ShowSessionPayload['messages'];
  turnSubmitting: boolean;
}) {
  return (
    <View style={styles.guestRowContainer}>
      {guests.map((guest) => {
        const state = guestStates.find((s) => s.characterKey === guest.characterKey);
        const latest = [...messages].reverse().find((m) => m.speakerKey === guest.characterKey);
        const streamingText = guestStreamingLines[guest.characterKey] ?? null;
        const bubbleText = turnSubmitting && streamingText ? streamingText : (latest?.content ?? null);
        return (
          <GuestCell
            key={guest.characterKey}
            bubbleText={bubbleText}
            characterKey={guest.characterKey}
            isStreaming={turnSubmitting && Boolean(streamingText)}
            name={guest.name}
            portraitKey={guest.profile.avatarObjectKey}
            state={state}
          />
        );
      })}
    </View>
  );
}

function GuestFanLayout({
  guestStreamingLines,
  guests,
  guestStates,
  messages,
  turnSubmitting,
}: {
  guestStreamingLines: Record<string, string>;
  guests: ShowSessionPayload['guests'];
  guestStates: ShowSessionPayload['guestStates'];
  messages: ShowSessionPayload['messages'];
  turnSubmitting: boolean;
}) {
  const [size, setSize] = useState({ height: 0, width: 0 });
  const count = guests.length;
  const fanAngles = count === 5
    ? [-64, -32, 0, 32, 64]
    : count === 4
      ? [-48, -16, 16, 48]
      : count === 3
        ? [-36, 0, 36]
        : count === 2
          ? [-24, 24]
          : [0];
  const radius = 160;
  const CELL_W = 110;
  const CELL_H = 260;
  const centerX = size.width / 2;
  const centerY = size.height - 20;

  return (
    <View
      onLayout={(e) => setSize({ height: e.nativeEvent.layout.height, width: e.nativeEvent.layout.width })}
      style={styles.guestFanContainer}>
      {size.width > 0 && guests.map((guest, i) => {
        const angleDeg = fanAngles[i] ?? 0;
        const angleRad = (angleDeg * Math.PI) / 180;
        const x = centerX + radius * Math.sin(angleRad) - CELL_W / 2;
        const y = centerY - radius * Math.cos(angleRad) - CELL_H;
        const state = guestStates.find((s) => s.characterKey === guest.characterKey);
        const latest = [...messages].reverse().find((m) => m.speakerKey === guest.characterKey);
        const streamingText = guestStreamingLines[guest.characterKey] ?? null;
        const bubbleText = turnSubmitting && streamingText ? streamingText : (latest?.content ?? null);
        return (
          <View key={guest.characterKey} style={[styles.guestFanCell, { left: x, top: y }]}>
            <GuestCell
              bubbleText={bubbleText}
              characterKey={guest.characterKey}
              isStreaming={turnSubmitting && Boolean(streamingText)}
              name={guest.name}
              portraitKey={guest.profile.avatarObjectKey}
              state={state}
            />
          </View>
        );
      })}
    </View>
  );
}

function GuestCell({
  bubbleText,
  characterKey,
  isStreaming,
  name,
  portraitKey,
  state,
}: {
  bubbleText: string | null;
  characterKey: string;
  isStreaming: boolean;
  name: string;
  portraitKey: string | null | undefined;
  state: ShowSessionPayload['guestStates'][number] | undefined;
}) {
  const source = imageSourceForCharacter(characterKey, portraitKey);
  const lightState = state?.lightState ?? 'on';
  const affinityWidth = `${Math.min(100, Math.max(0, state?.affinityScore ?? 50))}%` as DimensionValue;

  return (
    <View style={styles.guestCell}>
      {source ? (
        <Image contentFit="cover" source={source} style={styles.guestPortrait} />
      ) : (
        <View style={styles.guestPortraitFallback}>
          <Text style={styles.guestPortraitInitial}>{name.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.guestInfoBar}>
        <View style={[
          styles.guestLightDot,
          lightState === 'blow_up' ? styles.lightDotHot : lightState === 'off' ? styles.lightDotOff : styles.lightDotOn,
        ]} />
        <Text numberOfLines={1} style={styles.guestNameLabel}>{name}</Text>
      </View>
      <View style={styles.guestAffinityTrack}>
        <View style={[styles.guestAffinityFill, { width: affinityWidth }]} />
      </View>
      <GuestBubble isStreaming={isStreaming} text={bubbleText} />
    </View>
  );
}

function GuestBubble({ isStreaming, text }: { isStreaming: boolean; text: string | null }) {
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    if (!isStreaming) {
      return;
    }
    const id = setInterval(() => setCursorVisible((v) => !v), 500);
    return () => clearInterval(id);
  }, [isStreaming]);

  if (!text) {
    return null;
  }

  return (
    <Animated.View entering={FadeInDown.duration(160)} style={styles.guestBubble}>
      <Text numberOfLines={3} style={styles.guestBubbleText}>
        {text}{isStreaming ? (cursorVisible ? '|' : ' ') : ''}
      </Text>
    </Animated.View>
  );
}

function SessionGuestAvatar({ guest }: { guest: ShowSessionPayload['guests'][number] }) {
  const source = imageSourceForCharacter(guest.characterKey, guest.profile.avatarObjectKey);
  return source ? (
    <Image contentFit="cover" source={source} style={styles.sessionGuestAvatar} />
  ) : (
    <View style={styles.sessionGuestAvatarFallback}>
      <Text style={styles.characterMiniInitial}>{guest.name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function ChapterModal({ onClose, onEnter }: { onClose: () => void; onEnter: () => void }) {
  return (
    <View style={styles.modalBackdrop}>
      <View style={styles.chapterPanel}>
        <View style={styles.sectionHeader}>
          <Text style={styles.modalTitle}>Choose a chapter</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Close</Text>
          </Pressable>
        </View>
        <View style={styles.chapterGrid}>
          <ChapterCard index="1" locked={false} onPress={onEnter} title="Heart Signal Live" />
          <ChapterCard index="2" locked title="Afterparty" />
          <ChapterCard index="3" locked title="Solo Story" />
        </View>
      </View>
    </View>
  );
}

function ChapterCard({
  index,
  locked,
  onPress,
  title,
}: {
  index: string;
  locked: boolean;
  onPress?: () => void;
  title: string;
}) {
  return (
    <View style={[styles.chapterCard, locked && styles.chapterCardLocked]}>
      <View style={styles.blankChapterImage}>
        <Text style={styles.characterInitial}>{index}</Text>
      </View>
      <Text style={styles.characterName}>{title}</Text>
      <Text style={styles.characterMeta}>{locked ? 'Locked' : 'Available now'}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={locked}
        onPress={onPress}
        style={[styles.characterCardAction, locked && styles.disabledAction]}>
        <Text style={styles.characterCardActionText}>{locked ? 'Locked' : 'Enter'}</Text>
      </Pressable>
    </View>
  );
}

function LabeledInput({
  label,
  onChangeText,
  placeholder,
  value,
}: {
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8290A3"
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function GuestPortrait({ guest }: { guest: ShowGuest | WorkspaceGuest }) {
  const source = imageSourceForGuest(guest);
  return source ? (
    <Image contentFit="cover" source={source} style={styles.characterImage} />
  ) : (
    <View style={styles.characterFallback}>
      <Text style={styles.characterInitial}>{guest.name.slice(0, 1)}</Text>
    </View>
  );
}

function GuestMiniPortrait({ guest }: { guest: ShowGuest | WorkspaceGuest }) {
  const source = imageSourceForGuest(guest);
  return source ? (
    <Image contentFit="cover" source={source} style={styles.characterMiniImage} />
  ) : (
    <View style={styles.characterMiniFallback}>
      <Text style={styles.characterMiniInitial}>{guest.name.slice(0, 1)}</Text>
    </View>
  );
}

function imageSourceForGuest(guest: ShowGuest | WorkspaceGuest) {
  return imageSourceForObjectKey(guest.visualStateObjectKey ?? guest.portraitObjectKey ?? guest.avatarObjectKey) ??
    imageSourceForCharacter(guest.characterKey, null);
}

function imageSourceForCharacter(characterKey: string, objectKey: string | null | undefined) {
  return imageSourceForObjectKey(objectKey ?? null) ??
    DEFAULT_CHARACTER_ASSET_MAP[characterKey as keyof typeof DEFAULT_CHARACTER_ASSET_MAP] ??
    null;
}

function imageSourceForObjectKey(key: string | null | undefined) {
  if (!key) {
    return null;
  }

  return DEFAULT_SHOW_ASSET_MAP[key as keyof typeof DEFAULT_SHOW_ASSET_MAP] ?? { uri: objectUrl(key) };
}

function resolveSessionSpeaker(payload: ShowSessionPayload, speakerKey: string | null | undefined) {
  const key = speakerKey ?? 'host';
  const speaker = payload.characters.find((character) => character.characterKey === key);
  if (speaker) {
    return speaker;
  }

  return key === 'host' || !speakerKey
    ? payload.characters.find((character) => character.role === 'host') ?? null
    : null;
}


function latestMessageForSpeaker(payload: ShowSessionPayload, speakerKey: string | null | undefined) {
  if (!speakerKey) {
    return null;
  }

  return [...payload.messages].reverse().find((message) => message.speakerKey === speakerKey) ?? null;
}

function guestStateFor(payload: ShowSessionPayload, characterKey: string) {
  return payload.guestStates.find((state) => state.characterKey === characterKey);
}

function formatDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }

  return value < 0 ? String(value) : '0';
}

function uniqueGuests<T extends ShowGuest | WorkspaceGuest>(guests: T[]): T[] {
  const seen = new Set<string>();
  return guests.filter((guest) => {
    if (seen.has(guest.characterKey)) {
      return false;
    }

    seen.add(guest.characterKey);
    return true;
  });
}

function clampSlotCount(value: number | undefined): number {
  const parsed = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CHAPTER_ONE_SLOT_COUNT;
  }

  return Math.min(DEFAULT_CHAPTER_ONE_SLOT_COUNT, Math.max(1, Math.round(parsed)));
}

function pickImageFile(): Promise<(Blob & { name?: string; type?: string }) | null> {
  if (typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
}

function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text selectable style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

function SignInOverlay({
  draftEmail,
  onChangeDraft,
  onClose,
  onSubmit,
  signingIn,
}: {
  draftEmail: string;
  onChangeDraft: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  signingIn: boolean;
}) {
  return (
    <View style={styles.modalBackdrop}>
      <View style={styles.signInPanel}>
        <Text style={styles.modalTitle}>Sign in</Text>
        <Text style={styles.modalBody}>Enter your email to save Guest assets, Workspace, and story progress.</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onChangeDraft}
          onSubmitEditing={onSubmit}
          placeholder="you@example.com"
          placeholderTextColor="#96A0AD"
          style={styles.input}
          value={draftEmail}
        />
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={signingIn} onPress={onSubmit} style={[styles.primaryButton, signingIn && styles.disabledAction]}>
            <Text style={styles.primaryButtonText}>{signingIn ? 'Signing in...' : 'Continue'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function guestDefinition(guest: ShowGuest): string {
  const traits = guest.personalityKeywords.length ? guest.personalityKeywords.join(', ') : '';
  return traits || guest.occupationTag || guest.ageRange || 'Guest character ready for Chapter 1.';
}

function guestPublisher(guest: ShowGuest): string {
  if (guest.source === 'official') {
    return 'System preset';
  }

  return guest.visibility === 'public' ? 'Community Guest' : 'Your Guest';
}

const colors = {
  aqua: '#78CED7',
  blush: '#F7C7D4',
  border: '#DDE3EA',
  clay: '#C37A5A',
  ink: '#17202B',
  leaf: '#477C61',
  muted: '#637184',
  paper: '#FFFFFF',
  sand: '#F7F1E8',
  softBlue: '#ECF7FF',
  softGreen: '#EAF6EF',
  softPink: '#FFF0F5',
};

const styles = StyleSheet.create({
  accountActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  blankChapterImage: {
    alignItems: 'center',
    backgroundColor: colors.sand,
    borderColor: '#E3D4BF',
    borderRadius: 8,
    borderWidth: 1,
    height: 150,
    justifyContent: 'center',
    width: '100%',
  },
  attractionFill: {
    backgroundColor: colors.blush,
    borderRadius: 999,
    height: '100%',
  },
  attractionTrack: {
    backgroundColor: '#EEF2F7',
    borderRadius: 999,
    height: 7,
    overflow: 'hidden',
    width: '100%',
  },
  brand: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  brandBlock: {
    gap: 1,
    minWidth: 150,
  },
  brandSub: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  characterCardAction: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 8,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  characterCardActionAdded: {
    backgroundColor: colors.softGreen,
    borderColor: '#B9D9C6',
    borderWidth: 1,
  },
  characterCardActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  characterCardActionTextAdded: {
    color: colors.leaf,
  },
  characterFallback: {
    alignItems: 'center',
    backgroundColor: colors.softPink,
    borderColor: colors.blush,
    borderRadius: 8,
    borderWidth: 1,
    height: 148,
    justifyContent: 'center',
    width: '100%',
  },
  characterImage: {
    backgroundColor: colors.softBlue,
    borderRadius: 8,
    height: 148,
    width: '100%',
  },
  characterImagePlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.softBlue,
    borderColor: colors.aqua,
    borderRadius: 8,
    borderWidth: 1,
    height: 148,
    justifyContent: 'center',
    width: '100%',
  },
  characterInitial: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '900',
  },
  characterMiniFallback: {
    alignItems: 'center',
    backgroundColor: colors.softPink,
    borderColor: colors.blush,
    borderRadius: 8,
    borderWidth: 1,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  characterMiniImage: {
    backgroundColor: colors.softBlue,
    borderRadius: 8,
    height: 76,
    width: 76,
  },
  characterMiniInitial: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  characterMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  characterName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  characterTraits: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    minHeight: 36,
  },
  chapterCard: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 190,
    flexGrow: 1,
    gap: 8,
    padding: 10,
  },
  chapterCardLocked: {
    opacity: 0.62,
  },
  chapterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chapterPanel: {
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 16,
    maxWidth: 760,
    padding: 18,
    width: '100%',
  },
  chapterOneShell: {
    gap: 24,
  },
  counterText: {
    color: colors.muted,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  currentPromptCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.softBlue,
    borderColor: '#C7E7EF',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  currentPromptCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  currentPromptText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  dataRow: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  detailCopy: {
    flex: 1,
    gap: 12,
    minWidth: 0,
  },
  detailHero: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    padding: 16,
  },
  disabledAction: {
    backgroundColor: '#D7DEE8',
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 16,
    width: '100%',
  },
  emptyInline: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  eventList: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 12,
  },
  eventListTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  eventRow: {
    gap: 2,
  },
  eventSpeaker: {
    color: '#145D67',
    fontSize: 12,
    fontWeight: '900',
  },
  eventText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: '#A33D3D',
    fontSize: 13,
    fontWeight: '800',
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  eyebrowLight: {
    color: '#DDF6FA',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  guestStatusCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 7,
    width: 190,
  },
  guestStatusCardActive: {
    backgroundColor: colors.softPink,
    borderColor: colors.blush,
  },
  guestStatusCardMuted: {
    opacity: 0.58,
  },
  guestStatusCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  guestStatusMeta: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  guestStatusName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  guestReasonText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  guestStatusRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  guestCard: {
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 210,
    flexGrow: 1,
    gap: 8,
    maxWidth: 280,
    padding: 10,
  },
  guestCardCompact: {
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 190,
    flexGrow: 1,
    gap: 8,
    maxWidth: 250,
    padding: 10,
  },
  guestCardSelected: {
    backgroundColor: colors.softBlue,
    borderColor: colors.aqua,
  },
  guestPickerModal: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    maxHeight: '86%',
    maxWidth: 780,
    padding: 14,
    width: '100%',
  },
  historyPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    maxHeight: '84%',
    maxWidth: 720,
    padding: 16,
    width: '100%',
  },
  historyScrollContent: {
    gap: 10,
    paddingBottom: 8,
  },
  hostCueCard: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
    borderColor: 'rgba(255, 255, 255, 0.34)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    left: 20,
    maxWidth: 360,
    padding: 10,
    position: 'absolute',
    top: 74,
    zIndex: 2,
  },
  hostCueCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  hostCueName: {
    color: '#145D67',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  hostCueText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  gameStage: {
    backgroundColor: '#111821',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 0,
    minHeight: 700,
    overflow: 'hidden',
  },
  gameStageCompact: {
    flexDirection: 'column',
  },
  hero: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 22,
    justifyContent: 'space-between',
    minHeight: 320,
  },
  heroBody: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 720,
  },
  heroCompact: {
    flexDirection: 'column',
  },
  heroCopy: {
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    minWidth: 0,
  },
  heroPreview: {
    alignSelf: 'center',
    backgroundColor: colors.sand,
    borderColor: '#E7D7C0',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 300,
    gap: 10,
    padding: 18,
  },
  heroTitle: {
    color: colors.ink,
    fontSize: 54,
    fontWeight: '900',
    lineHeight: 60,
    maxWidth: 760,
  },
  heroTitleCompact: {
    fontSize: 38,
    lineHeight: 44,
  },
  heroTitleSmall: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 42,
  },
  input: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputGroup: {
    flexBasis: 220,
    flexGrow: 1,
    gap: 6,
  },
  inputLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  kickerText: {
    alignSelf: 'flex-start',
    backgroundColor: colors.softGreen,
    borderColor: '#B9D9C6',
    borderRadius: 999,
    borderWidth: 1,
    color: colors.leaf,
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  linkButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  linkButtonText: {
    color: '#145D67',
    fontSize: 14,
    fontWeight: '900',
  },
  lightDot: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  lightDotHot: {
    backgroundColor: '#E0604D',
  },
  lightDotOff: {
    backgroundColor: '#9AA5B1',
  },
  lightDotOn: {
    backgroundColor: '#4BA66D',
  },
  lightStateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  lineupSlotEmpty: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
    borderColor: 'rgba(20, 93, 103, 0.28)',
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 2,
    flexBasis: 170,
    flexGrow: 1,
    height: 220,
    justifyContent: 'center',
    maxWidth: 220,
  },
  lineupSlotFilled: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 170,
    flexGrow: 1,
    gap: 7,
    maxWidth: 220,
    padding: 10,
  },
  lineupStage: {
    backgroundColor: colors.softBlue,
    borderColor: '#C7E7EF',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 28, 38, 0.32)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 20,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  modalBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  modalFooterActions: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-end',
    paddingTop: 12,
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '900',
  },
  nav: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  navButton: {
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navButtonActive: {
    backgroundColor: colors.softPink,
    borderColor: colors.blush,
  },
  navButtonText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '900',
  },
  navButtonTextActive: {
    color: colors.ink,
  },
  optionButton: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 190,
    flexGrow: 1,
    gap: 5,
    padding: 12,
  },
  optionButtonMuted: {
    backgroundColor: colors.sand,
    borderColor: '#E7D7C0',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 190,
    flexGrow: 1,
    gap: 5,
    padding: 12,
  },
  optionButtonSelected: {
    backgroundColor: colors.softBlue,
    borderColor: colors.aqua,
  },
  optionGuestCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  optionGuestHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionPreview: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  optionReasonText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  optionTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  page: {
    gap: 24,
    marginHorizontal: 'auto',
    maxWidth: 1180,
    padding: 22,
    width: '100%',
  },
  previewBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  previewEyebrow: {
    color: colors.clay,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  previewTitle: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: '900',
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pickerGuestCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 240,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 10,
    padding: 10,
  },
  pickerGuestCardActive: {
    backgroundColor: colors.softGreen,
    borderColor: '#B9D9C6',
  },
  pickerGuestCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  plusMark: {
    color: 'rgba(20, 93, 103, 0.62)',
    fontSize: 58,
    fontWeight: '200',
    lineHeight: 64,
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.ink,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  profileButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    maxWidth: 220,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  profileInitialLarge: {
    color: '#145D67',
    fontSize: 26,
    fontWeight: '900',
  },
  profileInitialSmall: {
    color: '#145D67',
    fontSize: 14,
    fontWeight: '900',
  },
  profileName: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '900',
  },
  profilePill: {
    alignItems: 'center',
    backgroundColor: colors.softBlue,
    borderColor: colors.aqua,
    borderRadius: 999,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  profilePillLarge: {
    alignItems: 'center',
    backgroundColor: colors.softBlue,
    borderColor: colors.aqua,
    borderRadius: 999,
    borderWidth: 1,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  promptText: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 28,
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  rows: {
    gap: 10,
  },
  sessionGuestAvatar: {
    backgroundColor: colors.softBlue,
    borderRadius: 8,
    height: 46,
    width: 46,
  },
  sessionGuestAvatarFallback: {
    alignItems: 'center',
    backgroundColor: colors.softPink,
    borderColor: colors.blush,
    borderRadius: 8,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  resultPanel: {
    backgroundColor: colors.softGreen,
    borderColor: '#B9D9C6',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  removeSlotButton: {
    alignItems: 'center',
    backgroundColor: '#F4F7FA',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  removeSlotButtonText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  scenePanel: {
    backgroundColor: colors.paper,
    borderColor: colors.blush,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  screen: {
    backgroundColor: '#FCFEFF',
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '900',
  },
  signInPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    maxWidth: 420,
    padding: 18,
    width: '100%',
  },
  signInPill: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  signInText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  statusLine: {
    color: colors.muted,
    fontSize: 14,
  },
  storyInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  speakerAvatarFallback: {
    alignItems: 'center',
    backgroundColor: colors.softPink,
    borderColor: colors.blush,
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  speakerAvatarImage: {
    backgroundColor: colors.softBlue,
    borderRadius: 8,
    height: 42,
    width: 42,
  },
  speakerAvatarInitial: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  speakerMessageBubble: {
    backgroundColor: '#F7FAFC',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    padding: 10,
  },
  speakerMessageRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
  },
  speakerPortrait: {
    borderRadius: 8,
    height: '100%',
    width: '100%',
  },
  speakerSpotlight: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    height: 500,
    marginTop: 106,
    maxWidth: 520,
    overflow: 'hidden',
    width: '78%',
  },
  stageBackgroundImage: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  stageDialogueCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: 'rgba(255, 255, 255, 0.42)',
    borderRadius: 8,
    borderWidth: 1,
    bottom: 24,
    gap: 8,
    left: 28,
    padding: 14,
    position: 'absolute',
    right: 28,
    zIndex: 3,
  },
  stageDialogueMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  stageDialogueSpeaker: {
    color: '#145D67',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  stageDialogueText: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 28,
  },
  stageFocusCard: {
    backgroundColor: 'rgba(17, 24, 33, 0.66)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14,
    position: 'absolute',
    right: 24,
    top: 86,
    width: 300,
    zIndex: 2,
  },
  stageFocusHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  stageFocusNameBlock: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  stageLightBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stageLightText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  stageReasonText: {
    color: '#DDEAF0',
    fontSize: 13,
    lineHeight: 18,
  },
  stageCaption: {
    backgroundColor: 'rgba(17, 24, 33, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 8,
    borderWidth: 1,
    bottom: 20,
    gap: 6,
    left: 20,
    padding: 14,
    position: 'absolute',
    right: 20,
  },
  stageGhostButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stageGhostButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  stageInteractionPane: {
    backgroundColor: '#FFFFFF',
    flexBasis: 350,
    flexGrow: 0,
    maxHeight: 680,
    maxWidth: 390,
    minWidth: 320,
    overflow: 'hidden',
  },
  stageInteractionPaneCompact: {
    flexBasis: 'auto',
    maxHeight: 760,
    maxWidth: '100%',
    minWidth: 0,
    width: '100%',
  },
  stageInteractionContent: {
    gap: 14,
    padding: 18,
    paddingBottom: 30,
  },
  stageLoadingPanel: {
    alignSelf: 'center',
    backgroundColor: 'rgba(17, 24, 33, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    marginHorizontal: 'auto',
    padding: 18,
  },
  stageScrim: {
    backgroundColor: 'rgba(9, 14, 20, 0.24)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  stageSubtitle: {
    color: '#E9F2F4',
    fontSize: 15,
    lineHeight: 22,
  },
  stageTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38,
  },
  stageTopbar: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    left: 18,
    position: 'absolute',
    right: 18,
    top: 18,
    zIndex: 2,
  },
  stageTopbarActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  stageVisualPane: {
    flex: 1,
    minHeight: 620,
    overflow: 'hidden',
    position: 'relative',
  },
  streamingBubble: {
    backgroundColor: colors.softGreen,
    borderColor: '#B9D9C6',
  },
  messageMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  messageTypeText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  tagPill: {
    backgroundColor: colors.softBlue,
    borderColor: colors.aqua,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  tagPillMuted: {
    backgroundColor: '#EEF2F7',
    borderColor: '#D7DEE8',
    opacity: 0.7,
  },
  tagPillText: {
    color: '#145D67',
    fontSize: 12,
    fontWeight: '900',
  },
  tagRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  turnPanel: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  turnSubmitButton: {
    alignSelf: 'stretch',
  },
  turnButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  turnButtonFlex: {
    flex: 1,
    alignSelf: 'auto',
  },
  voiceButton: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 999,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  voiceButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  voiceStatusText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  systemAssetCard: {
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 190,
    flexGrow: 1,
    gap: 8,
    maxWidth: 260,
    padding: 10,
  },
  systemBackgroundPreview: {
    backgroundColor: colors.softBlue,
    borderRadius: 8,
    height: 148,
    width: '100%',
  },
  topbar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  topbarCompact: {
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  workspaceHeader: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    padding: 16,
  },
  guestAffinityFill: {
    backgroundColor: colors.blush,
    borderRadius: 999,
    height: '100%',
  },
  guestAffinityTrack: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    height: 3,
    marginTop: 2,
    overflow: 'hidden',
    width: '100%',
  },
  guestBubble: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    marginTop: 6,
    maxHeight: 80,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 6,
    width: '100%',
  },
  guestBubbleText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  guestCell: {
    alignItems: 'center',
    flex: 1,
    maxWidth: 150,
    minWidth: 72,
  },
  guestFanCell: {
    alignItems: 'center',
    position: 'absolute',
    width: 110,
  },
  guestFanContainer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  guestInfoBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 5,
    width: '100%',
  },
  guestLightDot: {
    borderRadius: 999,
    flexShrink: 0,
    height: 7,
    width: 7,
  },
  guestNameLabel: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  guestPortrait: {
    borderRadius: 8,
    height: 200,
    width: '100%',
  },
  guestPortraitFallback: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    height: 200,
    justifyContent: 'center',
    width: '100%',
  },
  guestPortraitInitial: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
  },
  guestRowContainer: {
    alignItems: 'flex-end',
    bottom: 20,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    left: 12,
    paddingHorizontal: 4,
    position: 'absolute',
    right: 12,
  },
});
