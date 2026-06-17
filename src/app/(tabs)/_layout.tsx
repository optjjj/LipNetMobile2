import { Stack, Link, Tabs } from 'expo-router';
import {ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {Ionicons} from "@expo/vector-icons";

export default function TabsLayout() {
  return (
    <Tabs
    
      screenOptions={{
        tabBarActiveTintColor: '#1A1A1A',
        tabBarInactiveTintColor: '#b8b8b8',
        headerShown: false,
      }}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} /> }} />
        <Tabs.Screen name="about" options={{ title: 'About', tabBarIcon: ({ color }) => <Ionicons name="information-circle" size={24} color={color} /> }} />
        <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: ({ color }) => <Ionicons name="search" size={24} color={color} /> }} />
        <Tabs.Screen name="camera_test" options={{ title: 'Camera', tabBarIcon: ({ color }) => <Ionicons name="camera" size={24} color={color} /> }} />
        <Tabs.Screen name="face_detect" options={{title: 'face', tabBarIcon: ({color}) => <Ionicons name="camera" size={24} color={color}/>}} />
    </Tabs>

  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    backgroundColor: "#cea323",
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