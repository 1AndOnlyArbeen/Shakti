import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { useFonts, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { JetBrainsMono_500Medium, JetBrainsMono_600SemiBold, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import NavDrawer from './components/NavDrawer';
import { MenuIcon, BellIcon } from './components/Icons';
import { userApi } from './api/user.api';
import { AuthProvider, useAuth } from './context/AuthContext';
import DriverShell from './screens/driver/DriverShell';
import ContactSupportScreen from './screens/ContactSupportScreen';
import DriverPendingScreen from './screens/DriverPendingScreen';
import DriverVehicleScreen from './screens/DriverVehicleScreen';
import HomeScreen from './screens/home';
import InboxScreen from './screens/InboxScreen';
import LoginScreen from './screens/LoginScreen';
import OtpScreen from './screens/OtpScreen';
import ProfileScreen from './screens/ProfileScreen';
import RegisterScreen from './screens/RegisterScreen';
import RoleSelectScreen from './screens/RoleSelectScreen';
import SubscriptionScreen from './screens/SubscriptionScreen';
import SupportScreen from './screens/SupportScreen';
import TripsScreen from './screens/TripsScreen';
import { colors, isDark } from './theme/colors';
import { STATUS_TOP_PAD } from './theme';
import useBackHandler, { BACK_DEPTH } from './utils/useBackHandler';

// App is a white (Uber-style light) theme, so the status bar needs dark icons.
const STATUS_BAR_STYLE = 'dark-content';

// Titles shown in the top bar next to the hamburger, per active nav tab.
const TAB_TITLES = {
  home: 'Home',
  trips: 'Trips',
  subscribe: 'Subscribe',
  inbox: 'Notifications',
  support: 'Support',
  account: 'Account',
};

// authScreen values:
// 'role-select' | 'login' | 'register' | 'otp' - unauthenticated
// 'driver-vehicle' | 'driver-pending'          - authenticated, driver onboarding
function AppShell() {
  const { user, loading } = useAuth();
  const [authScreen, setAuthScreen] = useState('role-select');
  const [role, setRole] = useState('passenger'); // 'passenger' | 'driver'
  const [pendingPhone, setPendingPhone] = useState('');
  const [tab, setTab] = useState('home');
  const [subInitialTab, setSubInitialTab] = useState('active'); // which subscription tab to open on
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlay, setOverlay] = useState(null);
  const [mode, setModeState] = useState('passenger'); // 'passenger' | 'driver'
  const [driverApproved, setDriverApproved] = useState(false);

  // Restore last-used mode across restarts
  useEffect(() => {
    AsyncStorage.getItem('shakti_mode').then((m) => {
      if (m === 'driver') setModeState('driver');
    });
  }, []);

  // The /users/profile payload doesn't always embed the driver profile, so
  // fetch the driver record directly to know if the user may enter driver mode.
  useEffect(() => {
    if (!user) { setDriverApproved(false); return; }
    let cancelled = false;
    userApi.getMyDriverProfile()
      .then((res) => {
        const dp = res.data?.driver || res.data;
        if (!cancelled) setDriverApproved(dp?.status === 'approved');
      })
      .catch(() => { if (!cancelled) setDriverApproved(false); });
    return () => { cancelled = true; };
  }, [user]);

  const setMode = (m) => {
    setModeState(m);
    AsyncStorage.setItem('shakti_mode', m).catch(() => {});
  };

  // Only let a user enter driver mode if their driver profile is approved.
  // Trust either the embedded profile or the directly-fetched driver record.
  const approvedDriver =
    user?.driverProfile?.status === 'approved' || driverApproved;
  const effectiveMode = mode === 'driver' && approvedDriver ? 'driver' : 'passenger';

  // Do NOT force approved drivers into driver mode on login. The last-used mode
  // is persisted (AsyncStorage via setMode) and restored on mount above, so a
  // driver who switched to passenger mode and logged out reopens in passenger
  // mode. Drivers switch to driver mode manually from the Account screen.

  // After OTP verification the user becomes set in context.
  // If they chose the driver role, transition to vehicle details form.
  useEffect(() => {
    if (user && role === 'driver' && authScreen === 'otp') {
      setAuthScreen('driver-vehicle');
    }
  }, [user, role, authScreen]);

  // Reset to home tab on passenger login
  useEffect(() => {
    if (user && role === 'passenger') setTab('home');
  }, [user, role]);

  // Android hardware back. Walk back through our own screens instead of letting
  // the OS drop the user straight out of the app; only a second press on a root
  // screen actually exits. Deeper screens (HomeScreen's sheets, DriverShell,
  // Support threads) register their own handlers and get first refusal.
  const lastExitPress = useRef(0);
  const confirmExit = () => {
    const now = Date.now();
    if (now - lastExitPress.current < 2000) return false; // second press → exit
    lastExitPress.current = now;
    if (Platform.OS === 'android') ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
    return true;
  };

  useBackHandler(() => {
    if (!user) {
      if (authScreen === 'otp') { setAuthScreen('register'); return true; }
      if (authScreen !== 'role-select') { setAuthScreen('role-select'); return true; }
      return confirmExit();
    }
    if (authScreen === 'driver-vehicle') { setAuthScreen('otp'); return true; }
    if (authScreen === 'driver-pending') return confirmExit();
    if (effectiveMode === 'driver') return confirmExit(); // DriverShell handled its own first
    if (menuOpen) { setMenuOpen(false); return true; }
    if (overlay) { setOverlay(null); return true; }
    if (tab !== 'home') { setTab('home'); return true; }
    return confirmExit();
  }, { depth: BACK_DEPTH.app });

  if (loading) {
    return (
      <SafeAreaView style={styles.splash}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // Driver onboarding (user is logged in but completing driver setup)
  if (user && authScreen === 'driver-vehicle') {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle={STATUS_BAR_STYLE} backgroundColor={colors.background} />
        <DriverVehicleScreen
          onSuccess={() => setAuthScreen('driver-pending')}
          onBack={() => setAuthScreen('otp')}
        />
      </SafeAreaView>
    );
  }

  if (user && authScreen === 'driver-pending') {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle={STATUS_BAR_STYLE} backgroundColor={colors.background} />
        <DriverPendingScreen />
      </SafeAreaView>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle={STATUS_BAR_STYLE} backgroundColor={colors.background} />

        {authScreen === 'role-select' && (
          <RoleSelectScreen
            onPassenger={() => { setRole('passenger'); setAuthScreen('register'); }}
            onDriver={() => { setRole('driver'); setAuthScreen('register'); }}
            onSignIn={() => setAuthScreen('login')}
            onContact={() => setAuthScreen('contact')}
          />
        )}

        {authScreen === 'login' && (
          <LoginScreen
            onGoToRegister={() => setAuthScreen('role-select')}
            onContact={() => setAuthScreen('contact')}
          />
        )}

        {authScreen === 'contact' && (
          <ContactSupportScreen onBack={() => setAuthScreen('role-select')} />
        )}

        {authScreen === 'register' && (
          <RegisterScreen
            onGoToLogin={() => setAuthScreen('login')}
            onRegistered={(phone) => {
              setPendingPhone(phone);
              setAuthScreen('otp');
            }}
          />
        )}

        {authScreen === 'otp' && (
          <OtpScreen
            phone={pendingPhone}
            onSuccess={() => {
              // For passengers, AuthContext sets user → this branch re-renders to passenger app.
              // For drivers, the useEffect above catches user being set and moves to driver-vehicle.
            }}
            onBack={() => setAuthScreen('register')}
          />
        )}
      </SafeAreaView>
    );
  }

  const signOut = async () => {
    setOverlay(null);
    setTab('home');
    setAuthScreen('role-select');
    setRole('passenger');
    // Keep the last-used mode (driver/passenger) so re-login reopens in it.
  };

  // Driver mode
  if (effectiveMode === 'driver') {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle={STATUS_BAR_STYLE} backgroundColor={colors.background} />
        <DriverShell
          initialOnline={user?.driverProfile?.isOnline ?? false}
          onSwitchToPassenger={() => setMode('passenger')}
          onSignOut={signOut}
        />
      </SafeAreaView>
    );
  }

  // Passenger app
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle={STATUS_BAR_STYLE} backgroundColor={colors.background} />

      {overlay === 'subscription' && (
        <SubscriptionScreen onBack={() => setOverlay(null)} />
      )}

      {!overlay && (
        <View style={styles.body}>
          <View style={styles.topbar}>
            <Pressable
              style={styles.menuBtn}
              onPress={() => setMenuOpen(true)}
              hitSlop={8}
            >
              <MenuIcon size={26} color={colors.text} />
            </Pressable>
            <Text style={styles.topbarTitle}>{TAB_TITLES[tab] || ''}</Text>
            <Pressable
              style={styles.menuBtn}
              onPress={() => setTab('inbox')}
              hitSlop={8}
            >
              <BellIcon size={24} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.content}>
            {tab === 'home' && (
              <HomeScreen
                onOpenSubscription={() => { setSubInitialTab('browse'); setTab('subscribe'); }}
              />
            )}
            {tab === 'trips' && <TripsScreen />}
            {tab === 'subscribe' && <SubscriptionScreen onBack={() => setTab('home')} initialTab={subInitialTab} />}
            {tab === 'inbox' && <InboxScreen />}
            {tab === 'support' && <SupportScreen role="passenger" onBack={() => setTab('home')} />}
            {tab === 'account' && (
              <ProfileScreen
                onBack={() => setTab('home')}
                onSignOut={signOut}
                onOpenSubscription={() => { setSubInitialTab('active'); setTab('subscribe'); }}
                onSwitchToDriver={() => setMode('driver')}
              />
            )}
          </View>
          <NavDrawer
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            active={tab}
            onChange={(t) => { if (t === 'subscribe') setSubInitialTab('active'); setTab(t); }}
            isDriver={approvedDriver}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <SafeAreaView style={styles.splash}>
        <StatusBar barStyle={STATUS_BAR_STYLE} backgroundColor={colors.background} />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  splash: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  content: { flex: 1 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: STATUS_TOP_PAD + 6,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topbarTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text },
});
