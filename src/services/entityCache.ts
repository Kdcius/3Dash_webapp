import type { HAEntityOption } from '../components/EntityPicker';

const SESSION_KEY = 'haEntityCache';

let cache: HAEntityOption[] = [];

export function setEntityCache(entities: HAEntityOption[]): void {
  cache = entities;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(entities));
  } catch { /* storage full or unavailable */ }
}

export function getEntityCache(): HAEntityOption[] {
  if (cache.length > 0) return cache;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) cache = JSON.parse(raw) as HAEntityOption[];
  } catch { /* ignore */ }
  return cache;
}
