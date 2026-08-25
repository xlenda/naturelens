import { useEffect, useMemo, useState } from 'react';

export const SPECIES_TOPIC_RESOURCE_LIMIT = 48;

const resources = new Map();
let accessClock = 0;

function normaliseKeyPart(value, fallback = '') {
  const clean = String(value ?? fallback).trim().toLowerCase().replace(/_/g, '-');
  return encodeURIComponent(clean);
}

export function createSpeciesTopicResourceKey({ category, language, routeKey, identity } = {}) {
  const scope = routeKey ?? identity;
  if (!category || scope === undefined || scope === null || String(scope).trim() === '') return null;
  return [
    'species-topics-v1',
    normaliseKeyPart(category),
    normaliseKeyPart(language, 'en'),
    normaliseKeyPart(scope),
  ].join(':');
}

function touch(resource) {
  resource.lastAccess = ++accessClock;
}

function pruneResources() {
  while (resources.size > SPECIES_TOPIC_RESOURCE_LIMIT) {
    let oldestKey = null;
    let oldestAccess = Infinity;
    for (const [key, resource] of resources) {
      if (resource.listeners.size > 0) continue;
      if (resource.lastAccess < oldestAccess) {
        oldestKey = key;
        oldestAccess = resource.lastAccess;
      }
    }
    // Um manual ativo nao pode perder as abas enquanto recebe enriquecimento;
    // a pilha normal mantem muito menos assinantes que este limite.
    if (!oldestKey) return;
    resources.delete(oldestKey);
  }
}

function sameTopics(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((topic, index) => {
    const candidate = right[index];
    return topic?.key === candidate?.key
      && topic?.label === candidate?.label
      && topic?.text === candidate?.text
      && topic?.icon === candidate?.icon
      && topic?.color === candidate?.color
      && topic?.shortValue === candidate?.shortValue
      && topic?.level === candidate?.level
      && !!topic?.groupOnly === !!candidate?.groupOnly
      && topic?.scientific === candidate?.scientific
      && JSON.stringify(topic?.sourceIds || []) === JSON.stringify(candidate?.sourceIds || [])
      && JSON.stringify(topic?.sources || []) === JSON.stringify(candidate?.sources || [])
      && JSON.stringify(topic?.stageProfile || null) === JSON.stringify(candidate?.stageProfile || null)
      && JSON.stringify(topic?.orderStageProfile || null) === JSON.stringify(candidate?.orderStageProfile || null);
  });
}

export function publishSpeciesTopics(key, topics, loading = false) {
  if (!key || !Array.isArray(topics)) return undefined;
  const nextLoading = loading === true;
  let resource = resources.get(key);
  if (!resource) {
    resource = { topics: undefined, loading: false, listeners: new Set(), lastAccess: 0 };
    resources.set(key, resource);
  }
  touch(resource);
  if (sameTopics(resource.topics, topics) && resource.loading === nextLoading) {
    pruneResources();
    return resource.topics;
  }
  resource.topics = topics.slice();
  resource.loading = nextLoading;
  for (const listener of [...resource.listeners]) listener(resource.topics, resource.loading);
  pruneResources();
  return resource.topics;
}

export function readSpeciesTopics(key) {
  if (!key) return undefined;
  const resource = resources.get(key);
  if (!resource) return undefined;
  touch(resource);
  return resource.topics;
}

export function readSpeciesTopicLoading(key) {
  if (!key) return false;
  const resource = resources.get(key);
  if (!resource) return false;
  touch(resource);
  return resource.loading === true;
}

export function subscribeSpeciesTopics(key, listener) {
  if (!key || typeof listener !== 'function') return () => {};
  let resource = resources.get(key);
  if (!resource) {
    resource = { topics: undefined, loading: false, listeners: new Set(), lastAccess: 0 };
    resources.set(key, resource);
  }
  touch(resource);
  resource.listeners.add(listener);
  pruneResources();
  return () => {
    const current = resources.get(key);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0 && current.topics === undefined) resources.delete(key);
    pruneResources();
  };
}

export function mergeSpeciesTopics(fallbackTopics = [], resourceTopics) {
  const fallback = Array.isArray(fallbackTopics) ? fallbackTopics : [];
  if (!Array.isArray(resourceTopics)) return fallback;
  const merged = resourceTopics.slice();
  const keys = new Set(merged.map((topic) => topic?.key).filter(Boolean));
  for (const topic of fallback) {
    if (!topic?.key || keys.has(topic.key)) continue;
    merged.push(topic);
    keys.add(topic.key);
  }
  return merged;
}

export function clearSpeciesTopicResources() {
  resources.clear();
  accessClock = 0;
}

export function usePublishSpeciesTopics(key, topics, loading = false) {
  useEffect(() => {
    publishSpeciesTopics(key, topics, loading);
  }, [key, loading, topics]);
}

export function useSpeciesTopicState(key, fallbackTopics = [], fallbackLoading = false) {
  const [snapshot, setSnapshot] = useState(() => {
    const topics = readSpeciesTopics(key);
    return {
      key,
      topics,
      loading: topics === undefined ? fallbackLoading === true : readSpeciesTopicLoading(key),
    };
  });

  useEffect(() => {
    const resourceTopics = readSpeciesTopics(key);
    setSnapshot({
      key,
      topics: resourceTopics,
      loading: resourceTopics === undefined
        ? fallbackLoading === true
        : readSpeciesTopicLoading(key),
    });
    return subscribeSpeciesTopics(key, (topics, loading) => setSnapshot({ key, topics, loading }));
  }, [fallbackLoading, key]);

  const resourceTopics = snapshot.key === key ? snapshot.topics : undefined;
  const loading = snapshot.key === key ? snapshot.loading === true : fallbackLoading === true;
  return useMemo(
    () => ({
      loading,
      topics: loading ? [] : mergeSpeciesTopics(fallbackTopics, resourceTopics),
    }),
    [fallbackTopics, loading, resourceTopics]
  );
}

export function useSpeciesTopics(key, fallbackTopics = []) {
  return useSpeciesTopicState(key, fallbackTopics).topics;
}
