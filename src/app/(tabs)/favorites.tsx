import { EmptyState } from '../../components/EmptyState';
import { SeriesGrid } from '../../components/SeriesGrid';
import { useLibrary } from '../../lib/library';

export default function Favorites() {
  const { ready, favorites } = useLibrary();

  if (!ready) return null;
  if (favorites.length === 0) {
    return <EmptyState icon="heart-outline" title="No favorites yet" message="Tap the heart on a title to keep it here." />;
  }
  return <SeriesGrid data={favorites} />;
}
