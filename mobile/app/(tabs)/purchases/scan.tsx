import React, { useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { uploadPurchaseDocument } from "@/services/purchases";
import { ApiError } from "@/services/api";
import { normalizeAsset, isAcceptedType, kindOf, ACCEPTED_TYPES_LABEL, type NormalizedFile } from "@/lib/fileType";

type Captured = NormalizedFile;

export default function ScanDocumentScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Set when a staff member scans on behalf of a client, from the
  // Client detail screen ("Scan a purchase for this client") — forwarded
  // to the upload as `userId` (see services/purchases.ts), which the
  // backend already supports for staff callers.
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (photo) {
      // expo-camera's takePictureAsync always outputs a real JPEG file —
      // no mimeType field on its result, so "camera" is the correct
      // source hint here (see lib/fileType.ts).
      setCaptured(normalizeAsset({ uri: photo.uri }, "camera"));
      setError(null);
    }
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      // Use what Expo actually reports for this asset (mimeType/fileName)
      // instead of assuming JPEG — a library pick can just as easily be a
      // PNG or a screenshot.
      const normalized = normalizeAsset(asset, "library");
      if (!isAcceptedType(normalized.type)) {
        setError(`That file type isn't supported. Only ${ACCEPTED_TYPES_LABEL} are allowed.`);
        return;
      }
      setCaptured(normalized);
      setError(null);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      // Restrict the OS picker itself to the accepted types where
      // possible; this is a UX nicety, not the real protection — the
      // isAcceptedType() check below and the backend's own validation
      // are what actually enforce it.
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const normalized = normalizeAsset(asset, "document");
    if (!isAcceptedType(normalized.type)) {
      setError(`That file type isn't supported. Only ${ACCEPTED_TYPES_LABEL} are allowed.`);
      return;
    }
    setCaptured(normalized);
    setError(null);
  };

  const confirmUpload = async () => {
    if (!captured) return;
    setUploading(true);
    setError(null);
    try {
      const doc = await uploadPurchaseDocument(captured, clientId ? { userId: clientId } : undefined);
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["purchases-all"] });
      router.replace(`/purchases/${doc.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  // --- Preview / confirm step ---
  if (captured) {
    const isPdf = kindOf(captured.type) === "pdf";
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {isPdf ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md }}>
            <Ionicons name="document-text-outline" size={64} color={colors.textMuted} />
            <Text style={typography.h3}>{captured.name}</Text>
            <Text style={typography.bodyMuted}>PDF document ready to upload</Text>
          </View>
        ) : (
          <Image source={{ uri: captured.uri }} style={{ flex: 1 }} resizeMode="contain" />
        )}
        {error ? (
          <Text style={{ color: colors.danger, textAlign: "center", padding: spacing.md }}>{error}</Text>
        ) : null}
        <View style={{ flexDirection: "row", padding: spacing.lg, gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton title="Retake" onPress={() => setCaptured(null)} disabled={uploading} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton title="Confirm & upload" onPress={confirmUpload} loading={uploading} />
          </View>
        </View>
      </View>
    );
  }

  // --- Permission not yet granted ---
  if (!permission) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md }}>
        <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
        <Text style={[typography.h3, { textAlign: "center" }]}>Camera access needed</Text>
        <Text style={[typography.bodyMuted, { textAlign: "center" }]}>
          Boekhouder needs camera access to scan purchase documents.
        </Text>
        {error ? <Text style={{ color: colors.danger, textAlign: "center" }}>{error}</Text> : null}
        <PrimaryButton title="Grant access" onPress={requestPermission} />
        <Pressable onPress={pickFromLibrary}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Choose a photo instead</Text>
        </Pressable>
        <Pressable onPress={pickDocument}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Choose a PDF instead</Text>
        </Pressable>
      </View>
    );
  }

  // --- Camera step ---
  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
      {error ? (
        <View style={{ position: "absolute", top: spacing.xl, left: spacing.lg, right: spacing.lg }}>
          <Text style={{ color: "white", backgroundColor: colors.danger, padding: spacing.sm, borderRadius: 8, textAlign: "center" }}>
            {error}
          </Text>
        </View>
      ) : null}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-around",
          paddingVertical: spacing.xl,
          paddingBottom: spacing.xxl,
        }}
      >
        <Pressable onPress={pickFromLibrary} style={{ padding: spacing.md }}>
          <Ionicons name="images-outline" size={28} color="white" />
        </Pressable>
        <Pressable
          onPress={takePhoto}
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: "white",
            borderWidth: 4,
            borderColor: "rgba(255,255,255,0.4)",
          }}
        />
        <Pressable onPress={pickDocument} style={{ padding: spacing.md }}>
          <Ionicons name="document-attach-outline" size={26} color="white" />
        </Pressable>
      </View>
    </View>
  );
}
