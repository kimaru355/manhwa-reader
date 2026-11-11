import { EmptyState } from '../../components/EmptyState';
import { SeriesGrid } from '../../components/SeriesGrid';
import { useLibrary } from '../../lib/library';

export default function Wishlist() {
  const { ready, wishlist } = useLibrary();

  if (!ready) return null;
  if (wishlist.length === 0) {
    return (
      <EmptyState
        icon="star-outline"
        title="Your wishlist is empty"
        message="Tap the star on a title to save it for later: not ready yet, or something to read next."
      />
    );
  }
  return <SeriesGrid data={wishlist} />;
}
