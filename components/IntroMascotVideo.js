import React, { useRef, useState } from 'react';
import { Dimensions, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';

const POSTER = require('../assets/art/naturelens-mascot-intro-poster.jpg');
const VIDEO = require('../assets/art/naturelens-mascot-intro-fast.mp4');
const viewportHeight = Dimensions.get('window').height;
const stageHeight = Math.max(360, viewportHeight - 150);

export default function IntroMascotVideo({ reduceMotion, t }) {
  const videoRef = useRef(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoUri = Image.resolveAssetSource(VIDEO)?.uri;
  const posterUri = Image.resolveAssetSource(POSTER)?.uri;
  const savesData = typeof navigator !== 'undefined' && navigator.connection?.saveData === true;
  const allowMotion = !reduceMotion && !savesData;

  const toggleSound = () => {
    const player = videoRef.current;
    if (!player) return;
    const nextMuted = !muted;
    player.muted = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) player.play()?.catch?.(() => { player.muted = true; setMuted(true); });
  };
  const togglePlayback = () => {
    const player = videoRef.current;
    if (!player) return;
    if (player.paused) player.play()?.catch?.(() => setVideoPlaying(false));
    else player.pause();
  };

  return <View style={styles.stage} accessibilityLabel={t('onboarding.promise.body')}>
    <Image source={POSTER} style={styles.media} resizeMode="cover" />
    {allowMotion && videoUri && !videoFailed ? React.createElement('video', {
      ref: videoRef, src: videoUri, autoPlay: true, muted, loop: true, playsInline: true,
      poster: posterUri, preload: 'auto',
      onPlaying: () => { setVideoReady(true); setVideoPlaying(true); },
      onPause: () => setVideoPlaying(false), onError: () => setVideoFailed(true),
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', backgroundColor: 'rgba(7,11,9,0.28)', opacity: videoReady ? 1 : 0, transition: 'opacity 180ms ease-out' },
      'aria-label': t('onboarding.promise.body'),
    }) : null}
    <LinearGradient colors={['rgba(7,11,9,0.02)', 'rgba(7,11,9,0.2)', 'rgba(7,11,9,0.86)']} style={StyleSheet.absoluteFillObject} />
    {allowMotion && videoUri && !videoFailed ? <View style={styles.controls}>
      <TouchableOpacity style={styles.button} onPress={togglePlayback} accessibilityRole="button" accessibilityLabel={t(videoPlaying ? 'onboarding.media.pause' : 'onboarding.media.play')}>
        <Ionicons name={videoPlaying ? 'pause' : 'play'} size={21} color={colors.white} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={toggleSound} accessibilityRole="switch" accessibilityState={{ checked: !muted }} accessibilityLabel={t(muted ? 'onboarding.media.enableSound' : 'onboarding.media.disableSound')}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={21} color={colors.white} />
      </TouchableOpacity>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  stage: { flex: 1, minHeight: stageHeight, width: '100%', overflow: 'hidden', backgroundColor: colors.surface },
  media: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  controls: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', gap: 8 },
  button: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(7,11,9,0.74)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
});
