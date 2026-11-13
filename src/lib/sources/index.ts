import type { Category, Series, SourceId } from '../types';
import { hentai20 } from './hentai20';
import { mangadex } from './mangadex';
import { novelbin } from './novelbin';
import type { Source } from './types';
import { webtoons } from './webtoons';

const ALL: Record<Exclude<SourceId, 'external'>, Source> = { mangadex, webtoons, hentai20, novelbin };

export const getSource = (id: SourceId): Source | undefined => (id === 'external' ? undefined : ALL[id]);

/** Used until the recommendations file says otherwise. */
export const DEFAULT_SOURCES: Record<Category, SourceId[]> = {
  manga: ['mangadex'],
  manhwa: ['webtoons'],
  interesting: ['hentai20'],
  novel: ['novelbin'],
};

export const imageHeaders = (s: Pick<Series, 'source'>): Record<string, string> =>
  getSource(s.source)?.imageHeaders ?? {};

export type { Source };
