import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { fonts } from '../theme/type';

export default function LoginScreen({ onGoToRegister, onContact }) {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(null); // 'phone' | 'password'
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    setError('');
    const trimmedPhone = phone.trim();

    if (!trimmedPhone || !password) {
      setError('Please enter your phone number and password.');
      return;
    }
    if (trimmedPhone.length < 7) {
      setError('That phone number looks too short.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await login(trimmedPhone, password);
      // AuthContext sets user → AppShell re-renders to main app
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top bar: wordmark + help */}
      <View style={styles.header}>
        <Image source={require('../assets/logo-wordmark.png')} style={styles.brand} resizeMode="contain" />
        <View style={styles.headerBtn}>
          <Ionicons name="help" size={20} color={colors.textMuted} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.welcome}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Enter your details to access your account and start your journey.
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Phone */}
          <View style={styles.field}>
            <Text style={styles.label}>PHONE NUMBER</Text>
            <View
              style={[
                styles.inputBox,
                focused === 'phone' && styles.inputBoxFocused,
              ]}
            >
              <View style={styles.prefix}>
                <Text style={styles.prefixText}>+977</Text>
              </View>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                onFocus={() => setFocused('phone')}
                onBlur={() => setFocused(null)}
                placeholder="98XXXXXXXX"
                placeholderTextColor={colors.textFaint}
                keyboardType="phone-pad"
                maxLength={10}
                style={styles.input}
                autoComplete="tel"
                editable={!submitting}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>PASSWORD</Text>
              <Pressable
                hitSlop={8}
                onPress={() =>
                  Alert.alert(
                    'Forgot Password',
                    'Enter your registered phone number. An OTP will be sent to your email.',
                    [{ text: 'OK' }],
                  )
                }
              >
                <Text style={styles.forgot}>Forgot password?</Text>
              </Pressable>
            </View>
            <View
              style={[
                styles.inputBox,
                focused === 'password' && styles.inputBoxFocused,
              ]}
            >
              <TextInput
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                placeholder="••••••••"
                placeholderTextColor={colors.textFaint}
                secureTextEntry={!showPassword}
                style={[styles.input, { paddingLeft: 0 }]}
                autoComplete="password"
                editable={!submitting}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={22}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Primary CTA */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              submitting && styles.primaryButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={submitting}
          >
            <Text style={styles.primaryButtonText}>
              {submitting ? 'Logging in…' : 'Log in'}
            </Text>
          </Pressable>

          {/* OR divider */}
          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.line} />
          </View>

          {/* Create account */}
          <View style={styles.createRow}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Pressable onPress={onGoToRegister} hitSlop={8}>
              <Text style={styles.footerLink}>Create account</Text>
            </Pressable>
          </View>

          {onContact && (
            <Pressable onPress={onContact} hitSlop={8} style={styles.contactRow}>
              <Ionicons name="headset" size={18} color={colors.textMuted} />
              <Text style={styles.contactText}>Contact support</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 28 : 12,
    paddingBottom: 16,
    backgroundColor: colors.surface,
  },
  brand: {
    height: 44,
    width: 118,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },

  hero: { marginBottom: 40 },
  welcome: {
    fontFamily: fonts.displayBold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.3,
    color: colors.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textMuted,
  },

  form: { gap: 24 },
  field: { gap: 8 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.textMuted,
  },
  forgot: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.primary,
  },

  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  inputBoxFocused: {
    borderColor: colors.primary,
  },
  prefix: {
    paddingRight: 12,
    marginRight: 4,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  prefixText: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.primary,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingLeft: 8,
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.text,
  },

  error: {
    fontFamily: fonts.body,
    color: colors.danger,
    fontSize: 13,
    marginTop: -8,
  },

  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 8,
    ...{
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 24,
      elevation: 4,
    },
  },
  primaryButtonPressed: { backgroundColor: colors.primaryDark, transform: [{ scale: 0.98 }] },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: '#ffffff',
  },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.textMuted,
  },

  createRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 16 },
  footerLink: { fontFamily: fonts.bodyBold, color: colors.primary, fontSize: 16 },

  contactRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  contactText: {
    fontFamily: fonts.bodySemibold,
    color: colors.textMuted,
    fontSize: 14,
  },
});
