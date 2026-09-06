import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, shadow, spacing, STATUS_TOP_PAD, type } from '../../theme';
import { userApi } from '../../api/user.api';
import InboxScreen from '../InboxScreen';
import ProfileScreen from '../ProfileScreen';
import SupportScreen from '../SupportScreen';
import DriverEarnings from './DriverEarnings';
import DriverHome from './DriverHome';
import useDriverFlow from './useDriverFlow';
import useBackHandler, { BACK_DEPTH } from '../../utils/useBackHandler';

const TABS = [
  { id: 'home', label: 'Drive', icon: 'car-sport' },
  { id: 'earnings', label: 'Earnings', icon: 'wallet' },
  { id: 'support', label: 'Support', icon: 'chatbubble-ellipses' },
  { id: 'account', label: 'Account', icon: 'person' },
];

function DriverTabBar({ active, onChange, locked }) {
  return (
    <View style={styles.tabbar}>
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <Pressable
            key={t.id}
            style={styles.tab}
            onPress={() => !locked && onChange(t.id)}
            hitSlop={6}
          >
            <Ionicons
              name={isActive ? t.icon : `${t.icon}-outline`}
              size={23}
              color={isActive ? colors.primary : (locked ? colors.textFaint : colors.textMuted)}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Always-visible driver status strip: shows they're in driving mode + total
// trips, with support and notifications reachable from the top-right anywhere.
function DriverTopBar({ online, totalRides, unread, onNotifications, onSos }) {
  return (
    <View style={styles.topbar}>
      <View style={styles.topbarLeft}>
        <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.textFaint }]} />
        <Text style={styles.topbarTitle}>Driving mode</Text>
        {totalRides != null && (
          <Text style={styles.topbarSub}>· {totalRides} trips</Text>
        )}
      </View>
      <View style={styles.topbarRight}>
        <Pressable style={styles.sosBtn} onPress={onSos} hitSlop={8}>
          <Ionicons name="warning" size={14} color="#fff" />
          <Text style={styles.sosText}>SOS</Text>
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={onNotifications} hitSlop={8}>
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// Nicer SOS confirmation: grabs the current location, then on confirm raises
// the emergency AND opens a pre-filled SMS (with a maps link) to send to contacts.
function SosModal({ visible, onClose, onConfirm }) {
  const [coords, setCoords] = useState(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  // Grab the location silently in the background — never shown in the UI.
  useEffect(() => {
    if (!visible) return;
    setCoords(null); setNote(''); setSending(false);
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch { /* location optional */ }
    })();
  }, [visible]);

  const send = async () => {
    setSending(true);
    try {
      const trimmed = note.trim();
      await onConfirm(coords, trimmed);
      const mapsLink = coords ? `https://maps.google.com/?q=${coords.lat},${coords.lng}` : null;
      const body = `SOS! I need emergency help.${trimmed ? ` ${trimmed}` : ''}${mapsLink ? ` My live location: ${mapsLink}` : ''}`;
      Linking.openURL(`sms:?body=${encodeURIComponent(body)}`).catch(() => {});
      onClose();
    } catch (e) {
      Alert.alert('Could not send SOS', e?.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sosBackdrop} onPress={() => !sending && onClose()} />
      <View style={styles.sosWrap} pointerEvents="box-none">
        <View style={styles.sosCard}>
          <View style={styles.sosIconWrap}>
            <Ionicons name="warning" size={32} color={colors.danger} />
          </View>
          <Text style={styles.sosTitle}>Send emergency SOS?</Text>
          <Text style={styles.sosDesc}>
            This alerts the Tempu team with your live location, and opens a text message you can send to your contacts.
          </Text>

          <TextInput
            style={styles.sosNote}
            placeholder="Add a note (optional) — what's happening?"
            placeholderTextColor={colors.textFaint}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={300}
            editable={!sending}
          />

          <Pressable style={[styles.sosSend, sending && { opacity: 0.7 }]} onPress={send} disabled={sending}>
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="alert-circle" size={18} color="#fff" />
                <Text style={styles.sosSendText}>Send SOS now</Text>
              </>
            )}
          </Pressable>
          <Pressable style={styles.sosCancel} onPress={() => !sending && onClose()} disabled={sending}>
            <Text style={styles.sosCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function OverlayHeader({ title, onBack }) {
  return (
    <View style={styles.overlayHeader}>
      <Pressable onPress={onBack} hitSlop={8}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>
      <Text style={styles.overlayTitle}>{title}</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

/**
 * The full Driver Mode workspace. Owns the driver flow hook so online state,
 * nearby trips, and an in-progress trip persist while switching tabs. A shared
 * top bar keeps "driving mode", trip count, support and notifications available
 * on every driver screen.
 */
export default function DriverShell({ initialOnline, onSwitchToPassenger, onSignOut }) {
  const [tab, setTab] = useState('home');
  const [overlay, setOverlay] = useState(null); // 'support' | 'notifications' | null
  const [totalRides, setTotalRides] = useState(null);
  const [unread, setUnread] = useState(0);
  const [vehicleType, setVehicleType] = useState(null);
  const [subscriptionDriver, setSubscriptionDriver] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const flow = useDriverFlow(initialOnline);

  // Load the trip count, unread notifications, and vehicle type for the UI.
  useEffect(() => {
    userApi.getMyEarnings()
      .then((r) => setTotalRides(r.data?.totalRides ?? 0))
      .catch(() => {});
    userApi.getNotifications(1)
      .then((r) => {
        const items = r.data?.notifications || r.data || [];
        setUnread(items.filter((n) => !n.isRead).length);
      })
      .catch(() => {});
    userApi.getMyDriverProfile()
      .then((r) => {
        setVehicleType((r.data?.driver || r.data)?.vehicleType || null);
        setSubscriptionDriver(!!r.data?.subscriptionDriver);
      })
      .catch(() => {});
  }, []);

  const openNotifications = () => {
    setOverlay('notifications');
    setUnread(0);
    userApi.markAllNotificationsRead().catch(() => {});
  };

  // SOS: raise an emergency alert to the Tempu team, using the freshly grabbed
  // location (falls back to the driver flow's last known coords). Throws on
  // failure so the modal can surface it.
  const handleSosConfirm = async (coords, note) => {
    await userApi.triggerEmergency({
      role: 'driver',
      lat: coords?.lat ?? flow.coords?.lat,
      lng: coords?.lng ?? flow.coords?.lng,
      message: note || 'Driver SOS — emergency help needed',
    });
  };

  // While driving an active trip, lock the tabs to the Drive screen.
  const drivingLocked = !!flow.activeTrip && flow.activeTrip.status !== 'completed';

  // Hardware back inside driver mode: close what's on top, then fall back to
  // the Drive tab. Unhandled presses bubble to AppShell's exit confirmation.
  useBackHandler(() => {
    if (sosOpen) { setSosOpen(false); return true; }
    if (overlay) { setOverlay(null); return true; }
    if (tab !== 'home') { setTab('home'); return true; }
    return false;
  }, { depth: BACK_DEPTH.shell });

  if (overlay === 'notifications') {
    return (
      <View style={styles.root}>
        <OverlayHeader title="Notifications" onBack={() => setOverlay(null)} />
        <View style={styles.body}><InboxScreen /></View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Support has its own header; every other tab gets the driving-mode strip. */}
      {tab !== 'support' && (
        <DriverTopBar
          online={flow.online}
          totalRides={totalRides}
          unread={unread}
          onNotifications={openNotifications}
          onSos={() => setSosOpen(true)}
        />
      )}
      <View style={styles.body}>
        {tab === 'home' && <DriverHome flow={flow} vehicleType={vehicleType} subscriptionDriver={subscriptionDriver} />}
        {tab === 'earnings' && <DriverEarnings />}
        {tab === 'support' && <SupportScreen role="driver" onBack={() => setTab('home')} />}
        {tab === 'account' && (
          <ProfileScreen
            onBack={() => setTab('home')}
            onSignOut={onSignOut}
            onSwitchToPassenger={onSwitchToPassenger}
          />
        )}
      </View>
      <DriverTabBar
        active={drivingLocked ? 'home' : tab}
        onChange={setTab}
        locked={drivingLocked}
      />
      <SosModal
        visible={sosOpen}
        onClose={() => setSosOpen(false)}
        onConfirm={handleSosConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },

  // Top status strip
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: STATUS_TOP_PAD + 4,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  topbarLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  topbarTitle: { ...type.bodyBold, color: colors.text },
  topbarSub: { ...type.caption, color: colors.textMuted },
  topbarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sosBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, height: 32, borderRadius: 16,
    backgroundColor: colors.danger,
  },
  sosText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, paddingHorizontal: 3,
    borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // Overlay (support / notifications)
  overlayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingTop: STATUS_TOP_PAD + 4, paddingBottom: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  overlayTitle: { ...type.h2, color: colors.text },

  // SOS confirmation modal
  sosBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sosWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  sosCard: {
    width: '100%', maxWidth: 360, backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', ...shadow.card,
  },
  sosIconWrap: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: colors.dangerSoft || '#ffdad6',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  sosTitle: { ...type.h2, color: colors.text, textAlign: 'center' },
  sosDesc: { ...type.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },
  sosNote: {
    alignSelf: 'stretch', marginTop: spacing.lg, minHeight: 64,
    backgroundColor: colors.surfaceMuted, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    ...type.body, color: colors.text, textAlignVertical: 'top',
  },
  sosSend: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    alignSelf: 'stretch', height: 52, borderRadius: radius.pill, backgroundColor: colors.danger,
    marginTop: spacing.lg,
  },
  sosSendText: { color: '#fff', ...type.bodyBold, fontSize: 16 },
  sosCancel: { alignSelf: 'stretch', height: 46, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  sosCancelText: { ...type.bodyBold, color: colors.textMuted },

  // Tab bar
  tabbar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    paddingBottom: 18,
  },
  tab: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 4 },
  label: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
  labelActive: { color: colors.primary, fontWeight: '700' },
});
