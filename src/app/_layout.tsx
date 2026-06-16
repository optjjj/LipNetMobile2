import { Stack, Link } from 'expo-router';
import {ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen 
        name="(tabs)" 
        options={{ title: 'Home', headerShown: false,}} />
      <Stack.Screen 
        name="+not-found" 
        options={{ title: '404', headerShown: false }} />
    </Stack>

  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    backgroundColor: "#F7F6F3",
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  link: {
    fontSize: 18,
    color: '#007AFF',
    marginTop: 20,
    textDecorationLine: 'underline',
  },
});