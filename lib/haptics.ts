import * as ExpoHaptics from 'expo-haptics';
import { useSettingsStore } from '../stores/useSettingsStore';

export const ImpactFeedbackStyle = ExpoHaptics.ImpactFeedbackStyle;
export const NotificationFeedbackType = ExpoHaptics.NotificationFeedbackType;

export function impactAsync(style: ExpoHaptics.ImpactFeedbackStyle) {
  if (useSettingsStore.getState().hapticsEnabled) {
    ExpoHaptics.impactAsync(style);
  }
}

export function notificationAsync(type: ExpoHaptics.NotificationFeedbackType) {
  if (useSettingsStore.getState().hapticsEnabled) {
    ExpoHaptics.notificationAsync(type);
  }
}

export function selectionAsync() {
  if (useSettingsStore.getState().hapticsEnabled) {
    ExpoHaptics.selectionAsync();
  }
}
