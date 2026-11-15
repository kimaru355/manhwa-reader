import { EmptyState } from '../../components/EmptyState';
import { ShelfView } from '../../components/ShelfView';
import { useLibrary } from '../../lib/library';

export default function Wishlist() {
  const { ready, wishlist } = useLibrary();

  if (!ready) return null;
  return (
    <ShelfView
      shelf="wishlist"
      items={wishlist}
      empty={
        <EmptyState
          icon="star-outline"
          title="Your wishlist is empty"
          message="Tap the star on a title to save it for later: not ready yet, or something to read next."
        />
      }
    />
  );
}
