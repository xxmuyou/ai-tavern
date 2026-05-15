import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8787';
const EMAIL_STORAGE_KEY = 'xtbit.dating.email';
const SHOW_KEY = 'dating-heart-signal';

type GuestPreference = 'female' | 'male' | 'any';

type GuestProfile = {
  ageRange: string;
  avatarObjectKey: string | null;
  cityOrLifestyle?: string;
  dealbreakers: string[];
  gender: 'female' | 'male';
  hobbies?: string[];
  id?: string;
  characterKey?: string;
  name: string;
  occupationTag: string;
  personalityKeywords: string[];
  preferences: string[];
  speakingStyle: string;
  source?: 'official' | 'user';
};

type Guest = {
  affectionScore: number;
  available: boolean;
  characterKey: string;
  dealbreakerTriggered?: boolean;
  gender: 'female' | 'male';
  guestTemplateId: string;
  lightState: 'on' | 'off' | 'blow_up';
  name: string;
  profile: GuestProfile;
};

type ShowMessage = {
  content: string;
  createdAt: string;
  id: string;
  role: 'user' | 'host' | 'guest' | 'system';
  speakerName: string;
  stage: string;
};

type ShowSession = {
  avatarLabel: string;
  avatarObjectKey: string | null;
  currentStage: string;
  initialPickCharacterKey?: string | null;
  guestPreference: GuestPreference;
  id: string;
  matchSuccess?: boolean;
  messageCount: number;
  pointsAwarded?: number;
  resultSummary: string | null;
  selectedGuestTemplateId: string | null;
  status: 'active' | 'completed';
  userProfile?: Record<string, unknown>;
};

type SessionPayload = {
  entitlement: {
    active: boolean;
    freeMessageLimit: number;
    mode: string;
    status: string;
  };
  guests: Guest[];
  messages: ShowMessage[];
  session: ShowSession;
  show?: {
    backgroundImageKey: string | null;
    premise: string;
    showKey: string;
    subtitle: string | null;
    title: string;
  };
};

type BootstrapPayload = {
  defaultAvatars: { label: string; objectKey: string }[];
  entitlement: SessionPayload['entitlement'];
  guests: GuestProfile[];
  show?: SessionPayload['show'];
  userCharacters?: GuestProfile[];
};

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; bootstrap: BootstrapPayload }
  | { status: 'error'; message: string };

const STAGE_LABELS: Record<string, string> = {
  completed: 'Finale',
  final_choice: 'Final choice',
  guest_questions: 'Guest questions',
  initial_pick: 'Initial pick',
  profile_judgment: 'Profile judgment',
  user_declaration: 'User declaration',
};

export default function AiTvDatingScreen() {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [email, setEmail] = useState('');
  const [guestPreference, setGuestPreference] = useState<GuestPreference>('female');
  const [avatarLabel, setAvatarLabel] = useState('Spotlight Guest');
  const [avatarObjectKey, setAvatarObjectKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [selectedInitialPick, setSelectedInitialPick] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    ageRange: '',
    favoritePartnerType: '',
    hobbies: '',
    lifestyleNotes: '',
    occupation: '',
    relationshipValues: '',
  });
  const [declaration, setDeclaration] = useState('');
  const [characterFormOpen, setCharacterFormOpen] = useState(false);
  const [characterForm, setCharacterForm] = useState({
    ageRange: '',
    cityOrLifestyle: '',
    dealbreakers: '',
    dislikedPartnerTraits: '',
    favoritePartnerTraits: '',
    gender: 'female' as 'female' | 'male',
    hobbies: '',
    name: '',
    occupation: '',
    personalityKeywords: '',
    speakingStyle: '',
  });
  const [sessionPayload, setSessionPayload] = useState<SessionPayload | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canUseFinalChoice = sessionPayload?.session.currentStage === 'final_choice';
  const visibleMessages = sessionPayload?.messages ?? [];

  const activeGuests = useMemo(() => sessionPayload?.guests ?? [], [sessionPayload]);
  const availableGuests = useMemo(
    () => activeGuests.filter((guest) => guest.available && guest.lightState !== 'off'),
    [activeGuests],
  );

  const loadBootstrap = useCallback(async (nextEmail = email) => {
    setLoadState({ status: 'loading' });

    try {
      const params = nextEmail.trim() ? `?email=${encodeURIComponent(nextEmail.trim())}` : '';
      const response = await fetch(`${API_BASE_URL}/shows/${SHOW_KEY}/bootstrap${params}`);
      const payload = (await response.json()) as BootstrapPayload & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }

      setLoadState({ status: 'ready', bootstrap: payload });
      if (!avatarObjectKey && payload.defaultAvatars[0]) {
        setAvatarLabel(payload.defaultAvatars[0].label);
        setAvatarObjectKey(payload.defaultAvatars[0].objectKey);
      }
    } catch (error) {
      setLoadState({ status: 'error', message: String(error) });
    }
  }, [avatarObjectKey, email]);

  useEffect(() => {
    const storedEmail = readStoredEmail();
    setEmail(storedEmail);
    void loadBootstrap(storedEmail);
  }, [loadBootstrap]);

  const updateEmail = useCallback((value: string) => {
    setEmail(value);
    writeStoredEmail(value);
  }, []);

  const uploadPhoto = useCallback(async () => {
    if (Platform.OS !== 'web') {
      setErrorMessage('Photo upload is web-only in this MVP. Choose a default avatar for now.');
      return;
    }

    try {
      setBusyMessage('Opening photo picker...');
      const file = await pickWebFile();
      if (!file) {
        setBusyMessage(null);
        return;
      }

      const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(0, 80);
      const objectKey = `apps/ai-tv-dating/user-avatars/${Date.now()}-${safeName}`;
      setBusyMessage('Uploading avatar...');
      const response = await fetch(`${API_BASE_URL}/objects/${encodeURIComponent(objectKey)}`, {
        body: file,
        headers: {
          'content-type': file.type || 'application/octet-stream',
        },
        method: 'PUT',
      });

      if (!response.ok) {
        throw new Error(`Upload failed: HTTP ${response.status}`);
      }

      setAvatarLabel('Uploaded photo');
      setAvatarObjectKey(objectKey);
      setBusyMessage(null);
      setErrorMessage(null);
    } catch (error) {
      setBusyMessage(null);
      setErrorMessage(String(error));
    }
  }, []);

  const startSession = useCallback(async () => {
    try {
      setBusyMessage('Starting show...');
      setErrorMessage(null);
      const normalizedEmail = email.trim();
      if (!normalizedEmail) {
        throw new Error('Enter an email to start.');
      }

      const response = await fetch(`${API_BASE_URL}/shows/${SHOW_KEY}/sessions`, {
        body: JSON.stringify({
          avatarLabel,
          avatarObjectKey,
          email: normalizedEmail,
          guestPreference,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload = (await response.json()) as SessionPayload & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }

      setSessionPayload(payload);
      setBusyMessage(null);
    } catch (error) {
      setBusyMessage(null);
      setErrorMessage(String(error));
    }
  }, [avatarLabel, avatarObjectKey, email, guestPreference]);

  const createCharacter = useCallback(async () => {
    try {
      setBusyMessage('Saving character...');
      setErrorMessage(null);
      const normalizedEmail = email.trim();
      if (!normalizedEmail) {
        throw new Error('Enter an email before creating a character.');
      }

      const response = await fetch(`${API_BASE_URL}/shows/${SHOW_KEY}/characters`, {
        body: JSON.stringify({ ...characterForm, email: normalizedEmail }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }

      setCharacterForm({
        ageRange: '',
        cityOrLifestyle: '',
        dealbreakers: '',
        dislikedPartnerTraits: '',
        favoritePartnerTraits: '',
        gender: 'female',
        hobbies: '',
        name: '',
        occupation: '',
        personalityKeywords: '',
        speakingStyle: '',
      });
      setCharacterFormOpen(false);
      await loadBootstrap(normalizedEmail);
      setBusyMessage(null);
    } catch (error) {
      setBusyMessage(null);
      setErrorMessage(String(error));
    }
  }, [characterForm, email, loadBootstrap]);

  const submitInitialPick = useCallback(async (characterKey: string) => {
    if (!sessionPayload) {
      return;
    }

    try {
      setBusyMessage('Locking first heartbeat...');
      setErrorMessage(null);
      const response = await fetch(`${API_BASE_URL}/shows/${SHOW_KEY}/sessions/${sessionPayload.session.id}/initial-pick`, {
        body: JSON.stringify({ characterKey, email: email.trim() }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload = (await response.json()) as SessionPayload & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }

      setSelectedInitialPick(characterKey);
      setSessionPayload(payload);
      setBusyMessage(null);
    } catch (error) {
      setBusyMessage(null);
      setErrorMessage(String(error));
    }
  }, [email, sessionPayload]);

  const submitProfile = useCallback(async () => {
    if (!sessionPayload) {
      return;
    }

    try {
      setBusyMessage('Judging profile...');
      setErrorMessage(null);
      const response = await fetch(`${API_BASE_URL}/shows/${SHOW_KEY}/sessions/${sessionPayload.session.id}/profile`, {
        body: JSON.stringify({ ...profileForm, email: email.trim() }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload = (await response.json()) as SessionPayload & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }

      setSessionPayload(payload);
      setBusyMessage(null);
    } catch (error) {
      setBusyMessage(null);
      setErrorMessage(String(error));
    }
  }, [email, profileForm, sessionPayload]);

  const submitDeclaration = useCallback(async () => {
    if (!sessionPayload) {
      return;
    }

    try {
      setBusyMessage('Reading the room...');
      setErrorMessage(null);
      const response = await fetch(`${API_BASE_URL}/shows/${SHOW_KEY}/sessions/${sessionPayload.session.id}/declaration`, {
        body: JSON.stringify({ declaration, email: email.trim() }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload = (await response.json()) as SessionPayload & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }

      setSessionPayload(payload);
      setBusyMessage(null);
    } catch (error) {
      setBusyMessage(null);
      setErrorMessage(String(error));
    }
  }, [declaration, email, sessionPayload]);

  const sendMessage = useCallback(async () => {
    if (!sessionPayload) {
      return;
    }

    try {
      setBusyMessage('The studio is listening...');
      setErrorMessage(null);
      const trimmed = message.trim();
      if (!trimmed) {
        throw new Error('Write a line before sending.');
      }

      const response = await fetch(`${API_BASE_URL}/shows/${SHOW_KEY}/sessions/${sessionPayload.session.id}/messages`, {
        body: JSON.stringify({ email: email.trim(), message: trimmed }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload = (await response.json()) as SessionPayload & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }

      setSessionPayload(payload);
      setMessage('');
      setBusyMessage(null);
    } catch (error) {
      setBusyMessage(null);
      setErrorMessage(String(error));
    }
  }, [email, message, sessionPayload]);

  const makeFinalChoice = useCallback(async (guestTemplateId: string | null) => {
    if (!sessionPayload) {
      return;
    }

    try {
      setBusyMessage('Rolling finale...');
      setErrorMessage(null);
      const response = await fetch(`${API_BASE_URL}/shows/${SHOW_KEY}/sessions/${sessionPayload.session.id}/final-choice`, {
        body: JSON.stringify({ characterKey: guestTemplateId ?? 'none', email: email.trim(), guestTemplateId: guestTemplateId ?? 'none' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload = (await response.json()) as SessionPayload & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }

      setSessionPayload(payload);
      setBusyMessage(null);
    } catch (error) {
      setBusyMessage(null);
      setErrorMessage(String(error));
    }
  }, [email, sessionPayload]);

  const resetSession = useCallback(() => {
    setSessionPayload(null);
    setMessage('');
    setErrorMessage(null);
  }, []);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <ThemedView style={styles.hero}>
        <ThemedText type="title">{sessionPayload?.show?.title ?? 'AI TV Dating Show'}</ThemedText>
        <ThemedText>{sessionPayload?.show?.premise ?? 'Step into the studio, meet the lineup, and choose your ending.'}</ThemedText>
      </ThemedView>

      <ThemedView style={styles.stageBand}>
        <View style={styles.stageLight} />
        <View style={styles.stageLightAlt} />
        <ThemedText type="subtitle" style={styles.stageText}>
          Heart Signal Live
        </ThemedText>
        <ThemedText style={styles.stageText}>
          {sessionPayload ? STAGE_LABELS[sessionPayload.session.currentStage] ?? sessionPayload.session.currentStage : 'Casting'}
        </ThemedText>
      </ThemedView>

      {!sessionPayload ? (
        <ThemedView style={styles.panel}>
          <ThemedText type="subtitle">Casting desk</ThemedText>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={updateEmail}
            placeholder="Email"
            style={styles.input}
            value={email}
          />

          <ThemedText type="defaultSemiBold">Your avatar</ThemedText>
          <View style={styles.actions}>
            {loadState.status === 'ready'
              ? loadState.bootstrap.defaultAvatars.map((avatar) => (
                  <Pressable
                    accessibilityRole="button"
                    key={avatar.objectKey}
                    onPress={() => {
                      setAvatarLabel(avatar.label);
                      setAvatarObjectKey(avatar.objectKey);
                    }}
                    style={[styles.button, avatarObjectKey === avatar.objectKey && styles.buttonActive]}>
                    <ThemedText type="defaultSemiBold">{avatar.label}</ThemedText>
                  </Pressable>
                ))
              : null}
            <Pressable accessibilityRole="button" onPress={uploadPhoto} style={styles.button}>
              <ThemedText type="defaultSemiBold">Upload photo</ThemedText>
            </Pressable>
          </View>
          <ThemedText>Selected: {avatarLabel}</ThemedText>

          <View style={styles.panelHeader}>
            <ThemedText type="defaultSemiBold">Character Studio</ThemedText>
            <Pressable accessibilityRole="button" onPress={() => setCharacterFormOpen((open) => !open)} style={styles.button}>
              <ThemedText type="defaultSemiBold">{characterFormOpen ? 'Close' : 'Create guest'}</ThemedText>
            </Pressable>
          </View>
          {characterFormOpen ? (
            <View style={styles.formGrid}>
              <TextInput
                onChangeText={(value) => setCharacterForm((current) => ({ ...current, name: value }))}
                placeholder="Guest name"
                style={styles.input}
                value={characterForm.name}
              />
              <View style={styles.segmented}>
                {(['female', 'male'] as const).map((gender) => (
                  <Pressable
                    accessibilityRole="button"
                    key={gender}
                    onPress={() => setCharacterForm((current) => ({ ...current, gender }))}
                    style={[styles.segment, characterForm.gender === gender && styles.segmentActive]}>
                    <ThemedText type="defaultSemiBold">{gender}</ThemedText>
                  </Pressable>
                ))}
              </View>
              <TextInput
                onChangeText={(value) => setCharacterForm((current) => ({ ...current, ageRange: value }))}
                placeholder="Age range"
                style={styles.input}
                value={characterForm.ageRange}
              />
              <TextInput
                onChangeText={(value) => setCharacterForm((current) => ({ ...current, occupation: value }))}
                placeholder="Occupation"
                style={styles.input}
                value={characterForm.occupation}
              />
              <TextInput
                onChangeText={(value) => setCharacterForm((current) => ({ ...current, personalityKeywords: value }))}
                placeholder="Personality keywords"
                style={styles.input}
                value={characterForm.personalityKeywords}
              />
              <TextInput
                onChangeText={(value) => setCharacterForm((current) => ({ ...current, favoritePartnerTraits: value }))}
                placeholder="Favorite partner traits"
                style={styles.input}
                value={characterForm.favoritePartnerTraits}
              />
              <TextInput
                onChangeText={(value) => setCharacterForm((current) => ({ ...current, dislikedPartnerTraits: value }))}
                placeholder="Disliked partner traits"
                style={styles.input}
                value={characterForm.dislikedPartnerTraits}
              />
              <TextInput
                onChangeText={(value) => setCharacterForm((current) => ({ ...current, dealbreakers: value }))}
                placeholder="Dealbreakers"
                style={styles.input}
                value={characterForm.dealbreakers}
              />
              <TextInput
                onChangeText={(value) => setCharacterForm((current) => ({ ...current, speakingStyle: value }))}
                placeholder="Speaking style"
                style={styles.input}
                value={characterForm.speakingStyle}
              />
              <Pressable accessibilityRole="button" onPress={createCharacter} style={styles.primaryButton}>
                <ThemedText type="defaultSemiBold" style={styles.primaryButtonText}>
                  Save character
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          {loadState.status === 'ready' && loadState.bootstrap.userCharacters?.length ? (
            <ThemedText>{loadState.bootstrap.userCharacters.length} custom guest(s) will enter your next show.</ThemedText>
          ) : null}

          <ThemedText type="defaultSemiBold">Guest lineup</ThemedText>
          <View style={styles.segmented}>
            {(['female', 'male', 'any'] as GuestPreference[]).map((preference) => (
              <Pressable
                accessibilityRole="button"
                key={preference}
                onPress={() => setGuestPreference(preference)}
                style={[styles.segment, guestPreference === preference && styles.segmentActive]}>
                <ThemedText type="defaultSemiBold">{preference}</ThemedText>
              </Pressable>
            ))}
          </View>

          <Pressable accessibilityRole="button" onPress={startSession} style={styles.primaryButton}>
            <ThemedText type="defaultSemiBold" style={styles.primaryButtonText}>
              Start episode
            </ThemedText>
          </Pressable>
        </ThemedView>
      ) : (
        <>
          <ThemedView style={styles.panel}>
            <View style={styles.panelHeader}>
              <View>
                <ThemedText type="subtitle">Guest lineup</ThemedText>
                <ThemedText>Hidden affinity. Only light states are public.</ThemedText>
              </View>
              <Pressable accessibilityRole="button" onPress={resetSession} style={styles.button}>
                <ThemedText type="defaultSemiBold">New show</ThemedText>
              </Pressable>
            </View>
            <View style={styles.guestGrid}>
              {activeGuests.map((guest) => (
                <GuestCard guest={guest} key={guest.guestTemplateId} />
              ))}
            </View>
          </ThemedView>

          {sessionPayload.session.currentStage === 'initial_pick' ? (
            <ThemedView style={styles.panel}>
              <ThemedText type="subtitle">Initial pick</ThemedText>
              <ThemedText>Choose one favorite guest before seeing any hidden signals.</ThemedText>
              <View style={styles.actions}>
                {activeGuests.map((guest) => (
                  <Pressable
                    accessibilityRole="button"
                    key={guest.guestTemplateId}
                    onPress={() => void submitInitialPick(guest.characterKey ?? guest.guestTemplateId)}
                    style={[
                      styles.button,
                      selectedInitialPick === (guest.characterKey ?? guest.guestTemplateId) && styles.buttonActive,
                    ]}>
                    <ThemedText type="defaultSemiBold">Pick {guest.name}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </ThemedView>
          ) : null}

          {sessionPayload.session.currentStage === 'profile_judgment' ? (
            <ThemedView style={styles.panel}>
              <ThemedText type="subtitle">Profile judgment</ThemedText>
              <ThemedText>Give the room your basic profile. Guests may keep lights on, turn off, or blow up.</ThemedText>
              <View style={styles.formGrid}>
                <TextInput
                  onChangeText={(value) => setProfileForm((current) => ({ ...current, ageRange: value }))}
                  placeholder="Age range"
                  style={styles.input}
                  value={profileForm.ageRange}
                />
                <TextInput
                  onChangeText={(value) => setProfileForm((current) => ({ ...current, occupation: value }))}
                  placeholder="Occupation"
                  style={styles.input}
                  value={profileForm.occupation}
                />
                <TextInput
                  onChangeText={(value) => setProfileForm((current) => ({ ...current, hobbies: value }))}
                  placeholder="Hobbies"
                  style={styles.input}
                  value={profileForm.hobbies}
                />
                <TextInput
                  onChangeText={(value) => setProfileForm((current) => ({ ...current, relationshipValues: value }))}
                  placeholder="Relationship values"
                  style={styles.input}
                  value={profileForm.relationshipValues}
                />
                <TextInput
                  onChangeText={(value) => setProfileForm((current) => ({ ...current, favoritePartnerType: value }))}
                  placeholder="Favorite partner type"
                  style={styles.input}
                  value={profileForm.favoritePartnerType}
                />
                <Pressable accessibilityRole="button" onPress={submitProfile} style={styles.primaryButton}>
                  <ThemedText type="defaultSemiBold" style={styles.primaryButtonText}>
                    Submit profile
                  </ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          ) : null}

          <ThemedView style={styles.panel}>
            <ThemedText type="subtitle">Live feed</ThemedText>
            <View style={styles.messages}>
              {visibleMessages.map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.messageBubble,
                    item.role === 'user' ? styles.userBubble : item.role === 'guest' ? styles.guestBubble : styles.hostBubble,
                  ]}>
                  <ThemedText type="defaultSemiBold">{item.speakerName}</ThemedText>
                  <ThemedText>{item.content}</ThemedText>
                </View>
              ))}
            </View>

            {sessionPayload.session.status === 'active' && sessionPayload.session.currentStage === 'guest_questions' ? (
              <>
                <TextInput
                  multiline
                  onChangeText={setMessage}
                  placeholder="Say something to the room..."
                  style={[styles.input, styles.messageInput]}
                  value={message}
                />
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" onPress={sendMessage} style={styles.primaryButton}>
                    <ThemedText type="defaultSemiBold" style={styles.primaryButtonText}>
                      Send
                    </ThemedText>
                  </Pressable>
                </View>
              </>
            ) : null}
          </ThemedView>

          {sessionPayload.session.currentStage === 'user_declaration' ? (
            <ThemedView style={styles.panel}>
              <ThemedText type="subtitle">User declaration</ThemedText>
              <ThemedText>Say what you like and dislike in a partner. This affects the whole room.</ThemedText>
              <TextInput
                multiline
                onChangeText={setDeclaration}
                placeholder="I like people who... I cannot accept..."
                style={[styles.input, styles.messageInput]}
                value={declaration}
              />
              <Pressable accessibilityRole="button" onPress={submitDeclaration} style={styles.primaryButton}>
                <ThemedText type="defaultSemiBold" style={styles.primaryButtonText}>
                  Declare
                </ThemedText>
              </Pressable>
            </ThemedView>
          ) : null}

          {sessionPayload.session.status === 'active' && canUseFinalChoice ? (
            <ThemedView style={styles.panel}>
              <ThemedText type="subtitle">Final choice</ThemedText>
              <ThemedText>Only guests with lights on or blow-up can be chosen.</ThemedText>
              <View style={styles.actions}>
                {availableGuests.map((guest) => (
                  <Pressable
                    accessibilityRole="button"
                    key={guest.guestTemplateId}
                    onPress={() => void makeFinalChoice(guest.characterKey ?? guest.guestTemplateId)}
                    style={styles.button}>
                    <ThemedText type="defaultSemiBold">Choose {guest.name}</ThemedText>
                  </Pressable>
                ))}
                <Pressable accessibilityRole="button" onPress={() => void makeFinalChoice(null)} style={styles.button}>
                  <ThemedText type="defaultSemiBold">Walk away</ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          ) : null}

          {sessionPayload.session.status === 'completed' ? (
            <ThemedView style={styles.panel}>
              <ThemedText type="subtitle">Result</ThemedText>
              <ThemedText>{sessionPayload.session.resultSummary}</ThemedText>
              {sessionPayload.session.matchSuccess ? (
                <ThemedText type="defaultSemiBold">+{sessionPayload.session.pointsAwarded ?? 0} platform points</ThemedText>
              ) : null}
            </ThemedView>
          ) : null}
        </>
      )}

      {busyMessage ? <ThemedText>{busyMessage}</ThemedText> : null}
      {errorMessage ? <ThemedText>{errorMessage}</ThemedText> : null}
      {loadState.status === 'error' ? <ThemedText>{loadState.message}</ThemedText> : null}
    </ScrollView>
  );
}

function GuestCard({ guest }: { guest: Guest }) {
  const [imageFailed, setImageFailed] = useState(false);
  const profile = guest.profile;
  const imageUrl = profile.avatarObjectKey ? `${API_BASE_URL}/objects/${encodeURIComponent(profile.avatarObjectKey)}` : null;
  const lightLabel =
    guest.lightState === 'blow_up' ? 'Blow-up' : guest.lightState === 'off' ? 'Light off' : 'Light on';

  return (
    <View style={styles.guestCard}>
      {imageUrl && !imageFailed ? (
        <Image onError={() => setImageFailed(true)} source={{ uri: imageUrl }} style={styles.guestImage} />
      ) : (
        <View style={styles.guestImageFallback}>
          <ThemedText type="subtitle">{guest.name.slice(0, 1)}</ThemedText>
        </View>
      )}
      <ThemedText type="defaultSemiBold">{guest.name}</ThemedText>
      <ThemedText>{profile.occupationTag}</ThemedText>
      <ThemedText>{profile.personalityKeywords.join(' / ')}</ThemedText>
      <View
        style={[
          styles.lightPill,
          guest.lightState === 'blow_up' ? styles.lightBlowUp : guest.lightState === 'off' ? styles.lightOff : styles.lightOn,
        ]}>
        <ThemedText type="defaultSemiBold" style={styles.lightPillText}>
          {lightLabel}
        </ThemedText>
      </View>
      {profile.source === 'user' ? <ThemedText>Custom guest</ThemedText> : null}
    </View>
  );
}

function readStoredEmail(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(EMAIL_STORAGE_KEY) ?? window.localStorage.getItem('xtbit.billing.email') ?? '';
}

function writeStoredEmail(value: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(EMAIL_STORAGE_KEY, value.trim());
}

function pickWebFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  affectionBar: {
    backgroundColor: '#E8EAED',
    borderRadius: 8,
    height: 8,
    overflow: 'hidden',
    width: '100%',
  },
  affectionFill: {
    backgroundColor: '#D24B65',
    height: '100%',
  },
  button: {
    alignItems: 'center',
    borderColor: '#334155',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonActive: {
    backgroundColor: '#E7F0FF',
    borderColor: '#2563EB',
  },
  container: {
    gap: 16,
    padding: 20,
  },
  guestBubble: {
    backgroundColor: '#F7E7EF',
  },
  guestCard: {
    borderColor: '#D4D8DD',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 220,
    flexGrow: 1,
    gap: 8,
    padding: 12,
  },
  guestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  guestImage: {
    backgroundColor: '#EEF2F7',
    borderRadius: 8,
    height: 120,
    width: '100%',
  },
  guestImageFallback: {
    alignItems: 'center',
    backgroundColor: '#EEF2F7',
    borderRadius: 8,
    height: 120,
    justifyContent: 'center',
    width: '100%',
  },
  formGrid: {
    gap: 10,
  },
  hero: {
    gap: 6,
  },
  hostBubble: {
    backgroundColor: '#EEF2F7',
  },
  input: {
    borderColor: '#C5CBD3',
    borderRadius: 8,
    borderWidth: 1,
    color: '#11181C',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  lightBlowUp: {
    backgroundColor: '#FCE7F3',
    borderColor: '#DB2777',
  },
  lightOff: {
    backgroundColor: '#E5E7EB',
    borderColor: '#6B7280',
  },
  lightOn: {
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
  },
  lightPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  lightPillText: {
    fontSize: 12,
  },
  messageBubble: {
    borderRadius: 8,
    gap: 4,
    padding: 12,
  },
  messageInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  messages: {
    gap: 10,
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
    gap: 12,
    justifyContent: 'space-between',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  segment: {
    alignItems: 'center',
    borderColor: '#C5CBD3',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  segmentActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
  },
  segmented: {
    flexDirection: 'row',
    gap: 8,
  },
  stageBand: {
    backgroundColor: '#171717',
    borderRadius: 8,
    gap: 6,
    overflow: 'hidden',
    padding: 18,
  },
  stageLight: {
    backgroundColor: '#F8C8DC',
    height: 4,
    width: '52%',
  },
  stageLightAlt: {
    backgroundColor: '#93C5FD',
    height: 4,
    width: '34%',
  },
  stageText: {
    color: '#FFFFFF',
  },
  userBubble: {
    backgroundColor: '#E4F7ED',
  },
});
