import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ConnectionForm } from '../../components/ConnectionForm';
import { SavedConnections } from '../../components/SavedConnections';
import { ConnectionStatus } from '../../components/ConnectionStatus';
import { SetupGuide } from '../../components/SetupGuide';
import { useRosStore } from '../../stores/useRosStore';
import { useOnboardingStore } from '../../stores/useOnboardingStore';
import { useRouter } from 'expo-router';
import { theme } from '../../constants/theme';

export default function ConnectScreen() {
  const loadSavedConnections = useRosStore((s) => s.loadSavedConnections);
  const savedConnections = useRosStore((s) => s.savedConnections);
  const router = useRouter();
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    loadSavedConnections();
  }, []);

  useEffect(() => {
    if (savedConnections.length === 0) {
      setShowGuide(true);
    }
  }, [savedConnections.length]);

  const handleTryDemo = () => {
    setShowGuide(false);
    useRosStore.getState().setTransportType('demo');
    useRosStore.getState().connectToUrl('demo://localhost');
    useOnboardingStore.getState().setHasUsedDemo();
    router.push('/(tabs)/control');
  };

  const handleSelectSaved = (url: string) => {
    const saved = useRosStore.getState().savedConnections.find((c) => c.url === url);
    if (saved?.transport) {
      useRosStore.getState().setTransportType(saved.transport);
    }
    useRosStore.getState().connectToUrl(url);
    router.push('/(tabs)/control');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>CONNECT</Text>
        <TouchableOpacity onPress={() => setShowGuide(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="information-circle-outline" size={22} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={styles.statusRow}><ConnectionStatus /></View>
          <ConnectionForm />
          <SavedConnections onSelect={handleSelectSaved} />
          <TouchableOpacity style={styles.demoRow} onPress={handleTryDemo}>
            <Ionicons name="play-circle-outline" size={18} color={theme.colors.statusConnecting} />
            <Text style={styles.demoText}>Try Demo — no robot needed</Text>
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
      <SetupGuide visible={showGuide} onClose={() => setShowGuide(false)} onTryDemo={handleTryDemo} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgBase,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  headerTitle: {
    fontFamily: 'SpaceMono',
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    letterSpacing: 1,
  },
  statusRow: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.md,
  },
  demoText: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
});
