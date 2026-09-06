import { Ionicons } from '@expo/vector-icons';
import { AudioModule, RecordingPresets, useAudioRecorder, useAudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { userApi } from '../api/user.api';
import RatingCard from '../components/RatingCard';
import { Button, Chip, FormField, ScreenHeader } from '../components/ui';
import CallScreen from './CallScreen';
import { colors, radius, spacing, type } from '../theme';
import useBackHandler from '../utils/useBackHandler';

const CATEGORIES = [
  { key: 'trip_issue', label: 'Trip issue' },
  { key: 'payment_issue', label: 'Payment' },
  { key: 'account_issue', label: 'Account' },
  { key: 'document_issue', label: 'Documents' },
  { key: 'other', label: 'Other' },
];

const STATUS_COLOR = {
  open: colors.warn,
  in_progress: colors.primary,
  resolved: colors.success,
  closed: colors.textFaint,
};

const isImageAttachment = (m) =>
  m.attachmentType !== 'audio' && /\.(png|jpe?g|gif|webp|heic)$/i.test(m.attachmentName || m.attachmentUrl || '');

export default function SupportScreen({ onBack, role }) {
  const [view, setView] = useState('list'); // 'list' | 'new' | 'thread'
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);

  // new ticket form
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('trip_issue');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');

  // Close → review → reopen flow (per closed ticket).
  const [reviewOpenFor, setReviewOpenFor] = useState(null);       // ticket id whose review modal is open
  const [reviewDismissedFor, setReviewDismissedFor] = useState(null);
  const [reopeningId, setReopeningId] = useState(null);           // ticket the customer chose to reopen

  // Support capabilities - global, admin-controlled. Default: calls off.
  const [settings, setSettings] = useState({ voiceMessages: true, documents: true, audioCall: false, videoCall: false });
  const canVoice = settings.voiceMessages;
  const canDocs = settings.documents;
  const canAudioCall = settings.audioCall;
  const canVideoCall = settings.videoCall;

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const callRef = useRef(null);

  // Attachment compose/preview (WhatsApp-style) before sending.
  const [pending, setPending] = useState(null); // { type:'images'|'doc'|'audio', items:[{uri,name,type}] }
  const audioPreview = useAudioPlayer(pending?.type === 'audio' ? pending.items[0].uri : null);

  const loadSettings = useCallback(() => {
    userApi.getSupportSettings().then((r) => { if (r?.data) setSettings(r.data); }).catch(() => {});
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const loadTickets = useCallback(async () => {
    try {
      const res = await userApi.getMyTickets();
      setTickets(res.data?.tickets || res.data || []);
    } catch { /* keep previous */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    loadSettings();
    await loadTickets();
    setRefreshing(false);
  }, [loadSettings, loadTickets]);

  // Live-refresh the open ticket so new replies appear without a manual refresh.
  useEffect(() => {
    if (view !== 'thread' || !active?._id) return undefined;
    const id = active._id;
    const timer = setInterval(async () => {
      try {
        const res = await userApi.getTicketById(id);
        if (res.data) setActive(res.data);
      } catch { /* ignore poll errors */ }
    }, 4000);
    return () => clearInterval(timer);
  }, [view, active?._id]);

  // A closed, unrated ticket prompts for a review (once, unless dismissed).
  useEffect(() => {
    if (active?.status === 'closed' && !active?.rating?.score && reviewDismissedFor !== active?._id) {
      setReviewOpenFor(active._id);
    }
  }, [active?._id, active?.status, active?.rating?.score, reviewDismissedFor]);

  const openTicket = async (id) => {
    setView('thread');
    setActive(null);
    loadSettings(); // pick up any permission changes before showing call buttons
    try {
      const res = await userApi.getTicketById(id);
      setActive(res.data);
    } catch { setView('list'); }
  };

  const submitNew = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Missing details', 'Please add a subject and describe your issue before submitting.');
      return;
    }
    setBusy(true);
    try {
      const res = await userApi.createTicket({ subject: subject.trim(), category, message: message.trim() });
      setSubject(''); setMessage(''); setCategory('trip_issue');
      await loadTickets();
      const created = res.data;
      if (created?._id) openTicket(created._id); else setView('list');
    } catch (e) {
      Alert.alert('Could not submit', e?.message || 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!reply.trim() || !active?._id) return;
    setBusy(true);
    try {
      const res = await userApi.addTicketMessage(active._id, reply.trim());
      setReply('');
      setActive(res.data || active);
    } catch { /* noop */ } finally { setBusy(false); }
  };

  const submitRating = async ({ score, note, tags }) => {
    if (!active?._id || busy) return;
    setBusy(true);
    try {
      const res = await userApi.rateTicket(active._id, score, note, tags);
      setActive(res.data || active);
      setReviewOpenFor(null);
    } catch (e) {
      Alert.alert('Could not submit rating', e?.message || 'Please try again.');
    } finally { setBusy(false); }
  };

  const dismissReview = () => { setReviewOpenFor(null); setReviewDismissedFor(active?._id); };

  // Reopen a closed chat after a confirm that reminds them what they rated.
  const confirmReopen = () => {
    if (!active?._id) return;
    const name = active?.assignedTo?.name || 'support';
    const msg = active?.rating?.score
      ? `You rated ${name} ${active.rating.score}/5${active.rating.comment ? ` — “${active.rating.comment}”` : ''}.\n\nDo you want to reopen this chat?`
      : 'Do you want to reopen this chat?';
    Alert.alert('Reopen chat', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reopen', onPress: () => setReopeningId(active._id) },
    ]);
  };

  // Send everything staged in the preview, one attachment per message.
  const sendPending = async () => {
    if (!pending?.items?.length || !active?._id) return;
    setBusy(true);
    try {
      let latest = active;
      for (const file of pending.items) {
        const res = await userApi.sendTicketAttachment(active._id, { file });
        if (res?.data) latest = res.data;
      }
      setActive(latest);
      setPending(null);
    } catch (e) {
      Alert.alert('Upload failed', e?.message || 'Could not send the attachment.');
    } finally { setBusy(false); }
  };

  const cancelPending = () => { try { audioPreview?.pause?.(); } catch { /* noop */ } setPending(null); };

  // Mic: first tap records, second tap stops → stages the voice note for preview.
  const toggleRecording = async () => {
    if (recording) {
      setRecording(false);
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (uri) setPending({ type: 'audio', items: [{ uri, name: `voice-${Date.now()}.m4a`, type: 'audio/m4a' }] });
      } catch (e) {
        Alert.alert('Recording failed', e?.message || 'Could not save the recording.');
      }
      return;
    }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone needed', 'Allow microphone access to send a voice message.');
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (e) {
      Alert.alert('Recording failed', e?.message || 'Could not start recording.');
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const a = result.assets?.[0];
      if (!a) return;
      setPending({ type: 'doc', items: [{ uri: a.uri, name: a.name || `file-${Date.now()}`, type: a.mimeType || 'application/octet-stream' }] });
    } catch (e) {
      Alert.alert('Could not attach file', e?.message || 'Please try again.');
    }
  };

  const pickImages = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Photos needed', 'Allow photo access to send images.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.7,
      });
      if (result.canceled) return;
      const items = (result.assets || []).map((a, i) => ({
        uri: a.uri,
        name: a.fileName || `image-${Date.now()}-${i}.jpg`,
        type: a.mimeType || 'image/jpeg',
      }));
      if (items.length) setPending({ type: 'images', items });
    } catch (e) {
      Alert.alert('Could not attach images', e?.message || 'Please try again.');
    }
  };

  const startCall = (video) => callRef.current?.start(video ? 'video' : 'audio');

  const back = () => {
    if (view === 'list') onBack?.();
    else { setView('list'); setActive(null); loadTickets(); }
  };

  // Hardware back mirrors the header chevron: out of a thread/new-ticket form
  // first, and only then out of Support altogether (handled by the shell).
  useBackHandler(() => {
    if (view === 'list') return false;
    back();
    return true;
  });

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={view === 'new' ? 'New ticket' : view === 'thread' ? 'Support ticket' : 'Support'}
        left={<Pressable onPress={back} hitSlop={8}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>}
        right={view === 'list' ? (
          <Pressable onPress={() => setView('new')} hitSlop={8}><Ionicons name="add" size={24} color={colors.primary} /></Pressable>
        ) : null}
      />

      {/* LIST */}
      {view === 'list' && (
        loading ? <Centered /> : (
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
          >
            {tickets.length === 0 ? (
              <Text style={styles.empty}>No support tickets yet. Tap + to start one.</Text>
            ) : tickets.map((t) => (
              <Pressable key={t._id} style={styles.card} onPress={() => openTicket(t._id)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{t.subject}</Text>
                  <Text style={styles.cardMeta}>{(t.category || '').replace(/_/g, ' ')}</Text>
                </View>
                <Text style={[styles.status, { color: STATUS_COLOR[t.status] || colors.textMuted }]}>
                  {(t.status || '').replace(/_/g, ' ')}
                </Text>
              </Pressable>
            ))}
            <Button label="New ticket" onPress={() => setView('new')} style={{ marginTop: spacing.lg }} />
          </ScrollView>
        )
      )}

      {/* NEW */}
      {view === 'new' && (
        <ScrollView contentContainerStyle={styles.content}>
          <FormField label="Subject" value={subject} onChangeText={setSubject} placeholder="Briefly, what's the issue?" />
          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <Chip key={c.key} label={c.label} active={category === c.key} onPress={() => setCategory(c.key)} />
            ))}
          </View>
          <View style={{ height: spacing.md }} />
          <Text style={styles.fieldLabel}>Message</Text>
          <TextInput
            value={message} onChangeText={setMessage} multiline
            placeholder="Describe what happened…" placeholderTextColor={colors.textFaint}
            style={styles.textarea}
          />
          <View style={{ height: spacing.lg }} />
          <Button label={busy ? 'Sending…' : 'Submit ticket'} onPress={submitNew} disabled={busy} />
        </ScrollView>
      )}

      {/* THREAD */}
      {view === 'thread' && (
        !active ? <Centered /> : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.threadSubject}>{active.subject}</Text>
              <Text style={[styles.status, { color: STATUS_COLOR[active.status] || colors.textMuted, marginBottom: spacing.md }]}>
                {(active.status || '').replace(/_/g, ' ')}
                {active.assignedTo?.name ? `  ·  ${active.assignedTo.name}` : ''}
              </Text>
              {active.status !== 'closed' && (canAudioCall || canVideoCall) && (
                <View style={styles.callRow}>
                  {canAudioCall && (
                    <Pressable style={styles.callBtn} onPress={() => startCall(false)}>
                      <Ionicons name="call" size={16} color={colors.primary} />
                      <Text style={styles.callBtnText}>Audio call</Text>
                    </Pressable>
                  )}
                  {canVideoCall && (
                    <Pressable style={styles.callBtn} onPress={() => startCall(true)}>
                      <Ionicons name="videocam" size={16} color={colors.primary} />
                      <Text style={styles.callBtnText}>Video call</Text>
                    </Pressable>
                  )}
                </View>
              )}
              {(active.messages || []).map((m, i) => {
                const mine = m.senderType !== 'admin';
                return (
                  <View key={i} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleAdmin]}>
                    <Text style={[styles.bubbleSender, mine && { color: 'rgba(255,255,255,0.85)' }]}>
                      {m.senderType === 'admin' ? (m.isAI ? 'AI Assistant' : (active.assignedTo?.name || 'Support')) : 'You'}
                    </Text>
                    {!!m.message && (
                      <Text style={[styles.bubbleText, mine && { color: '#fff' }]}>{m.message}</Text>
                    )}
                    {m.attachmentUrl && isImageAttachment(m) && (
                      <Pressable onPress={() => Linking.openURL(m.attachmentUrl)}>
                        <Image source={{ uri: m.attachmentUrl }} style={styles.bubbleImage} resizeMode="cover" />
                      </Pressable>
                    )}
                    {m.attachmentUrl && !isImageAttachment(m) && (
                      <Pressable
                        onPress={() => Linking.openURL(m.attachmentUrl)}
                        style={[styles.attachChip, mine && styles.attachChipMine]}
                      >
                        <Ionicons
                          name={m.attachmentType === 'audio' ? 'play-circle' : 'document-attach'}
                          size={16}
                          color={mine ? '#fff' : colors.primary}
                        />
                        <Text style={[styles.attachText, mine && { color: '#fff' }]} numberOfLines={1}>
                          {m.attachmentType === 'audio' ? 'Voice message' : (m.attachmentName || 'Attachment')}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            {active.status === 'closed' && reopeningId !== active._id ? (
              <View style={styles.closedBar}>
                <Ionicons name="lock-closed" size={18} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.closedTitle}>This conversation is closed</Text>
                  {active.rating?.score ? (
                    <Text style={styles.closedSub}>You rated {active.assignedTo?.name || 'support'} {active.rating.score}/5</Text>
                  ) : null}
                </View>
                {!active.rating?.score && (
                  <Pressable onPress={() => setReviewOpenFor(active._id)} style={styles.closedGhostBtn} hitSlop={6}>
                    <Text style={styles.closedGhostText}>Review</Text>
                  </Pressable>
                )}
                <Pressable onPress={confirmReopen} style={styles.closedBtn} hitSlop={6}>
                  <Text style={styles.closedBtnText}>Reopen</Text>
                </Pressable>
              </View>
            ) : (
              <View>
                {recording && (
                  <View style={styles.recordingBar}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingText}>Recording… tap the stop button to send</Text>
                  </View>
                )}

                {pending && (
                  <View style={styles.previewBar}>
                    {pending.type === 'images' && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                        {pending.items.map((it, i) => (
                          <Image key={i} source={{ uri: it.uri }} style={styles.previewThumb} />
                        ))}
                      </ScrollView>
                    )}
                    {pending.type === 'doc' && (
                      <View style={styles.previewRow}>
                        <Ionicons name="document-text" size={22} color={colors.primary} />
                        <Text style={styles.previewText} numberOfLines={1}>{pending.items[0].name}</Text>
                      </View>
                    )}
                    {pending.type === 'audio' && (
                      <View style={styles.previewRow}>
                        <Pressable onPress={() => audioPreview?.play?.()} hitSlop={6}>
                          <Ionicons name="play-circle" size={28} color={colors.primary} />
                        </Pressable>
                        <Text style={styles.previewText}>Voice message ready</Text>
                      </View>
                    )}
                    <Pressable onPress={cancelPending} hitSlop={8} style={styles.previewCancel}>
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </Pressable>
                    <Pressable onPress={sendPending} disabled={busy} style={styles.previewSend}>
                      <Ionicons name="send" size={18} color="#fff" />
                    </Pressable>
                  </View>
                )}

                <View style={styles.replyBar}>
                  {canDocs && (
                    <Pressable onPress={pickImages} disabled={busy || recording || !!pending} style={styles.iconBtn} hitSlop={6}>
                      <Ionicons name="image" size={22} color={colors.textMuted} />
                    </Pressable>
                  )}
                  {canDocs && (
                    <Pressable onPress={pickDocument} disabled={busy || recording || !!pending} style={styles.iconBtn} hitSlop={6}>
                      <Ionicons name="attach" size={22} color={colors.textMuted} />
                    </Pressable>
                  )}
                  <TextInput
                    value={reply} onChangeText={setReply} placeholder="Type a reply…"
                    placeholderTextColor={colors.textFaint} style={styles.replyInput}
                    editable={!recording}
                  />
                  {canVoice && !pending && (
                    <Pressable onPress={toggleRecording} disabled={busy} style={[styles.iconBtn, recording && styles.iconBtnActive]} hitSlop={6}>
                      <Ionicons name={recording ? 'stop' : 'mic'} size={22} color={recording ? colors.danger : colors.textMuted} />
                    </Pressable>
                  )}
                  <Pressable onPress={sendReply} disabled={busy || recording} style={styles.sendBtn}>
                    <Ionicons name="send" size={18} color="#fff" />
                  </Pressable>
                </View>
              </View>
            )}
          </KeyboardAvoidingView>
        )
      )}

      {/* Review prompt — pops when a closed ticket hasn't been rated (skippable) */}
      <Modal
        visible={!!reviewOpenFor && reviewOpenFor === active?._id}
        transparent
        animationType="slide"
        onRequestClose={dismissReview}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <RatingCard agent={active?.assignedTo} busy={busy} onSubmit={submitRating} />
              <Pressable onPress={dismissReview} style={styles.modalCancel} hitSlop={6}>
                <Text style={styles.modalCancelText}>Not now</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {view === 'thread' && active?._id && <CallScreen ref={callRef} ticketId={active._id} />}
    </View>
  );
}

function Centered() {
  return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.sm,
  },
  cardTitle: { ...type.body, color: colors.text, fontWeight: '700' },
  cardMeta: { ...type.caption, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  status: { ...type.caption, fontWeight: '800', textTransform: 'capitalize' },

  fieldLabel: { ...type.eyebrow, color: colors.textMuted, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  textarea: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, minHeight: 120, textAlignVertical: 'top', ...type.body, color: colors.text,
  },

  threadSubject: { ...type.h2, color: colors.text },
  callRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primarySoft, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  callBtnText: { ...type.caption, color: colors.primary, fontWeight: '700' },
  bubble: { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, maxWidth: '85%' },
  bubbleMine: { backgroundColor: colors.orange, alignSelf: 'flex-end' },
  bubbleAdmin: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start' },
  bubbleSender: { ...type.micro, color: colors.textMuted, marginBottom: 2 },
  bubbleText: { ...type.body, color: colors.text },

  replyBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  replyInput: {
    flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, ...type.body, color: colors.text,
  },
  sendBtn: { backgroundColor: colors.primary, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconBtnActive: { backgroundColor: colors.dangerSoft },

  attachChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
    backgroundColor: colors.surfaceMuted, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 6, alignSelf: 'flex-start', maxWidth: '100%',
  },
  attachChipMine: { backgroundColor: 'rgba(255,255,255,0.18)' },
  attachText: { ...type.caption, color: colors.primary, fontWeight: '700', flexShrink: 1 },
  bubbleImage: { width: 200, height: 200, borderRadius: radius.md, marginTop: 6, backgroundColor: colors.surfaceMuted },

  previewBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  previewRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  previewText: { ...type.body, color: colors.text, flexShrink: 1 },
  previewThumb: { width: 56, height: 56, borderRadius: radius.sm, marginRight: 6, backgroundColor: colors.surfaceMuted },
  previewCancel: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  previewSend: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },

  recordingBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.dangerSoft,
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  recordingText: { ...type.caption, color: colors.danger, fontWeight: '700' },

  reopenBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.primarySoft,
  },
  reopenText: { ...type.caption, color: colors.primary, fontWeight: '700', flexShrink: 1 },

  ratedNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  ratedText: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  closedBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  closedTitle: { ...type.caption, color: colors.text, fontWeight: '700' },
  closedSub: { ...type.micro, color: colors.textMuted, marginTop: 2 },
  closedBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  closedBtnText: { ...type.caption, color: '#fff', fontWeight: '700' },
  closedGhostBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  closedGhostText: { ...type.caption, color: colors.textMuted, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surfaceMuted, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, maxHeight: '90%',
  },
  modalHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  modalCancel: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  modalCancelText: { ...type.caption, color: colors.textMuted, fontWeight: '700' },
  rateCard: {
    marginTop: spacing.lg, padding: spacing.lg, alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  rateTitle: { ...type.body, color: colors.text, fontWeight: '700', marginBottom: spacing.md },
  starRow: { flexDirection: 'row', alignItems: 'center' },
  rateHint: { ...type.micro, color: colors.textFaint, marginTop: spacing.sm },
  rateNote: {
    marginTop: spacing.md, alignSelf: 'stretch', minHeight: 64,
    backgroundColor: colors.surfaceMuted, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    ...type.body, color: colors.text, textAlignVertical: 'top',
  },
});
