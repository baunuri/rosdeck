import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>SOMETHING WENT WRONG</Text>
          <Text style={styles.message}>{this.state.error?.message || 'Unknown error'}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.buttonText}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgBase,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  title: {
    fontFamily: 'SpaceMono',
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.statusError,
    letterSpacing: 1,
    marginBottom: 12,
  },
  message: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  button: {
    backgroundColor: theme.colors.accentPrimary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: theme.radius.md,
  },
  buttonText: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
});
