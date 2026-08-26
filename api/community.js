const { getSupabaseAdmin, requireDeviceId } = require('./_lib/supabaseAdmin');
const { checkRateLimit } = require('./_lib/rateLimit');
const { randomBytes } = require('node:crypto');

const CATEGORIES = new Set(['plant', 'tree', 'crop', 'mushroom', 'insect', 'fish', 'bird', 'sound']);
const KINDS = new Set(['care', 'observation', 'recovery', 'question']);
const REASONS = new Set(['unsafe', 'spam', 'harassment', 'false_information', 'other']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HAS_URL = /(?:https?:\/\/|www\.)/i;

function oneLine(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function prose(value, max) {
  return typeof value === 'string'
    ? value.trim().replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').slice(0, max)
    : '';
}

function localeCode(value) {
  const locale = oneLine(value, 20).toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(locale) ? locale : null;
}

function defaultNickname() {
  // O apelido publico nunca deriva do device_id, que pode estar ligado a uma
  // assinatura. Cinco digitos aleatorios dao personalidade sem expor o vinculo.
  return `NatureLens #${randomBytes(3).toString('hex').slice(0, 5).toUpperCase()}`;
}

async function ensureProfile(admin, deviceId, locale) {
  const fields = 'device_id,public_id,nickname,bio,locale,status';
  const { data: existing, error: readError } = await admin
    .from('community_profiles').select(fields).eq('device_id', deviceId).maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;
  const { data, error } = await admin.from('community_profiles').insert({
    device_id: deviceId,
    nickname: defaultNickname(),
    locale: localeCode(locale),
  }).select(fields).single();
  if (error) throw error;
  return data;
}

async function blockedDevices(admin, deviceId) {
  const [outgoing, incoming] = await Promise.all([
    admin.from('community_blocks').select('blocked_device_id').eq('blocker_device_id', deviceId),
    admin.from('community_blocks').select('blocker_device_id').eq('blocked_device_id', deviceId),
  ]);
  if (outgoing.error) throw outgoing.error;
  if (incoming.error) throw incoming.error;
  return new Set([
    ...(outgoing.data || []).map((row) => row.blocked_device_id),
    ...(incoming.data || []).map((row) => row.blocker_device_id),
  ]);
}

async function profilesByDevice(admin, deviceIds) {
  if (!deviceIds.length) return new Map();
  const { data, error } = await admin.from('community_profiles')
    .select('device_id,public_id,nickname').in('device_id', deviceIds).eq('status', 'active');
  if (error) throw error;
  return new Map((data || []).map((profile) => [profile.device_id, profile]));
}

async function readFeed(admin, deviceId) {
  const blocked = await blockedDevices(admin, deviceId);
  const { data: sourcePosts, error } = await admin.from('community_posts')
    .select('id,author_device_id,category,kind,common_name,scientific_name,body,created_at')
    .is('deleted_at', null).eq('moderation_state', 'visible')
    .order('created_at', { ascending: false }).limit(60);
  if (error) throw error;
  const posts = (sourcePosts || []).filter((post) => !blocked.has(post.author_device_id));
  const postIds = posts.map((post) => post.id);
  const postAuthors = posts.map((post) => post.author_device_id);
  const [reactions, comments, mine] = await Promise.all([
    postIds.length ? admin.from('community_reactions').select('post_id').in('post_id', postIds) : { data: [] },
    postIds.length ? admin.from('community_comments')
      .select('id,post_id,author_device_id,body,created_at').in('post_id', postIds)
      .is('deleted_at', null).eq('moderation_state', 'visible').order('created_at') : { data: [] },
    postIds.length ? admin.from('community_reactions').select('post_id').in('post_id', postIds).eq('device_id', deviceId) : { data: [] },
  ]);
  for (const result of [reactions, comments, mine]) if (result.error) throw result.error;
  const safeComments = (comments.data || []).filter((comment) => !blocked.has(comment.author_device_id));
  const profiles = await profilesByDevice(admin, [...new Set([
    ...postAuthors,
    ...safeComments.map((comment) => comment.author_device_id),
  ])]);
  const reactionCount = new Map();
  for (const row of reactions.data || []) reactionCount.set(row.post_id, (reactionCount.get(row.post_id) || 0) + 1);
  const reacted = new Set((mine.data || []).map((row) => row.post_id));
  const commentsByPost = new Map();
  for (const comment of safeComments) {
    const author = profiles.get(comment.author_device_id);
    if (!author) continue;
    const list = commentsByPost.get(comment.post_id) || [];
    if (list.length < 20) list.push({
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      author: { publicId: author.public_id, nickname: author.nickname },
      mine: comment.author_device_id === deviceId,
    });
    commentsByPost.set(comment.post_id, list);
  }
  return posts.flatMap((post) => {
    const author = profiles.get(post.author_device_id);
    if (!author) return [];
    return [{
      id: post.id,
      category: post.category,
      kind: post.kind,
      commonName: post.common_name,
      scientificName: post.scientific_name,
      body: post.body,
      createdAt: post.created_at,
      author: { publicId: author.public_id, nickname: author.nickname },
      helpful: reactionCount.get(post.id) || 0,
      reacted: reacted.has(post.id),
      mine: post.author_device_id === deviceId,
      comments: commentsByPost.get(post.id) || [],
    }];
  });
}

async function readCommunity(admin, profile, res) {
  const [feed, ranking] = await Promise.all([
    readFeed(admin, profile.device_id),
    admin.rpc('community_leaderboard', { p_limit: 25 }),
  ]);
  if (ranking.error) throw ranking.error;
  res.status(200).json({
    profile: { publicId: profile.public_id, nickname: profile.nickname, bio: profile.bio || '' },
    feed,
    leaderboard: (ranking.data || []).map((row, index) => ({
      position: index + 1,
      publicId: row.public_id,
      nickname: row.nickname,
      posts: Number(row.posts) || 0,
      comments: Number(row.comments) || 0,
      helpful: Number(row.helpful_received) || 0,
      score: Number(row.score) || 0,
      mine: row.public_id === profile.public_id,
    })),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;
  const action = oneLine(req.body?.action, 30);
  if (!(await checkRateLimit(req, res, {
    scope: `community-${action === 'read' ? 'read' : 'write'}:${deviceId}`,
    limit: action === 'read' ? 120 : 30,
    windowSeconds: 600,
    ignoreIp: true,
  }))) return;

  try {
    const admin = getSupabaseAdmin();
    const profile = await ensureProfile(admin, deviceId, req.body?.locale);
    if (profile.status !== 'active') return res.status(403).json({ error: 'Community profile unavailable' });
    if (action === 'read') return await readCommunity(admin, profile, res);

    if (action === 'profile') {
      const nickname = oneLine(req.body?.nickname, 30);
      const bio = oneLine(req.body?.bio, 180);
      if (nickname.length < 3) return res.status(400).json({ error: 'Invalid profile' });
      const { error } = await admin.from('community_profiles').update({
        nickname, bio: bio || null, locale: localeCode(req.body?.locale), updated_at: new Date().toISOString(),
      }).eq('device_id', deviceId);
      if (error) throw error;
      return res.status(200).json({ saved: true });
    }

    if (action === 'post') {
      const category = oneLine(req.body?.category, 20);
      const kind = oneLine(req.body?.kind, 20);
      const body = prose(req.body?.body, 1200);
      if (!CATEGORIES.has(category) || !KINDS.has(kind) || body.length < 20 || HAS_URL.test(body)) {
        return res.status(400).json({ error: 'Invalid community post' });
      }
      const { error } = await admin.from('community_posts').insert({
        author_device_id: deviceId,
        category,
        kind,
        common_name: oneLine(req.body?.commonName, 120) || null,
        scientific_name: oneLine(req.body?.scientificName, 140) || null,
        body,
      });
      if (error) throw error;
      return res.status(201).json({ created: true });
    }

    if (action === 'comment') {
      const postId = oneLine(req.body?.postId, 40);
      const body = prose(req.body?.body, 500);
      if (!UUID.test(postId) || body.length < 2 || HAS_URL.test(body)) return res.status(400).json({ error: 'Invalid comment' });
      const { data: post } = await admin.from('community_posts').select('id')
        .eq('id', postId).is('deleted_at', null).eq('moderation_state', 'visible').maybeSingle();
      if (!post) return res.status(404).json({ error: 'Post not found' });
      const { error } = await admin.from('community_comments').insert({ post_id: postId, author_device_id: deviceId, body });
      if (error) throw error;
      return res.status(201).json({ created: true });
    }

    if (action === 'react') {
      const postId = oneLine(req.body?.postId, 40);
      if (!UUID.test(postId)) return res.status(400).json({ error: 'Invalid post' });
      const { data: existing, error: readError } = await admin.from('community_reactions')
        .select('post_id').eq('post_id', postId).eq('device_id', deviceId).maybeSingle();
      if (readError) throw readError;
      const result = existing
        ? await admin.from('community_reactions').delete().eq('post_id', postId).eq('device_id', deviceId)
        : await admin.from('community_reactions').insert({ post_id: postId, device_id: deviceId });
      if (result.error) throw result.error;
      return res.status(200).json({ reacted: !existing });
    }

    if (action === 'delete') {
      const targetType = oneLine(req.body?.targetType, 20);
      const targetId = oneLine(req.body?.targetId, 40);
      if (!UUID.test(targetId) || !['post', 'comment'].includes(targetType)) return res.status(400).json({ error: 'Invalid target' });
      const table = targetType === 'post' ? 'community_posts' : 'community_comments';
      // Exclusao solicitada pelo autor e fisica. O soft-delete existe para a
      // moderacao, nao para fingir que um conteudo "excluido" continua retido.
      const { error } = await admin.from(table).delete()
        .eq('id', targetId).eq('author_device_id', deviceId);
      if (error) throw error;
      return res.status(200).json({ deleted: true });
    }

    if (action === 'block') {
      const publicId = oneLine(req.body?.publicId, 40);
      if (!UUID.test(publicId) || publicId === profile.public_id) return res.status(400).json({ error: 'Invalid profile' });
      const { data: target } = await admin.from('community_profiles').select('device_id').eq('public_id', publicId).maybeSingle();
      if (!target) return res.status(404).json({ error: 'Profile not found' });
      const { error } = await admin.from('community_blocks').upsert({
        blocker_device_id: deviceId, blocked_device_id: target.device_id,
      });
      if (error) throw error;
      return res.status(200).json({ blocked: true });
    }

    if (action === 'report') {
      const targetType = oneLine(req.body?.targetType, 20);
      const targetId = oneLine(req.body?.targetId, 40);
      const reason = oneLine(req.body?.reason, 30);
      if (!['post', 'comment', 'profile'].includes(targetType) || !UUID.test(targetId) || !REASONS.has(reason)) {
        return res.status(400).json({ error: 'Invalid report' });
      }
      const { error } = await admin.from('community_reports').upsert({
        reporter_device_id: deviceId, target_type: targetType, target_id: targetId, reason,
      }, { onConflict: 'reporter_device_id,target_type,target_id' });
      if (error) throw error;
      // deviceId e autoemitido: qualquer pessoa consegue criar varios UUIDs.
      // Portanto, uma denuncia nunca pode suspender perfil nem esconder
      // conteudo automaticamente. Ela entra na fila para revisao humana; a
      // decisao de moderacao acontece apenas no painel administrativo.
      return res.status(200).json({ reported: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('community endpoint failed', action, error.message);
    return res.status(503).json({ error: 'Community is temporarily unavailable' });
  }
};
