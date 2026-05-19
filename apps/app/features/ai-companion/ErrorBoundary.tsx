import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type State = {
  message: string | null;
};

export class AiCompanionErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = {
    message: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('AI Companion render error', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <View style={styles.screen}>
          <View style={styles.panel}>
            <Text style={styles.title}>AI Companion hit a display error</Text>
            <Text style={styles.body}>{this.state.message}</Text>
            <Pressable accessibilityRole="button" onPress={() => this.setState({ message: null })} style={styles.button}>
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  body: {
    color: '#667085',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#172033',
    borderRadius: 8,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DEE8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    margin: 24,
    maxWidth: 520,
    padding: 18,
  },
  screen: {
    alignItems: 'center',
    backgroundColor: '#FCFEFF',
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: '#172033',
    fontSize: 22,
    fontWeight: '900',
  },
});
