import type { Category, Series, SourceId } from '../types';
import { mangadex } from './mangadex';
import { novelfull } from './novelfull';
import type { Source } from './types';
import { webtoons } from './webtoons';

const ALL: Record<Exclude<SourceId, 'external'>, Source> = { mangadex, webtoons, novelfull };

/** False for sources the app no longer ships (old saved data may still point at them). */
export const isKnownSource = (id: string): boolean => id === 'external' || id in ALL;

export const getSource = (id: SourceId): Source | undefined => (id === 'external' ? undefined : ALL[id]);

/** Used until the recommendations file says otherwise. */
export const DEFAULT_SOURCES: Record<Category, SourceId[]> = {
  manga: ['mangadex'],
  manhwa: ['webtoons'],
  isekai: ['mangadex'],
  novel: ['novelfull'],
};

export const imageHeaders = (s: Pick<Series, 'source'>): Record<string, string> =>
  getSource(s.source)?.imageHeaders ?? {};

export type { Source };
