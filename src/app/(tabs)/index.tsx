import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

const RECENT_PREDICTIONS = [
  { id: 1, text: "bin blue at f two now", time: "2m ago" },
  { id: 2, text: "lay red by s zero again", time: "14m ago" },
  { id: 3, text: "place green at a nine please", time: "1h ago" },
];

export default function HomeScreen() {
  const [showAbout, setShowAbout] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F6F3" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <View style={styles.logoInner} />
          </View>
          <View>
            <Text style={styles.appName}>LipNet</Text>
            <Text style={styles.appTagline}>Silent speech recognition</Text>
          </View>
        </View>

        {/* About panel */}
        {showAbout && (
          <View style={styles.aboutPanel}>
            <Text style={styles.aboutTitle}>About LipNet</Text>
            <Text style={styles.aboutText}>
              LipNet uses deep learning to recognize speech from lip movements alone.
              Point the camera at your face, press record, speak silently, and the
              model will transcribe what you said.
            </Text>
            <Text style={styles.aboutText}>
              Built with LipNet + SCRFD face detection. Trained on the GRID corpus.
            </Text>
          </View>
        )}

        {/* Hero area */}
        <View style={styles.hero}>
          <View style={styles.waveformContainer}>
            {[0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 0.3, 0.75, 0.55, 0.9, 0.4].map(
              (h, i) => (
                <View
                  key={i}
                  style={[styles.waveBar, { height: h * 48, opacity: 0.15 + h * 0.5 }]}
                />
              )
            )}
          </View>
          <Text style={styles.heroLabel}>Ready to read lips</Text>
        </View>

        {/* Record button */}
        <TouchableOpacity style={styles.recordButton} activeOpacity={0.85}>
          <View style={styles.recordDot} />
          <Text style={styles.recordText}>Start Recording</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>Press and hold to capture · Release to predict</Text>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Recent</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Recent predictions */}
        {RECENT_PREDICTIONS.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No predictions yet.</Text>
            <Text style={styles.emptySubtext}>Your results will appear here.</Text>
          </View>
        ) : (
          <View style={styles.predictionList}>
            {RECENT_PREDICTIONS.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.predictionCard,
                  index === 0 && styles.predictionCardFirst,
                ]}
              >
                <View style={styles.predictionIndex}>
                  <Text style={styles.predictionIndexText}>{index + 1}</Text>
                </View>
                <Text style={styles.predictionCardText}>{item.text}</Text>
                <Text style={styles.predictionTime}>{item.time}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F6F3",
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 28,
    gap: 12,
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  logoInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#F7F6F3",
    borderWidth: 2,
    borderColor: "#F7F6F3",
  },
  appName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: -0.5,
  },
  appTagline: {
    fontSize: 12,
    color: "#888",
    letterSpacing: 0.2,
  },
  aboutBtn: {
    marginLeft: "auto",
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#DDDBD6",
    alignItems: "center",
    justifyContent: "center",
  },
  aboutBtnText: {
    fontSize: 14,
    color: "#888",
    fontWeight: "600",
  },

  // About
  aboutPanel: {
    backgroundColor: "#EEECEA",
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#DDDBD6",
  },
  aboutTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  aboutText: {
    fontSize: 13,
    color: "#555",
    lineHeight: 20,
    marginBottom: 6,
  },

  // Hero
  hero: {
    alignItems: "center",
    marginBottom: 32,
    paddingVertical: 24,
    backgroundColor: "#EEECEA",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#DDDBD6",
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 16,
    height: 56,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: "#1A1A1A",
  },
  heroLabel: {
    fontSize: 13,
    color: "#888",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontWeight: "500",
  },

  // Record button
  recordButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    paddingVertical: 18,
    gap: 10,
    marginBottom: 10,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E84040",
  },
  recordText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#F7F6F3",
    letterSpacing: -0.3,
  },
  hint: {
    textAlign: "center",
    fontSize: 12,
    color: "#AAA",
    marginBottom: 32,
    letterSpacing: 0.1,
  },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#DDDBD6",
  },
  dividerText: {
    fontSize: 11,
    color: "#AAA",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: "600",
  },

  // Predictions
  predictionList: {
    gap: 8,
  },
  predictionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#EEECEA",
    gap: 12,
  },
  predictionCardFirst: {
    borderColor: "#1A1A1A",
    borderWidth: 1.5,
  },
  predictionIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F0EFEC",
    alignItems: "center",
    justifyContent: "center",
  },
  predictionIndexText: {
    fontSize: 11,
    color: "#888",
    fontWeight: "700",
  },
  predictionCardText: {
    flex: 1,
    fontSize: 14,
    color: "#1A1A1A",
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  predictionTime: {
    fontSize: 11,
    color: "#BBB",
    letterSpacing: 0.1,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 15,
    color: "#888",
    fontWeight: "500",
  },
  emptySubtext: {
    fontSize: 13,
    color: "#BBB",
    marginTop: 4,
  },
});