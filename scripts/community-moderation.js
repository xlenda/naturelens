/* eslint-disable no-console */
const { createClient } = require('@supabase/supabase-js');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const [command = 'list', targetType, targetId, ...noteParts] = process.argv.slice(2);
const note = noteParts.join(' ').trim().slice(0, 500) || null;
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

function stop(message) {
  console.error(message);
  process.exitCode = 1;
}

async function resolveReports(admin, status) {
  const result = await admin.from('community_reports').update({
    status,
    reviewed_at: new Date().toISOString(),
    moderator_note: note,
  }).eq('target_type', targetType).eq('target_id', targetId).eq('status', 'pending');
  if (result.error) throw result.error;
}

async function main() {
  if (!url || !key) return stop('Defina EXPO_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  if (command === 'list') {
    const result = await admin.from('community_reports')
      .select('id,target_type,target_id,reason,created_at')
      .eq('status', 'pending').order('created_at').limit(100);
    if (result.error) throw result.error;
    console.table(result.data || []);
    return;
  }

  if (!['post', 'comment', 'profile'].includes(targetType) || !UUID.test(targetId || '')) {
    return stop('Uso: community:moderate <list|remove|dismiss|restore|suspend|activate> <post|comment|profile> <uuid> [nota]');
  }

  if (command === 'dismiss') {
    await resolveReports(admin, 'dismissed');
    console.log('Denuncias descartadas apos revisao humana.');
    return;
  }

  if (targetType === 'profile') {
    if (!['suspend', 'activate'].includes(command)) return stop('Perfil aceita apenas suspend ou activate.');
    const result = await admin.from('community_profiles')
      .update({ status: command === 'suspend' ? 'suspended' : 'active', updated_at: new Date().toISOString() })
      .eq('public_id', targetId).select('public_id').maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return stop('Perfil nao encontrado; nenhuma alteracao realizada.');
  } else {
    if (!['remove', 'restore'].includes(command)) return stop('Conteudo aceita apenas remove ou restore.');
    const table = targetType === 'post' ? 'community_posts' : 'community_comments';
    const result = await admin.from(table)
      .update({ moderation_state: command === 'remove' ? 'removed' : 'visible' })
      .eq('id', targetId).select('id').maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return stop('Conteudo nao encontrado; nenhuma alteracao realizada.');
  }

  await resolveReports(admin, 'resolved');
  console.log('Moderacao aplicada e denuncias pendentes resolvidas.');
}

main().catch((error) => stop(`Falha na moderacao: ${error.message}`));
