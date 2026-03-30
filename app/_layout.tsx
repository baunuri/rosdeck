import 'react-native-get-random-values';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from 'react-native-reanimated';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { useRosStore } from '../stores/useRosStore';
import { useOnboardingStore } from '../stores/useOnboardingStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { ErrorBoundary } from '../components/ErrorBoundary';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  useEffect(() => {
    useRosStore.getState().loadSavedConnections();
    useOnboardingStore.getState().loadOnboarding();
    useSettingsStore.getState().load();

    const handleAppState = (nextState: AppStateStatus) => {
      const store = useRosStore.getState();
      if (nextState === 'background' || nextState === 'inactive') {
        if (store.connection.ros) {
          store.connection.ros.close();
        }
      } else if (nextState === 'active') {
        if (store.connection.url && store.connection.status !== 'connected') {
          store.connectToUrl(store.connection.url);
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  const keepAwake = useSettingsStore((s) => s.keepAwake);
  const connectionStatus = useRosStore((s) => s.connection.status);

  useEffect(() => {
    if (keepAwake && connectionStatus === 'connected') {
      activateKeepAwakeAsync();
    } else {
      deactivateKeepAwake();
    }
  }, [keepAwake, connectionStatus]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <ThemeProvider value={DarkTheme}>
          <StatusBar style="light" />
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
