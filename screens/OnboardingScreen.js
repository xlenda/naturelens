import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import NatureScene from '../components/NatureScene';
import PressScale from '../components/PressScale';
import { colors, radius, shadow, space, type } from '../components/theme';
import { markOnboardingSeen } from '../components/onboarding';
import {
  DEFAULT_DISCOVERY_PREFERENCES,
  saveDiscoveryPreferences,
  suggestedCategoryForContext,
} from '../components/discoveryPreferences';
import { sensoryFeedback } from '../components/sensoryFeedback';
import useReducedMotion from '../components/useReducedMotion';
import {
  trackOnboardingChoice,
  trackOnboardingCompleted,
  trackOnboardingSkipped,
  trackOnboardingStepViewed,
} from '../components/tracking';
import { recordPositiveReviewSignal } from '../components/storeReview';

const { width, height } = Dimensions.get('window');
const isCompactViewport = height < 780 || width < 390;
const demoHeight = isCompactViewport ? 226 : 252;
const readyArtHeight = isCompactViewport ? 176 : 214;
const introVideoWebStyle = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  backgroundColor: 'rgba(7,11,9,0.28)',
};

const SCENES = {
  promise: require('../assets/art/onboarding-identify-wide.jpg'),
  ready: require('../assets/art/onboarding-collect-wide.jpg'),
};

const MASCOT = require('../assets/art/naturelens-mascot.jpg');
const INTRO_POSTER = require('../assets/art/naturelens-mascot-intro-poster.jpg');
const INTRO_VIDEO = require('../assets/art/naturelens-mascot-intro-fast.mp4');

const ICONS = {
  goalIdentify: require('../assets/onboarding/icons/goal-identify.png'),
  goalSafety: require('../assets/onboarding/icons/goal-safety.png'),
  goalCare: require('../assets/onboarding/icons/goal-care.png'),
  goalField: require('../assets/onboarding/icons/goal-field.png'),
  goalLearn: require('../assets/onboarding/icons/goal-learn.png'),
  contextHome: require('../assets/onboarding/icons/context-home.png'),
  contextField: require('../assets/onboarding/icons/context-field.png'),
  contextNature: require('../assets/onboarding/icons/context-nature.png'),
  contextWater: require('../assets/onboarding/icons/context-water.png'),
  contextStudy: require('../assets/onboarding/icons/context-study.png'),
  depthEssential: require('../assets/onboarding/icons/depth-essential.png'),
  depthVisual: require('../assets/onboarding/icons/depth-visual.png'),
  depthTechnical: require('../assets/onboarding/icons/depth-technical.png'),
  pathGoal: require('../assets/onboarding/icons/path-goal.png'),
  pathContext: require('../assets/onboarding/icons/path-context.png'),
  pathDepth: require('../assets/onboarding/icons/path-depth.png'),
};

const QUESTIONS = {
  goal: [
    { value: 'identify', iconAsset: ICONS.goalIdentify, accent: colors.info },
    { value: 'safety', iconAsset: ICONS.goalSafety, accent: colors.error },
    { value: 'care', iconAsset: ICONS.goalCare, accent: colors.accentLight },
    { value: 'field', iconAsset: ICONS.goalField, accent: colors.warning },
    { value: 'learn', iconAsset: ICONS.goalLearn, accent: colors.purple },
  ],
  context: [
    { value: 'home', iconAsset: ICONS.contextHome, accent: colors.accentLight },
    { value: 'field', iconAsset: ICONS.contextField, accent: colors.warning },
    { value: 'nature', iconAsset: ICONS.contextNature, accent: colors.info },
    { value: 'water', iconAsset: ICONS.contextWater, accent: '#5AA9C9' },
    { value: 'study', iconAsset: ICONS.contextStudy, accent: colors.purple },
  ],
  depth: [
    { value: 'essential', iconAsset: ICONS.depthEssential, accent: colors.accentLight },
    { value: 'visual', iconAsset: ICONS.depthVisual, accent: colors.info },
    { value: 'technical', iconAsset: ICONS.depthTechnical, accent: colors.warning },
  ],
};

const STEPS = ['intro', 'promise', 'goal', 'context', 'depth', 'ready', 'review'];

const assetUri = (asset) => (typeof asset === 'string' ? asset : asset?.uri || null);

function IntroVideo({ reduceMotion, t }) {
  const videoRef = useRef(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const introVideoUri = assetUri(INTRO_VIDEO);
  const introPosterUri = assetUri(INTRO_POSTER);
  const savesData = Platform.OS === 'web'
    && typeof navigator !== 'undefined'
    && navigator.connection?.saveData === true;
  const allowMotion = !reduceMotion && !savesData;

  const toggleSound = () => {
    const player = videoRef.current;
    if (!player) return;
    const nextMuted = !muted;
    player.muted = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) {
      const playback = player.play();
      playback?.catch?.(() => {
        player.muted = true;
        setMuted(true);
      });
    }
  };

  const togglePlayback = () => {
    const player = videoRef.current;
    if (!player) return;
    if (player.paused) {
      const playback = player.play();
      playback?.catch?.(() => setVideoPlaying(false));
      return;
    }
    player.pause();
  };

  return (
    <View style={styles.introStage} accessibilityLabel={t('onboarding.promise.body')}>
      <Image source={INTRO_POSTER} style={styles.introPoster} resizeMode="cover" />
      {Platform.OS === 'web' && allowMotion && introVideoUri && !videoFailed
        ? React.createElement('video', {
            ref: videoRef,
            src: introVideoUri,
            autoPlay: true,
            muted,
            loop: true,
            playsInline: true,
            poster: introPosterUri,
            preload: 'auto',
            onPlaying: () => {
              setVideoReady(true);
              setVideoPlaying(true);
            },
            onPause: () => setVideoPlaying(false),
            onError: () => setVideoFailed(true),
            style: {
              ...introVideoWebStyle,
              opacity: videoReady ? 1 : 0,
              transition: 'opacity 180ms ease-out',
            },
            'aria-label': t('onboarding.promise.body'),
          })
        : null}
      <LinearGradient
        colors={['rgba(7,11,9,0.02)', 'rgba(7,11,9,0.2)', 'rgba(7,11,9,0.86)']}
        style={styles.introShade}
      />
      {Platform.OS === 'web' && allowMotion && introVideoUri && !videoFailed ? (
        <View style={styles.introMediaControls}>
          <TouchableOpacity
            style={styles.introMediaButton}
            onPress={togglePlayback}
            accessibilityRole="button"
            accessibilityLabel={t(videoPlaying ? 'onboarding.media.pause' : 'onboarding.media.play')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={videoPlaying ? 'pause' : 'play'} size={21} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.introMediaButton}
            onPress={toggleSound}
            accessibilityRole="switch"
            accessibilityState={{ checked: !muted }}
            accessibilityLabel={t(muted ? 'onboarding.media.enableSound' : 'onboarding.media.disableSound')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={21} color={colors.white} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function PromiseDemo({ reduceMotion, t }) {
  const scan = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      scan.setValue(0.58);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 1550, useNativeDriver: false }),
        Animated.timing(scan, { toValue: 0, duration: 0, useNativeDriver: false }),
        Animated.delay(550),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, scan]);

  return (
    <View style={styles.demo} accessibilityLabel={t('onboarding.promise.body')}>
      <Image source={SCENES.promise} style={styles.demoBackdrop} resizeMode="cover" blurRadius={12} />
      <Image source={SCENES.promise} style={styles.demoImage} resizeMode="contain" />
      <LinearGradient colors={['transparent', 'rgba(7,11,9,0.9)']} style={styles.demoShade} />
      <View style={styles.focusCornerTL} />
      <View style={styles.focusCornerBR} />
      <Animated.View
        style={[
          styles.scanLine,
          { top: scan.interpolate({ inputRange: [0, 1], outputRange: [38, demoHeight - 74] }) },
        ]}
      />
      <View style={styles.demoResult}>
        <View style={styles.demoResultIcon}>
          <Ionicons name="leaf" size={18} color={colors.white} />
        </View>
        <View style={styles.demoResultCopy}>
          <Text style={styles.demoResultTitle}>{t('onboarding.what.title')}</Text>
          <Text style={styles.demoResultBody}>{t('onboarding.promise.demoNext')}</Text>
        </View>
        <Ionicons name="arrow-forward" size={18} color={colors.accentLight} />
      </View>
    </View>
  );
}

function PromisePath({ t }) {
  const rows = [
    { iconAsset: ICONS.pathGoal, color: colors.accentLight, title: 'onboarding.goal.title', body: 'onboarding.goal.body' },
    { iconAsset: ICONS.pathContext, color: colors.info, title: 'onboarding.context.title', body: 'onboarding.context.body' },
    { iconAsset: ICONS.pathDepth, color: colors.warning, title: 'onboarding.depth.title', body: 'onboarding.depth.body' },
  ];

  return (
    <View style={styles.promisePath} accessibilityLabel={t('onboarding.promise.body')}>
      {rows.map((row) => (
        <View key={row.title} style={styles.promiseStep}>
          <LinearGradient
            colors={[row.color + '30', colors.surfaceElevated]}
            style={[styles.promiseStepIcon, { borderColor: row.color + '55' }]}
          >
            <Image source={row.iconAsset} style={styles.promiseStepIconImage} resizeMode="contain" />
          </LinearGradient>
          <View style={styles.promiseStepCopy}>
            <Text style={styles.promiseStepTitle} numberOfLines={1}>{t(row.title)}</Text>
            <Text style={styles.promiseStepBody} numberOfLines={2}>{t(row.body)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ReviewPrelude({ answer, onAnswer, t }) {
  return (
    <View style={styles.reviewWrap}>
      <View style={styles.reviewHero}>
        <View style={styles.reviewMascotHalo}>
          <Image source={MASCOT} style={styles.reviewMascot} resizeMode="cover" />
        </View>
        <View style={styles.starRail} accessibilityLabel={t('onboarding.review.starsLabel')}>
          {[0, 1, 2, 3, 4].map((index) => (
            <View key={index} style={[styles.starTile, index === 2 && styles.starTilePrime]}>
              <Ionicons
                name="star"
                size={index === 2 ? 23 : 19}
                color={index === 2 ? colors.background : colors.warning}
              />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.reviewCard}>
        <Text style={styles.reviewQuote}>{t('onboarding.review.quote')}</Text>
        <View style={styles.reviewProofRow}>
          {['simple', 'safe', 'useful'].map((item) => (
            <View key={item} style={styles.reviewProofPill}>
              <Ionicons name="checkmark" size={13} color={colors.accentLight} />
              <Text style={styles.reviewProofText}>{t(`onboarding.review.proofs.${item}`)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.reviewActions}>
        <PressScale style={styles.reviewActionWrap}>
          <TouchableOpacity
            style={[
              styles.reviewAction,
              styles.reviewActionPrimary,
              answer === 'positive' && styles.reviewActionSelected,
            ]}
            onPress={() => onAnswer('positive')}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.review.yes')}
          >
            <Text style={styles.reviewActionPrimaryText}>{t('onboarding.review.yes')}</Text>
            <Ionicons name="sparkles" size={17} color={colors.background} />
          </TouchableOpacity>
        </PressScale>
        <PressScale style={styles.reviewActionWrap}>
          <TouchableOpacity
            style={[
              styles.reviewAction,
              styles.reviewActionSecondary,
              answer === 'later' && styles.reviewActionSecondarySelected,
            ]}
            onPress={() => onAnswer('later')}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.review.later')}
          >
            <Text style={styles.reviewActionSecondaryText}>{t('onboarding.review.later')}</Text>
          </TouchableOpacity>
        </PressScale>
      </View>
    </View>
  );
}

function ChoiceCard({ option, group, selected, onPress, t }) {
  return (
    <PressScale disabled={selected}>
      <TouchableOpacity
        style={[
          styles.choice,
          selected && { borderColor: option.accent, backgroundColor: option.accent + '18' },
        ]}
        onPress={onPress}
        activeOpacity={0.78}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={t(`onboarding.${group}.options.${option.value}.title`)}
      >
        <View style={styles.choiceIconShell}>
          <LinearGradient
            colors={[option.accent + '3A', colors.surfaceElevated]}
            style={[
              styles.choiceIcon,
              selected && { borderColor: option.accent + '88' },
            ]}
          >
            <View style={[styles.choiceIconGlow, { backgroundColor: option.accent }]} />
            <Image source={option.iconAsset} style={styles.choiceIconImage} resizeMode="contain" />
          </LinearGradient>
        </View>
        <View style={styles.choiceCopy}>
          <Text style={styles.choiceTitle}>
            {t(`onboarding.${group}.options.${option.value}.title`)}
          </Text>
        </View>
        <View
          style={[
            styles.radio,
            selected && { borderColor: option.accent, backgroundColor: option.accent },
          ]}
        >
          {selected && <Ionicons name="checkmark" size={15} color={colors.background} />}
        </View>
      </TouchableOpacity>
    </PressScale>
  );
}

function InsightCard({ current, selectedValue, t }) {
  if (!selectedValue || !QUESTIONS[current]) return null;
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightOrb}>
        <Ionicons name="sparkles" size={16} color={colors.background} />
      </View>
      <View style={styles.insightCopy}>
        <Text style={styles.insightKicker}>{t('onboarding.personalizeKicker')}</Text>
        <Text style={styles.insightTitle}>
          {t(`onboarding.${current}.options.${selectedValue}.title`)}
        </Text>
        <Text style={styles.insightBody}>{t(`onboarding.${current}.body`)}</Text>
      </View>
    </View>
  );
}

function ReadySummary({ answers, t }) {
  return (
    <View style={styles.readyWrap}>
      <View style={styles.readyArt}>
        <Image source={SCENES.ready} style={styles.readyBackdrop} resizeMode="cover" blurRadius={12} />
        <Image source={SCENES.ready} style={styles.readyImage} resizeMode="contain" />
        <LinearGradient colors={['transparent', colors.surface]} style={styles.readyFade} />
        <View style={styles.readyMascotFrame}>
          <Image source={MASCOT} style={styles.readyMascot} resizeMode="cover" />
        </View>
        <View style={styles.readySeal}>
          <Ionicons name="sparkles" size={22} color={colors.white} />
        </View>
      </View>
      <View style={styles.readySummary}>
        {['goal', 'context', 'depth'].map((group) => (
          <View key={group} style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t(`onboarding.${group}.title`)}</Text>
            <Text style={styles.summaryValue}>
              {t(`onboarding.${group}.options.${answers[group]}.title`)}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.promiseRow}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.accentLight} />
        <Text style={styles.promiseText}>{t('onboarding.ready.promise')}</Text>
      </View>
    </View>
  );
}

export default function OnboardingScreen({ onDone }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [reviewAnswer, setReviewAnswer] = useState(null);
  const [answers, setAnswers] = useState({ goal: null, context: null, depth: null });
  const slideIn = useRef(new Animated.Value(1)).current;
  const current = STEPS[step];
  const isIntro = current === 'intro';
  const isLast = step === STEPS.length - 1;
  const isQuestion = Boolean(QUESTIONS[current]);
  const isReview = current === 'review';
  const canContinue = isReview ? true : (!isQuestion || Boolean(answers[current]));

  useEffect(() => {
    trackOnboardingStepViewed({ step: current, position: step + 1 });
    if (reduceMotion) {
      slideIn.setValue(1);
      return;
    }
    slideIn.setValue(0);
    Animated.timing(slideIn, {
      toValue: 1,
      duration: 240,
      useNativeDriver: false,
    }).start();
  }, [current, reduceMotion, slideIn, step]);

  const completedAnswers = useMemo(
    () => ({
      goal: answers.goal || DEFAULT_DISCOVERY_PREFERENCES.goal,
      context: answers.context || DEFAULT_DISCOVERY_PREFERENCES.context,
      depth: answers.depth || DEFAULT_DISCOVERY_PREFERENCES.depth,
    }),
    [answers]
  );

  const finish = async ({ skipped = false } = {}) => {
    if (saving) return;
    setSaving(true);
    const nextPreferences = {
      ...completedAnswers,
      preferredCategory: suggestedCategoryForContext(completedAnswers.context),
    };
    sensoryFeedback.commit();
    await saveDiscoveryPreferences(nextPreferences);
    await markOnboardingSeen();
    if (skipped) trackOnboardingSkipped({ step: current, position: step + 1 });
    trackOnboardingCompleted({ steps: STEPS.length, ...nextPreferences });
    onDone(nextPreferences);
  };

  const select = async (value) => {
    setAnswers((previous) => ({ ...previous, [current]: value }));
    sensoryFeedback.selection();
    trackOnboardingChoice({ step: current, value });
  };

  const answerReview = async (value) => {
    if (reviewAnswer) return;
    setReviewAnswer(value);
    sensoryFeedback.selection();
    trackOnboardingChoice({ step: current, value });
    if (value === 'positive') {
      recordPositiveReviewSignal().catch(() => undefined);
    }
    setTimeout(() => {
      if (step === STEPS.length - 1) {
        finish().catch(() => undefined);
        return;
      }
      setStep((previous) => (previous === step ? Math.min(previous + 1, STEPS.length - 1) : previous));
    }, reduceMotion ? 80 : 280);
  };

  const next = async () => {
    if (!canContinue || saving) return;
    if (isReview && !reviewAnswer) {
      setReviewAnswer('later');
      trackOnboardingChoice({ step: current, value: 'later' });
    }
    if (isLast) {
      await finish();
      return;
    }
    sensoryFeedback.open();
    setStep((value) => Math.min(value + 1, STEPS.length - 1));
  };

  const titleKey = current === 'promise' ? 'onboarding.what.title' : `onboarding.${current}.title`;
  const bodyKey = current === 'promise' ? 'onboarding.promise.body' : `onboarding.${current}.body`;

  return (
    <SafeAreaView style={styles.container}>
      <NatureScene />
      {!isIntro && (
        <>
          <View style={styles.topRow}>
            <View style={styles.brandMark}>
              <Image source={MASCOT} style={styles.brandMascot} resizeMode="cover" />
              <Text style={styles.brand}>NatureLens</Text>
            </View>
            {step === 0 ? (
              <TouchableOpacity
                onPress={() => finish({ skipped: true })}
                accessibilityRole="button"
                accessibilityLabel={t('onboarding.skip')}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.skip}>{t('onboarding.skip')}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.progressText}>
                {t('onboarding.progress', { current: step + 1, total: STEPS.length })}
              </Text>
            )}
          </View>

          <View style={styles.progressTrack} accessibilityRole="progressbar">
            <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
          </View>
        </>
      )}

      <ScrollView
        style={[styles.scroller, isIntro && styles.introScroller, isLast && styles.scrollerTight]}
        contentContainerStyle={[
          styles.scrollContent,
          isIntro && styles.introScrollContent,
          isLast && styles.scrollContentTight,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            isIntro ? styles.introContent : styles.content,
            {
              opacity: slideIn,
              transform: [
                { translateY: slideIn.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
              ],
            },
          ]}
        >
          {current === 'intro' && <IntroVideo reduceMotion={reduceMotion} t={t} />}
          {current === 'promise' && <PromiseDemo reduceMotion={reduceMotion} t={t} />}
          {current === 'review' && (
            <View style={styles.reviewStageMini}>
              <Image source={SCENES.ready} style={styles.reviewStageImage} resizeMode="cover" />
              <LinearGradient colors={['transparent', colors.background + 'F2']} style={styles.reviewStageShade} />
            </View>
          )}
          {!isIntro && (
            <>
              <Text style={styles.kicker}>
                {t(
                  current === 'promise'
                    ? 'onboarding.promiseKicker'
                    : current === 'ready'
                    ? 'onboarding.readyKicker'
                    : current === 'review'
                    ? 'onboarding.reviewKicker'
                    : 'onboarding.personalizeKicker'
                )}
              </Text>
              <Text style={styles.title} accessibilityRole="header">{t(titleKey)}</Text>
              <Text style={styles.body}>{t(bodyKey)}</Text>
            </>
          )}

          {current === 'promise' && <PromisePath t={t} />}

          {current === 'review' && (
            <ReviewPrelude answer={reviewAnswer} onAnswer={answerReview} t={t} />
          )}

          {isQuestion && (
            <>
              <View style={styles.choices} accessibilityRole="radiogroup">
                {QUESTIONS[current].map((option) => (
                  <ChoiceCard
                    key={option.value}
                    option={option}
                    group={current}
                    selected={answers[current] === option.value}
                    onPress={() => select(option.value)}
                    t={t}
                  />
                ))}
              </View>
              <InsightCard current={current} selectedValue={answers[current]} t={t} />
            </>
          )}

          {current === 'ready' && <ReadySummary answers={completedAnswers} t={t} />}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, isIntro && styles.introFooter, isLast && styles.footerTight]}>
        {step > 0 && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setStep((value) => Math.max(0, value - 1))}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <PressScale style={styles.ctaWrap} disabled={!canContinue || saving}>
          <TouchableOpacity
            style={[styles.cta, (!canContinue || saving) && styles.ctaDisabled]}
            onPress={next}
            disabled={!canContinue || saving}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue || saving }}
            accessibilityLabel={isLast ? t('onboarding.start') : t('onboarding.next')}
          >
            <Text style={styles.ctaText}>
              {saving
                ? t('onboarding.preparing')
                : isLast
                ? t('onboarding.start')
                : t('onboarding.next')}
            </Text>
            <Ionicons name={isLast ? 'camera' : 'arrow-forward'} size={18} color={colors.white} />
          </TouchableOpacity>
        </PressScale>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topRow: {
    minHeight: 48,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandMark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMascot: {
    width: 28,
    height: 28,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accentLight + '77',
    backgroundColor: colors.surface,
  },
  brand: { ...type.cardTitle, color: colors.text },
  skip: { ...type.caption, color: colors.textSecondary, fontWeight: '700' },
  progressText: { ...type.caption, fontWeight: '700' },
  progressTrack: {
    height: 3,
    marginHorizontal: space.xl,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  progressFill: { height: '100%', backgroundColor: colors.accentLight },
  scroller: { flex: 1 },
  introScroller: { flex: 1 },
  scrollerTight: { flex: 0, flexShrink: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingTop: isCompactViewport ? space.xs : space.sm,
    paddingBottom: isCompactViewport ? space.xs : space.md,
  },
  scrollContentTight: {
    flexGrow: 0,
    paddingBottom: 0,
  },
  introScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  introContent: {
    width: '100%',
    minHeight: height,
  },
  introStage: {
    flex: 1,
    minHeight: height,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  introPoster: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    backgroundColor: colors.background,
  },
  introShade: { ...StyleSheet.absoluteFillObject },
  introMediaControls: {
    position: 'absolute',
    zIndex: 3,
    top: space.lg,
    right: space.lg,
    flexDirection: 'row',
    gap: space.sm,
  },
  introMediaButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.white + '55',
    backgroundColor: 'rgba(7,11,9,0.68)',
  },
  kicker: {
    ...type.caption,
    color: colors.accentLight,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: isCompactViewport ? space.xs : space.sm,
    marginBottom: space.xs,
  },
  title: {
    ...type.screenTitle,
    fontSize: isCompactViewport ? 26 : 28,
    lineHeight: isCompactViewport ? 31 : 34,
    marginBottom: space.xs,
  },
  body: { ...type.body, fontSize: 15, lineHeight: 22, maxWidth: Math.min(width - 48, 500) },
  promisePath: {
    marginTop: isCompactViewport ? space.sm : space.md,
    gap: isCompactViewport ? 8 : 10,
  },
  promiseStep: {
    minHeight: isCompactViewport ? 58 : 64,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(22,31,27,0.82)',
    paddingHorizontal: space.md,
    paddingVertical: isCompactViewport ? 8 : 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  promiseStepIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  promiseStepIconImage: { width: 36, height: 36 },
  promiseStepCopy: { flex: 1 },
  promiseStepTitle: {
    color: colors.text,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '900',
  },
  promiseStepBody: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
    fontWeight: '600',
  },
  demo: {
    height: demoHeight,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  demoBackdrop: {
    ...StyleSheet.absoluteFillObject,
    width: '112%',
    height: '112%',
    left: '-6%',
    top: '-6%',
    opacity: 0.58,
  },
  demoImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(7,11,9,0.28)',
  },
  demoShade: { ...StyleSheet.absoluteFillObject },
  scanLine: {
    position: 'absolute',
    left: 18,
    right: 18,
    height: 2,
    backgroundColor: colors.accentLight,
    shadowColor: colors.accentLight,
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  focusCornerTL: {
    position: 'absolute', top: 16, left: 16, width: 30, height: 30,
    borderTopWidth: 3, borderLeftWidth: 3, borderColor: colors.white, borderTopLeftRadius: 8,
  },
  focusCornerBR: {
    position: 'absolute', right: 16, bottom: 64, width: 30, height: 30,
    borderRightWidth: 3, borderBottomWidth: 3, borderColor: colors.white, borderBottomRightRadius: 8,
  },
  demoResult: {
    position: 'absolute', left: 12, right: 12, bottom: 12, minHeight: 52,
    borderRadius: radius.md, backgroundColor: 'rgba(22,31,27,0.94)',
    borderWidth: 1, borderColor: 'rgba(127,199,154,0.35)',
    paddingHorizontal: space.sm, paddingVertical: space.xs,
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
  },
  demoResultIcon: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.accent,
  },
  demoResultCopy: { flex: 1 },
  demoResultTitle: { ...type.cardTitle },
  demoResultBody: { ...type.caption, marginTop: 1 },
  reviewStageMini: {
    height: isCompactViewport ? 118 : 136,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reviewStageImage: {
    width: '100%',
    height: '100%',
    opacity: 0.86,
  },
  reviewStageShade: { ...StyleSheet.absoluteFillObject },
  reviewWrap: {
    marginTop: isCompactViewport ? space.sm : space.md,
    gap: isCompactViewport ? space.sm : space.md,
  },
  reviewHero: {
    minHeight: isCompactViewport ? 124 : 144,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accentLight + '44',
    backgroundColor: 'rgba(127,199,154,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reviewMascotHalo: {
    width: isCompactViewport ? 76 : 88,
    height: isCompactViewport ? 76 : 88,
    borderRadius: isCompactViewport ? 28 : 32,
    borderWidth: 1,
    borderColor: colors.accentLight + '88',
    backgroundColor: colors.surface,
    overflow: 'hidden',
    shadowColor: colors.accentLight,
    shadowOpacity: 0.34,
    shadowRadius: 18,
    elevation: 5,
  },
  reviewMascot: {
    width: '100%',
    height: '100%',
  },
  starRail: {
    position: 'absolute',
    bottom: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  starTile: {
    width: 31,
    height: 31,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(224,169,81,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(224,169,81,0.28)',
  },
  starTilePrime: {
    width: 39,
    height: 39,
    borderRadius: 15,
    backgroundColor: colors.warning,
    borderColor: colors.warning,
    transform: [{ translateY: -2 }],
  },
  reviewCard: {
    borderRadius: radius.xl,
    backgroundColor: 'rgba(22,31,27,0.9)',
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  reviewQuote: {
    color: colors.text,
    fontSize: isCompactViewport ? 16 : 17,
    lineHeight: isCompactViewport ? 22 : 24,
    fontWeight: '900',
  },
  reviewProofRow: {
    marginTop: space.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reviewProofPill: {
    minHeight: 32,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.accentLight + '33',
    backgroundColor: colors.accentLight + '10',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  reviewProofText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  reviewActions: {
    gap: 9,
  },
  reviewActionWrap: { width: '100%' },
  reviewAction: {
    minHeight: 50,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
  },
  reviewActionPrimary: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accentLight,
  },
  reviewActionSelected: {
    shadowColor: colors.accentLight,
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 4,
  },
  reviewActionSecondary: {
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: colors.border,
  },
  reviewActionSecondarySelected: {
    borderColor: colors.textMuted,
    backgroundColor: colors.surfaceElevated,
  },
  reviewActionPrimaryText: {
    color: colors.background,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  reviewActionSecondaryText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  choices: { gap: isCompactViewport ? 8 : 10, marginTop: isCompactViewport ? space.sm : space.md },
  choice: {
    minHeight: isCompactViewport ? 64 : 68,
    paddingHorizontal: space.md,
    paddingVertical: isCompactViewport ? space.xs : space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(22,31,27,0.88)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  choiceIconShell: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  choiceIconImage: {
    width: 42,
    height: 42,
  },
  choiceIconGlow: {
    position: 'absolute',
    right: 5,
    top: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.9,
  },
  choiceCopy: { flex: 1 },
  choiceTitle: { ...type.cardTitle },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.textMuted,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  insightCard: {
    marginTop: space.md,
    minHeight: 96,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accentLight + '44',
    backgroundColor: 'rgba(127,199,154,0.10)',
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  insightOrb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  insightCopy: { flex: 1 },
  insightKicker: {
    ...type.caption,
    color: colors.accentLight,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  insightTitle: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  insightBody: {
    color: colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  readyWrap: {
    marginTop: isCompactViewport ? space.sm : space.md, borderRadius: radius.xl, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  readyArt: {
    height: readyArtHeight,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  readyBackdrop: {
    ...StyleSheet.absoluteFillObject,
    width: '112%',
    height: '112%',
    left: '-6%',
    top: '-6%',
    opacity: 0.58,
  },
  readyImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(7,11,9,0.28)',
  },
  readyFade: { ...StyleSheet.absoluteFillObject },
  readyMascotFrame: {
    position: 'absolute',
    right: space.md,
    bottom: space.xs,
    width: 58,
    height: 58,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.accentLight + '88',
    backgroundColor: colors.surface,
  },
  readyMascot: {
    width: '100%',
    height: '100%',
  },
  readySeal: {
    position: 'absolute', left: space.md, bottom: space.sm, width: 42, height: 42,
    borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent,
  },
  readySummary: { paddingHorizontal: space.md, paddingTop: space.xs },
  summaryRow: {
    minHeight: isCompactViewport ? 50 : 56,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryLabel: { ...type.caption, fontSize: 11.5, lineHeight: 15 },
  summaryValue: { ...type.cardTitle, color: colors.accentLight, marginTop: 2 },
  promiseRow: { flexDirection: 'row', gap: 9, padding: isCompactViewport ? space.sm : space.md, alignItems: 'flex-start' },
  promiseText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  footer: {
    paddingHorizontal: space.xl, paddingTop: space.xs, paddingBottom: space.sm,
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background,
  },
  introFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 0,
    paddingBottom: space.lg,
    backgroundColor: 'transparent',
  },
  footerTight: { borderTopWidth: 0, paddingTop: space.sm },
  backButton: {
    width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  ctaWrap: { flex: 1 },
  cta: {
    minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.md,
    backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 9,
  },
  ctaDisabled: { opacity: 0.42 },
  ctaText: { color: colors.white, fontSize: 16, fontWeight: '800' },
});
