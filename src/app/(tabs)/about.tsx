import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const TECH_STACK = ["LipNet", "SCRFD", "GRID corpus", "React Native", "PyTorch"];

const INFO_ROWS = [
  { icon: "🧠", label: "Model", value: "LipNet + SCRFD face detection" },
  { icon: "📊", label: "Dataset", value: "GRID corpus · 1000+ sentences" },
  { icon: "📱", label: "Platform", value: "iOS · React Native" },
  {
    icon: "🔒",
    label: "Privacy",
    value: "All inference runs on-device. No video is ever uploaded or stored.",
  },
];

export default function AboutScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F6F3" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
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

        {/* Profile hero */}
        <View style={styles.profileHero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>You</Text>
          </View>
          <Text style={styles.profileName}>Designed & built by me</Text>
          <Text style={styles.profileRole}>ML Engineer · iOS Developer</Text>
        </View>

        {/* About block */}
        <View style={styles.aboutBlock}>
          <Text style={styles.aboutBlockTitle}>About this project</Text>
          <Text style={styles.aboutBlockText}>
            LipNet is a personal project bringing end-to-end lip reading to mobile.
            Point the camera at your face, speak silently, and the model transcribes
            what you said — no microphone required.
          </Text>
          <Text style={styles.aboutBlockText}>
            Training data comes from the GRID corpus. The model was trained from
            scratch and optimised for on-device inference.
          </Text>
          <View style={styles.chipRow}>
            {TECH_STACK.map((chip, index) => (
              <View
                key={chip}
                style={[styles.chip, index === 0 && styles.chipDark]}
              >
                <Text
                  style={[styles.chipText, index === 0 && styles.chipTextDark]}
                >
                  {chip}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Details</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          {INFO_ROWS.map((row, index) => (
            <View
              key={row.label}
              style={[
                styles.infoRow,
                index === INFO_ROWS.length - 1 && styles.infoRowLast,
              ]}
            >
              <View style={styles.infoIcon}>
                <Text style={styles.infoIconText}>{row.icon}</Text>
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoValue}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Training videos</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Video placeholder */}
        <View style={styles.videoNotice}>
          <View style={styles.videoNoticeIcon}>
            <View style={styles.videoPlay} />
          </View>
          <Text style={styles.videoNoticeLabel}>Coming soon</Text>
          <Text style={styles.videoNoticeSub}>
            Training process videos will appear here
          </Text>
        </View>

        {/* Version footer */}
        <View style={styles.versionRow}>
          <Text style={styles.versionText}>LipNet · v1.0.0</Text>
          <Text style={styles.versionText}>·</Text>
          <Text style={styles.versionText}>Designed by Tyler in Osaka</Text>
        </View>

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
  backBtn: {
    marginLeft: "auto",
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#DDDBD6",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnText: {
    fontSize: 16,
    color: "#888",
    fontWeight: "600",
  },

  // Profile hero
  profileHero: {
    alignItems: "center",
    marginBottom: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: "#EEECEA",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#DDDBD6",
    gap: 4,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: "700",
    color: "#F7F6F3",
    letterSpacing: -0.5,
  },
  profileName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: -0.5,
  },
  profileRole: {
    fontSize: 12,
    color: "#888",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontWeight: "500",
    marginTop: 2,
  },

  // About block
  aboutBlock: {
    backgroundColor: "#EEECEA",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#DDDBD6",
  },
  aboutBlockTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  aboutBlockText: {
    fontSize: 13,
    color: "#555",
    lineHeight: 20,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  chip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#DDDBD6",
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  chipDark: {
    backgroundColor: "#1A1A1A",
    borderColor: "#1A1A1A",
  },
  chipText: {
    fontSize: 12,
    color: "#555",
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  chipTextDark: {
    color: "#F7F6F3",
  },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 8,
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

  // Info card
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EEECEA",
    overflow: "hidden",
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EFEC",
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F0EFEC",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  infoIconText: {
    fontSize: 14,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: "#AAA",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    fontWeight: "600",
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    color: "#1A1A1A",
    fontWeight: "500",
    letterSpacing: -0.1,
    lineHeight: 20,
  },

  // Video placeholder
  videoNotice: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#DDDBD6",
    borderStyle: "dashed",
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  videoNoticeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0EFEC",
    alignItems: "center",
    justifyContent: "center",
  },
  videoPlay: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 12,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#AAA",
    marginLeft: 2,
  },
  videoNoticeLabel: {
    fontSize: 13,
    color: "#888",
    fontWeight: "500",
  },
  videoNoticeSub: {
    fontSize: 11,
    color: "#BBB",
    letterSpacing: 0.1,
  },

  // Version footer
  versionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
  },
  versionText: {
    fontSize: 11,
    color: "#CCC",
    letterSpacing: 0.2,
  },
});