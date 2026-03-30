import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onTryDemo?: () => void;
}

export function SetupGuide({ visible, onClose, onTryDemo }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>GETTING STARTED</Text>
            <Text style={styles.body}>
              This app connects to your ROS 2 robot over Wi-Fi. You need one of these running on your robot:
            </Text>

            <View style={styles.section}>
              <View style={styles.recommendedBadge}>
                <Ionicons name="star" size={12} color={theme.colors.statusConnected} />
                <Text style={styles.recommendedText}>RECOMMENDED</Text>
              </View>
              <Text style={styles.sectionTitle}>FOXGLOVE BRIDGE</Text>
              <Text style={styles.body}>Better performance, binary CDR support, built-in topic discovery.</Text>
              <View style={styles.codeBlock}>
                <Text style={styles.code}>sudo apt install ros-$ROS_DISTRO-foxglove-bridge</Text>
                <Text style={styles.code}>ros2 launch foxglove_bridge foxglove_bridge_launch.xml</Text>
              </View>
              <Text style={styles.detail}>Default port: 8765</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ALTERNATIVE: ROSBRIDGE</Text>
              <Text style={styles.body}>Widely used, JSON-based protocol.</Text>
              <View style={styles.codeBlock}>
                <Text style={styles.code}>sudo apt install ros-$ROS_DISTRO-rosbridge-suite</Text>
                <Text style={styles.code}>ros2 launch rosbridge_server rosbridge_websocket_launch.xml</Text>
              </View>
              <Text style={styles.detail}>Default port: 9090</Text>
              <Text style={styles.detail}>For topic discovery, also install ros-$ROS_DISTRO-rosapi</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>STEPS</Text>
              <Text style={styles.step}>1. Connect your phone to the same Wi-Fi as the robot</Text>
              <Text style={styles.step}>2. Start foxglove_bridge or rosbridge on the robot</Text>
              <Text style={styles.step}>3. Enter the robot's IP address and port above</Text>
              <Text style={styles.step}>4. Tap CONNECT</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>CAMERA STREAM</Text>
              <Text style={styles.body}>For camera feed via MJPEG, also run web_video_server:</Text>
              <View style={styles.codeBlock}>
                <Text style={styles.code}>sudo apt install ros-$ROS_DISTRO-web-video-server</Text>
                <Text style={styles.code}>ros2 run web_video_server web_video_server</Text>
              </View>
              <Text style={styles.detail}>Default port: 8080</Text>
            </View>
          </ScrollView>

          <View style={styles.buttonRow}>
            {onTryDemo && (
              <TouchableOpacity style={[styles.button, styles.demoButton]} onPress={onTryDemo}>
                <Text style={[styles.buttonText, styles.demoButtonText]}>TRY DEMO</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.button, styles.gotItButton]} onPress={onClose}>
              <Text style={styles.buttonText}>GOT IT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000000CC',
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.lg,
    maxHeight: '85%',
  },
  content: {
    padding: 20,
  },
  title: {
    fontFamily: 'SpaceMono',
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.accentPrimary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  recommendedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  recommendedText: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.statusConnected,
    letterSpacing: 0.8,
  },
  body: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  codeBlock: {
    backgroundColor: theme.colors.bgBase,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.md,
    padding: 10,
    marginVertical: 6,
  },
  code: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.statusConnected,
    lineHeight: 18,
  },
  detail: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  step: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    margin: 16,
    marginTop: 0,
  },
  button: {
    backgroundColor: theme.colors.accentPrimary,
    padding: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  demoButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.statusConnecting,
    margin: 0,
  },
  demoButtonText: {
    color: theme.colors.statusConnecting,
  },
  gotItButton: {
    flex: 1,
    margin: 0,
  },
  buttonText: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
});
