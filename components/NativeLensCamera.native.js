import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, control, radius, space } from './theme';

export default function NativeLensCamera({ visible, accent, title, hint, cancelLabel, onCancel, onCapture, onError }) {
  const camera = useRef(null);
  const requested = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);

  useEffect(() => {
    if (!visible) { requested.current = false; return; }
    if (permission?.granted || requested.current) return;
    requested.current = true;
    requestPermission().catch(onError);
  }, [onError, permission?.granted, requestPermission, visible]);

  const take = async () => {
    if (!ready || taking || !camera.current) return;
    setTaking(true);
    try {
      const asset = await camera.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (asset?.uri) onCapture(asset);
    } catch (error) { onError(error); }
    finally { setTaking(false); }
  };

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)}>
            <View style={styles.scrimTop} />
            <View style={styles.frame} pointerEvents="none">
              <View style={[styles.corner, styles.topLeft, { borderColor: accent }]} /><View style={[styles.corner, styles.topRight, { borderColor: accent }]} />
              <View style={[styles.corner, styles.bottomLeft, { borderColor: accent }]} /><View style={[styles.corner, styles.bottomRight, { borderColor: accent }]} />
              <View style={[styles.scanLine, { backgroundColor: accent }]} />
            </View>
            <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
              <View style={styles.header}><TouchableOpacity style={styles.close} onPress={onCancel} accessibilityLabel={cancelLabel}><Ionicons name="close" size={26} color={colors.white} /></TouchableOpacity><View style={styles.heading}><Text style={styles.title}>{title}</Text><Text style={styles.hint}>{hint}</Text></View><View style={styles.close} /></View>
              <View style={styles.controls}><TouchableOpacity style={[styles.shutterRing, { borderColor: accent }]} onPress={take} disabled={!ready || taking} accessibilityRole="button" accessibilityLabel={title}>{taking ? <ActivityIndicator color={accent} /> : <View style={[styles.shutter, { backgroundColor: accent }]} />}</TouchableOpacity></View>
            </SafeAreaView>
          </CameraView>
        ) : (
          <SafeAreaView style={styles.permission}><Ionicons name="camera-outline" size={40} color={accent} /><Text style={styles.permissionText}>{hint}</Text><TouchableOpacity style={[styles.permissionButton, { backgroundColor: accent }]} onPress={() => requestPermission().catch(onError)}><Text style={styles.permissionButtonText}>{title}</Text></TouchableOpacity><TouchableOpacity style={styles.cancel} onPress={onCancel}><Text style={styles.cancelText}>{cancelLabel}</Text></TouchableOpacity></SafeAreaView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050806' }, overlay: { flex: 1, justifyContent: 'space-between' }, scrimTop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000022' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingTop: space.xs }, close: { width: control.minTouch, height: control.minTouch, borderRadius: 22, backgroundColor: '#07100DB8', alignItems: 'center', justifyContent: 'center' }, heading: { flex: 1, alignItems: 'center', paddingHorizontal: space.sm }, title: { color: colors.white, fontSize: 17, lineHeight: 22, fontWeight: '900', textAlign: 'center' }, hint: { color: '#E2ECE6', fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 2 },
  frame: { position: 'absolute', left: 28, right: 28, top: '20%', bottom: '24%' }, corner: { position: 'absolute', width: 42, height: 42, borderWidth: 4 }, topLeft: { left: 0, top: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: radius.md }, topRight: { right: 0, top: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: radius.md }, bottomLeft: { left: 0, bottom: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: radius.md }, bottomRight: { right: 0, bottom: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: radius.md }, scanLine: { position: 'absolute', left: 20, right: 20, top: '50%', height: 2, opacity: 0.85 },
  controls: { height: 132, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050806B8' }, shutterRing: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, backgroundColor: '#0C1510CC', alignItems: 'center', justifyContent: 'center' }, shutter: { width: 58, height: 58, borderRadius: 29 },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl }, permissionText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: space.md }, permissionButton: { minHeight: control.primaryHeight, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', marginTop: space.lg }, permissionButtonText: { color: colors.background, fontSize: 14, fontWeight: '900' }, cancel: { minHeight: control.minTouch, justifyContent: 'center', marginTop: space.sm }, cancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
});
