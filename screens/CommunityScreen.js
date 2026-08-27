import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import BackChevron from '../components/BackChevron';
import CategoryIcon from '../components/CategoryIcon';
import NatureScene from '../components/NatureScene';
import { CATEGORIES } from '../components/categories';
import {
  acceptCommunityTerms, blockCommunityProfile, createCommunityComment, createCommunityPost,
  deleteCommunityTarget, loadCommunity, reportCommunityTarget,
  saveCommunityProfile, toggleCommunityReaction,
} from '../components/community';
import { colors, control, radius, shadow, space, type } from '../components/theme';

const KIND_COPY = { care: 'watering', observation: 'pests', recovery: 'recovery', question: 'questions' };
const COMMUNITY_CATEGORIES = Object.values(CATEGORIES);

function confirm(title, cancel, action, onPress) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(title)) onPress();
  } else {
    Alert.alert(title, '', [{ text: cancel, style: 'cancel' }, { text: action, style: 'destructive', onPress }]);
  }
}

const PostCard = memo(function PostCard({ item, date, t, commentOpen, commentBody, setCommentBody, onComment, onSend, onReact, onMenu, onCommentMenu, termsAccepted, onToggleTerms }) {
  const meta = CATEGORIES[item.category] || CATEGORIES.plant;
  return (
    <View style={styles.post}>
      <View style={[styles.spine, { backgroundColor: meta.accent }]} />
      <View style={styles.postInner}>
        <View style={styles.row}>
          <View style={[styles.avatar, { backgroundColor: `${meta.accent}22` }]}><CategoryIcon name={meta.tabIcon} size={19} color={meta.accent} /></View>
          <View style={styles.grow}><Text style={styles.author}>{item.author.nickname}</Text><Text style={styles.caption}>{date}</Text></View>
          <Pressable style={styles.iconButton} onPress={() => onMenu(item)} accessibilityRole="button" accessibilityLabel={item.mine ? t('community.deletePost') : t('community.reportAndBlock')}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
        <View style={[styles.row, styles.evidence]}>
          <Text style={[styles.kind, { color: meta.accent }]}>{t(`community.careTopics.${KIND_COPY[item.kind] || 'questions'}`)}</Text>
          <Text style={[styles.caption, styles.subject]} numberOfLines={1}>{item.commonName || item.scientificName || t(`categories.${item.category}.label`)}</Text>
        </View>
        {item.scientificName ? <Text style={styles.scientific}>{item.scientificName}</Text> : null}
        <Text style={styles.body}>{item.body}</Text>
        {(item.comments || []).slice(-3).map((comment) => (
          <View key={comment.id} style={[styles.comment, styles.commentRow]}>
            <Text style={[styles.commentText, styles.grow]}><Text style={styles.commentAuthor}>{comment.author.nickname} · </Text>{comment.body}</Text>
            <Pressable style={styles.commentMenu} onPress={() => onCommentMenu(comment)} accessibilityRole="button" accessibilityLabel={comment.mine ? t('community.deletePost') : t('community.reportAndBlock')}>
              <Ionicons name="ellipsis-horizontal" size={17} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
        {commentOpen ? (
          <>
            {!termsAccepted ? <Pressable style={styles.terms} onPress={onToggleTerms} accessibilityRole="checkbox" accessibilityState={{ checked: termsAccepted }} accessibilityLabel={t('terms.acceptanceTitle')}>
              <Ionicons name="square-outline" size={21} color={colors.textMuted} />
              <View style={styles.grow}><Text style={styles.termsTitle}>{t('terms.acceptanceTitle')}</Text><Text style={styles.termsBody}>{t('terms.acceptanceBody')}</Text></View>
            </Pressable> : null}
            <View style={[styles.row, styles.commentComposer]}>
              <TextInput style={styles.commentInput} value={commentBody} onChangeText={setCommentBody} maxLength={500} multiline placeholder={t('community.careTopics.questions')} placeholderTextColor={colors.textMuted} />
              <Pressable style={[styles.send, commentBody.trim().length < 2 || !termsAccepted ? styles.disabled : null]} disabled={commentBody.trim().length < 2 || !termsAccepted} onPress={() => onSend(item.id)} accessibilityRole="button" accessibilityLabel={t('community.commentAction')}><Ionicons name="arrow-up" size={18} color={colors.white} /></Pressable>
            </View>
          </>
        ) : null}
        <View style={[styles.row, styles.actions]}>
          <Pressable style={[styles.action, item.reacted ? { borderColor: meta.accent, backgroundColor: `${meta.accent}14` } : null]} onPress={() => onReact(item.id)} accessibilityRole="button" accessibilityState={{ selected: item.reacted }}>
            <Ionicons name={item.reacted ? 'leaf' : 'leaf-outline'} size={16} color={item.reacted ? meta.accent : colors.textSecondary} /><Text style={styles.actionText}>{item.helpful}</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={() => onComment(item.id)} accessibilityRole="button"><Ionicons name="chatbubble-outline" size={15} color={colors.textSecondary} /><Text style={styles.actionText}>{t('community.commentAction')}</Text></Pressable>
        </View>
      </View>
    </View>
  );
});

export default function CommunityScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [tab, setTab] = useState('feed');
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [postBody, setPostBody] = useState('');
  const [category, setCategory] = useState('plant');
  const [kind, setKind] = useState('care');
  const [nickname, setNickname] = useState('');
  const [bio, setBio] = useState('');
  const [commentPost, setCommentPost] = useState(null);
  const [commentBody, setCommentBody] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    const preset = route.params?.checkInDraft;
    if (!preset?.body) return;
    setPostBody(String(preset.body).slice(0, 1200));
    if (COMMUNITY_CATEGORIES.some((entry) => entry.key === preset.category)) {
      setCategory(preset.category);
    }
    setKind('observation');
    setSheet('post');
    navigation.setParams({ checkInDraft: undefined });
  }, [navigation, route.params?.checkInDraft]);

  const refresh = useCallback(async () => {
    setLoading(true); setFailed(false); setErrorMessage('');
    try {
      const result = await loadCommunity();
      setData(result); setNickname(result.profile?.nickname || ''); setBio(result.profile?.bio || '');
      setTermsAccepted(result.profile?.termsAccepted === true);
    } catch (e) { setFailed(true); setErrorMessage(t('community.unavailable')); } finally { setLoading(false); }
  }, [t]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const formatter = useMemo(() => {
    try { return new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language, { day: '2-digit', month: 'short' }); }
    catch (e) { return null; }
  }, [i18n.language, i18n.resolvedLanguage]);

  const run = useCallback(async (task) => {
    if (busy) return;
    setBusy(true);
    try { await task(); await refresh(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined); }
    catch (e) {
      setErrorMessage(t('community.unavailable'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    }
    finally { setBusy(false); }
  }, [busy, refresh, t]);

  const publish = useCallback(() => run(async () => {
    if (!termsAccepted) return;
    await acceptCommunityTerms();
    await createCommunityPost({ category, kind, body: postBody });
    setPostBody(''); setSheet(null);
  }), [category, kind, postBody, run, termsAccepted]);
  const saveProfile = useCallback(() => run(async () => {
    await saveCommunityProfile({ nickname, bio }); setSheet(null);
  }), [bio, nickname, run]);
  const react = useCallback((id) => run(() => toggleCommunityReaction(id)), [run]);
  const openComment = useCallback((id) => { setCommentPost((current) => current === id ? null : id); setCommentBody(''); }, []);
  const sendComment = useCallback((id) => run(async () => {
    if (!termsAccepted) return;
    await acceptCommunityTerms();
    await createCommunityComment(id, commentBody); setCommentBody(''); setCommentPost(null);
  }), [commentBody, run, termsAccepted]);
  const menu = useCallback((post) => {
    if (post.mine) {
      confirm(t('community.deletePost'), t('common.cancel'), t('community.deletePost'), () => run(() => deleteCommunityTarget('post', post.id)));
    } else {
      confirm(t('community.reportAndBlock'), t('common.cancel'), t('community.reportAndBlock'), () => run(async () => {
        await reportCommunityTarget('post', post.id, 'other');
        await reportCommunityTarget('profile', post.author.publicId, 'other');
        await blockCommunityProfile(post.author.publicId);
      }));
    }
  }, [run, t]);
  const commentMenu = useCallback((comment) => {
    if (comment.mine) {
      confirm(t('community.deletePost'), t('common.cancel'), t('community.deletePost'), () => run(() => deleteCommunityTarget('comment', comment.id)));
    } else {
      confirm(t('community.reportAndBlock'), t('common.cancel'), t('community.reportAndBlock'), () => run(async () => {
        await reportCommunityTarget('comment', comment.id, 'other');
        await reportCommunityTarget('profile', comment.author.publicId, 'other');
        await blockCommunityProfile(comment.author.publicId);
      }));
    }
  }, [run, t]);

  const renderPost = useCallback(({ item }) => <PostCard
    item={item} date={formatter ? formatter.format(new Date(item.createdAt)) : ''} t={t}
    commentOpen={commentPost === item.id} commentBody={commentPost === item.id ? commentBody : ''}
    setCommentBody={setCommentBody} onComment={openComment} onSend={sendComment} onReact={react} onMenu={menu}
    onCommentMenu={commentMenu} termsAccepted={termsAccepted} onToggleTerms={() => setTermsAccepted((value) => !value)}
  />, [commentBody, commentMenu, commentPost, formatter, menu, openComment, react, sendComment, t, termsAccepted]);
  const renderRank = useCallback(({ item }) => (
    <View style={[styles.rank, item.mine ? styles.rankMine : null]}><Text style={styles.rankPosition}>#{item.position}</Text><View style={styles.rankIcon}><Ionicons name="leaf" size={17} color={item.mine ? colors.accentLight : colors.warning} /></View><View style={styles.grow}><Text style={styles.author}>{item.nickname}</Text><Text style={styles.caption}>{item.posts} · {item.comments} · {item.helpful}</Text></View><Text style={styles.rankScore}>{item.score}</Text></View>
  ), []);

  const header = <>
    <View style={styles.identity}>
      <View style={styles.live}><View style={styles.liveDot} /></View>
      <View style={styles.grow}><Text style={[styles.online, failed ? styles.offline : null]}>{data && !failed ? t('community.onlineBadge') : t('community.unavailable')}</Text><Pressable onPress={() => setSheet('profile')} accessibilityRole="button" accessibilityLabel={t('community.entryTitle')}><Text style={styles.nickname}>{data?.profile?.nickname || 'NatureLens'}</Text></Pressable></View>
      <Pressable style={styles.iconButton} onPress={() => setSheet('profile')} accessibilityRole="button" accessibilityLabel={t('community.entryTitle')}><Ionicons name="create-outline" size={19} color={colors.accentLight} /></Pressable>
    </View>
    {errorMessage ? <Text style={styles.errorMessage} accessibilityRole="alert">{errorMessage}</Text> : null}
    <View style={styles.tabs}>
      <Pressable style={[styles.tab, tab === 'feed' ? styles.tabActive : null]} onPress={() => setTab('feed')}><Ionicons name="book-outline" size={17} color={tab === 'feed' ? colors.background : colors.textSecondary} /><Text style={[styles.tabText, tab === 'feed' ? styles.tabTextActive : null]}>{t('community.feedTitle')}</Text></Pressable>
      <Pressable style={[styles.tab, tab === 'rank' ? styles.tabActive : null]} onPress={() => setTab('rank')}><Ionicons name="podium-outline" size={17} color={tab === 'rank' ? colors.background : colors.textSecondary} /><Text style={[styles.tabText, tab === 'rank' ? styles.tabTextActive : null]}>{t('community.rankingTitle')}</Text></Pressable>
    </View>
    {tab === 'feed' ? <View style={styles.composer}><View style={styles.row}><View style={styles.seal}><Ionicons name="leaf" size={19} color={colors.white} /></View><View style={styles.grow}><Text style={styles.composerTitle}>{t('community.careExchangeTitle')}</Text><Text style={styles.caption}>{t('community.careExchangeBody')}</Text></View></View><Pressable style={styles.primary} onPress={() => setSheet('post')}><Ionicons name="add" size={19} color={colors.background} /><Text style={styles.primaryText}>{t('community.careShareAction')}</Text></Pressable></View> : null}
  </>;

  const empty = <Pressable style={styles.empty} onPress={failed ? refresh : undefined}>
    <Ionicons name={loading ? 'sync-outline' : failed ? 'cloud-offline-outline' : tab === 'feed' ? 'journal-outline' : 'podium-outline'} size={30} color={failed ? colors.error : colors.accentLight} />
    {!loading ? <><Text style={styles.emptyTitle}>{failed ? t('community.unavailable') : t('community.inviteTitle')}</Text><Text style={styles.emptyBody}>{failed ? t('common.retry') : t('community.inviteBody')}</Text></> : null}
  </Pressable>;

  return <View style={styles.container}>
    <NatureScene />
    <View style={styles.header}><Pressable style={styles.headerButton} onPress={() => navigation.goBack()} accessibilityLabel={t('common.back')}><BackChevron size={24} color={colors.text} /></Pressable><Text style={styles.title}>{t('community.screenTitle')}</Text><View style={styles.headerButton} /></View>
    <FlatList data={tab === 'feed' ? data?.feed || [] : data?.leaderboard || []} renderItem={tab === 'feed' ? renderPost : renderRank} keyExtractor={(item) => item.id || item.publicId} ListHeaderComponent={header} ListEmptyComponent={empty} contentContainerStyle={styles.list} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" refreshing={loading && Boolean(data)} onRefresh={refresh} />

    <Modal visible={Boolean(sheet)} transparent animationType="slide" onRequestClose={() => setSheet(null)}><View style={styles.shade}><View style={styles.sheet}><View style={styles.handle} /><Text style={styles.sheetTitle}>{sheet === 'post' ? t('community.careExchangeTitle') : t('community.entryTitle')}</Text>
      {sheet === 'post' ? <>
        <View style={styles.choices}>{COMMUNITY_CATEGORIES.map((entry) => <Pressable key={entry.key} style={[styles.category, category === entry.key ? { borderColor: entry.accent } : null]} onPress={() => setCategory(entry.key)}><CategoryIcon name={entry.tabIcon} size={18} color={entry.accent} /></Pressable>)}</View>
        <View style={styles.choices}>{Object.entries(KIND_COPY).map(([value, key]) => <Pressable key={value} style={[styles.kindChoice, kind === value ? styles.choiceActive : null]} onPress={() => setKind(value)}><Text style={styles.choiceText}>{t(`community.careTopics.${key}`)}</Text></Pressable>)}</View>
        <TextInput style={styles.postInput} value={postBody} onChangeText={setPostBody} maxLength={1200} multiline autoFocus placeholder={t('community.careExchangeBody')} placeholderTextColor={colors.textMuted} />
        <Pressable style={styles.terms} onPress={() => setTermsAccepted((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: termsAccepted }}>
          <Ionicons name={termsAccepted ? 'checkbox' : 'square-outline'} size={21} color={termsAccepted ? colors.accentLight : colors.textMuted} />
          <View style={styles.grow}><Text style={styles.termsTitle}>{t('terms.acceptanceTitle')}</Text><Text style={styles.termsBody}>{t('terms.acceptanceBody')}</Text></View>
        </Pressable>
      </> : <><TextInput style={styles.profileInput} value={nickname} onChangeText={setNickname} maxLength={30} placeholder={t('community.heroTitle')} placeholderTextColor={colors.textMuted} /><TextInput style={[styles.profileInput, styles.bio]} value={bio} onChangeText={setBio} maxLength={180} multiline placeholder={t('community.headline')} placeholderTextColor={colors.textMuted} /></>}
      <View style={styles.sheetActions}><Pressable style={styles.secondary} onPress={() => setSheet(null)}><Text style={styles.secondaryText}>{t('common.cancel')}</Text></Pressable><Pressable style={[styles.confirm, sheet === 'post' ? postBody.trim().length < 20 || !termsAccepted ? styles.disabled : null : nickname.trim().length < 3 ? styles.disabled : null]} disabled={busy || (sheet === 'post' ? postBody.trim().length < 20 || !termsAccepted : nickname.trim().length < 3)} onPress={sheet === 'post' ? publish : saveProfile}><Text style={styles.confirmText}>{sheet === 'post' ? t('community.careShareAction') : t('common.save')}</Text></Pressable></View>
    </View></View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, paddingVertical: space.xs }, headerButton: { width: control.minTouch, height: control.minTouch, alignItems: 'center', justifyContent: 'center' }, title: { ...type.topTitle }, list: { paddingHorizontal: space.md, paddingBottom: space.xxl },
  row: { flexDirection: 'row', alignItems: 'center' }, grow: { flex: 1 }, iconButton: { width: control.minTouch, height: control.minTouch, alignItems: 'center', justifyContent: 'center' }, caption: { ...type.caption }, body: { ...type.body, color: colors.text, marginTop: space.sm },
  identity: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow }, live: { width: 42, height: 42, borderRadius: 21, backgroundColor: `${colors.accent}22`, alignItems: 'center', justifyContent: 'center', marginRight: space.sm }, liveDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accentLight, borderWidth: 3, borderColor: colors.accentDark }, online: { color: colors.accentLight, fontSize: 11, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 }, nickname: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: '900' },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, marginTop: space.md }, tab: { flex: 1, minHeight: control.minTouch, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, tabActive: { backgroundColor: colors.accentLight }, tabText: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' }, tabTextActive: { color: colors.background },
  composer: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: `${colors.accent}55`, padding: space.md, marginTop: space.md }, seal: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: space.sm }, composerTitle: { ...type.cardTitle }, primary: { minHeight: control.primaryHeight, borderRadius: radius.md, backgroundColor: colors.accentLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: space.md }, primaryText: { color: colors.background, fontSize: 13.5, fontWeight: '900' },
  post: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginTop: space.md }, spine: { width: 5 }, postInner: { flex: 1, padding: space.md }, avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: space.sm }, author: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '900' }, evidence: { marginTop: space.sm }, kind: { fontSize: 11.5, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase' }, subject: { flex: 1, textAlign: 'right' }, scientific: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16, fontStyle: 'italic' },
  comment: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: space.sm, marginTop: space.xs }, commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs }, commentMenu: { width: 32, height: 32, marginRight: -6, marginTop: -6, alignItems: 'center', justifyContent: 'center' }, commentText: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 }, commentAuthor: { color: colors.text, fontWeight: '900' }, commentComposer: { alignItems: 'flex-end', gap: space.xs, marginTop: space.sm }, commentInput: { flex: 1, minHeight: control.minTouch, maxHeight: 100, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: space.sm, paddingVertical: 10 }, send: { width: control.minTouch, height: control.minTouch, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }, actions: { gap: space.xs, marginTop: space.sm }, action: { minHeight: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.sm }, actionText: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  rank: { minHeight: 68, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.sm, marginTop: space.sm }, rankMine: { borderColor: colors.accentLight, backgroundColor: `${colors.accent}12` }, rankPosition: { width: 44, color: colors.text, fontSize: 17, fontWeight: '900' }, rankIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginRight: space.sm }, rankScore: { color: colors.accentLight, fontSize: 15, fontWeight: '900' }, empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: space.xl }, emptyTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900', textAlign: 'center', marginTop: space.sm }, emptyBody: { ...type.body, textAlign: 'center', marginTop: space.xs },
  shade: { flex: 1, backgroundColor: '#000000B8', justifyContent: 'flex-end' }, sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: space.lg, paddingBottom: space.xxl }, handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: space.lg }, sheetTitle: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: '900' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.md }, category: { width: 42, height: 42, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, kindChoice: { minHeight: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', paddingHorizontal: space.sm }, choiceActive: { borderColor: colors.accentLight, backgroundColor: `${colors.accent}1A` }, choiceText: { color: colors.textSecondary, fontSize: 11.5, fontWeight: '800' },
  postInput: { minHeight: 150, maxHeight: 260, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, padding: space.md, textAlignVertical: 'top', marginTop: space.md }, profileInput: { minHeight: control.primaryHeight, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: space.md, marginTop: space.md }, bio: { minHeight: 100, paddingTop: space.sm, textAlignVertical: 'top' }, sheetActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md }, secondary: { flex: 1, minHeight: control.primaryHeight, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: colors.textSecondary, fontSize: 13, fontWeight: '900' }, confirm: { flex: 2, minHeight: control.primaryHeight, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }, confirmText: { color: colors.white, fontSize: 13, fontWeight: '900' }, disabled: { opacity: 0.45 },
  terms: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, borderRadius: radius.md, backgroundColor: colors.surface, padding: space.sm, marginTop: space.sm }, termsTitle: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '900' }, termsBody: { color: colors.textMuted, fontSize: 10.5, lineHeight: 15, marginTop: 2 }, offline: { color: colors.error }, errorMessage: { color: colors.error, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: space.sm, paddingHorizontal: space.xs },
});
