import { EmptyState } from '../../components/EmptyState';
import { ShelfView } from '../../components/ShelfView';
import { useLibrary } from '../../lib/library';

export default function Favorites() {
  const { ready, favorites } = useLibrary();

  if (!ready) return null;
  return (
    <ShelfView
      shelf="favorites"
      items={favorites}
      empty={<EmptyState icon="heart-outline" title="No favorites yet" message="Tap the heart on a title to keep it here." />}
    />
  );
}
