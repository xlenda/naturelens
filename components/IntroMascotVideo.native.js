import React, { useState } from 'react';
import { Dimensions, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { colors } from './theme';

const POSTER = require('../assets/art/naturelens-mascot-intro-poster.jpg');
const VIDEO = require('../assets/art/naturelens-mascot-intro-fast.mp4');
const viewportHeight = Dimensions.get('window').height;
const stageHeight = Math.max(360, viewportHeight - 150);

export default function IntroMascotVideo({ reduceMotion, t }) {
  const [playing, setPlaying] = useState(!reduceMotion);
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(VIDEO, (instance) => {
    instance.loop = true;
    instance.muted = true;
    if (!reduceMotion) instance.play();
  });
  const togglePlayback = () => {
    if (playing) player.pause(); else player.play();
    setPlaying(!playing);
  };
  const toggleSound = () => {
    player.muted = !muted;
    setMuted(!muted);
  };

  return <View style={styles.stage} accessibilityLabel={t('onboarding.promise.body')}>
    <Image source={POSTER} style={styles.media} resizeMode="cover" />
    {!reduceMotion ? <VideoView player={player} style={styles.media} contentFit="cover" nativeControls={false} /> : null}
    <LinearGradient colors={['rgba(7,11,9,0.02)', 'rgba(7,11,9,0.2)', 'rgba(7,11,9,0.86)']} style={StyleSheet.absoluteFillObject} />
    {!reduceMotion ? <View style={styles.controls}>
      <TouchableOpacity style={styles.button} onPress={togglePlayback} accessibilityRole="button" accessibilityLabel={t(playing ? 'onboarding.media.pause' : 'onboarding.media.play')}>
        <Ionicons name={playing ? 'pause' : 'play'} size={21} color={colors.white} />
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
