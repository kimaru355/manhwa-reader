import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, Text, View } from 'react-native';

const PAD = 16; // half the thumb, so the thumb never leaves the track at either end
const THUMB = 22;
const DOT_GAP = 9; // the least space between two dots
const HEIGHT = 64;
const TRACK_Y = 40;

type Props = {
  /** The page being read, 1-based. */
  value: number;
  total: number;
  /** Called with the page under the thumb while dragging, and null when the drag ends. */
  onScrub?: (page: number | null) => void;
  /** Called with the page chosen when the thumb is let go (or a tap on the track). */
  onCommit: (page: number) => void;
  accent: string;
};

/**
 * A page slider: a row of dots, one for each page (or evenly spaced ones when there are too many to fit), with
 * a thumb that snaps from dot to dot, grows while held and shows the page number above it. Built on the
 * built-in Animated and PanResponder, so it needs no native module.
 */
export function PageSlider({ value, total, onScrub, onCommit, accent }: Props) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragPage, setShown] = useState(value);
  const shown = dragging ? dragPage : value;
  const usable = Math.max(width - PAD * 2, 1);
  const last = Math.max(total - 1, 1);
  const enabled = total > 1 && width > 0;

  // Fraction 0..1 along the track. Animated, so the thumb glides.
  const [pos] = useState(() => new Animated.Value(0));
  const [grow] = useState(() => new Animated.Value(0));
  const fracOf = (page: number) => (total > 1 ? (Math.min(Math.max(page, 1), total) - 1) / last : 0);

  // Everything the gesture handlers need, kept in a ref because PanResponder is made once.
  const liveRef = useRef({ total, usable, left: 0, page: value, onScrub, onCommit });
  const live = liveRef.current; // one object for the component's whole life, changed in place
  useEffect(() => {
    live.total = total;
    live.usable = usable;
    live.onScrub = onScrub;
    live.onCommit = onCommit;
  });

  const moveTo = (page: number, animated: boolean) => {
    const f = fracOf(page);
    if (animated) {
      Animated.spring(pos, { toValue: f, useNativeDriver: false, speed: 28, bounciness: 5 }).start();
    } else {
      pos.setValue(f);
    }
  };

  // Follows the reader's page when it changes by scrolling, not while a finger is on the thumb.
  useEffect(() => {
    if (dragging) return;
    live.page = value;
    Animated.timing(pos, {
      toValue: fracOf(value),
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, total, dragging, width]);

  const pageAt = (x: number) => {
    const { total: n, usable: u, left } = live;
    const f = Math.min(Math.max((x - left - PAD) / u, 0), 1);
    return Math.round(f * Math.max(n - 1, 1)) + 1;
  };

  // The responder is made once and reads `live` when touches happen, never while rendering.
  /* eslint-disable react-hooks/refs */
  const pan = useMemo(() => {
    const update = (x: number) => {
      const page = pageAt(x);
      if (page !== live.page) {
        live.page = page;
        setShown(page);
        live.onScrub?.(page);
        moveTo(page, true);
      }
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => live.total > 1,
      onMoveShouldSetPanResponder: () => live.total > 1,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e, g) => {
        setDragging(true);
        setShown(live.page);
        Animated.spring(grow, { toValue: 1, useNativeDriver: false, speed: 30, bounciness: 8 }).start();
        // Where the slider starts on screen (all its children ignore touches, so locationX is relative to it).
        live.left = e.nativeEvent.pageX - e.nativeEvent.locationX;
        update(g.x0);
      },
      onPanResponderMove: (_e, g) => update(g.moveX),
      onPanResponderRelease: () => finish(),
      onPanResponderTerminate: () => finish(),
    });

    function finish() {
      Animated.spring(grow, { toValue: 0, useNativeDriver: false, speed: 30, bounciness: 4 }).start();
      live.onScrub?.(null);
      live.onCommit(live.page);
      setDragging(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/refs */

  // One dot per page when they fit, otherwise evenly spaced dots that stand for runs of pages.
  const dots = useMemo(() => {
    if (total < 2 || width === 0) return [];
    const count = Math.min(total, Math.floor(usable / DOT_GAP) + 1);
    return Array.from({ length: count }, (_, i) => i / (count - 1));
  }, [total, usable, width]);

  const thumbX = pos.interpolate({ inputRange: [0, 1], outputRange: [PAD, PAD + usable] });
  const fillW = pos.interpolate({ inputRange: [0, 1], outputRange: [0, usable] });
  const scale = grow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const bubbleY = grow.interpolate({ inputRange: [0, 1], outputRange: [6, -2] });

  return (
    <View
      style={[styles.box, !enabled && { opacity: 0.4 }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      {...(enabled ? pan.panHandlers : {})}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Page"
      accessibilityValue={{ min: 1, max: Math.max(total, 1), now: Math.min(value, Math.max(total, 1)) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const step = e.nativeEvent.actionName === 'increment' ? 1 : -1;
        onCommit(Math.min(Math.max(value + step, 1), total));
      }}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.track, { left: PAD, width: usable }]} />
      <Animated.View style={[styles.fill, { left: PAD, width: fillW, backgroundColor: accent }]} />
      {dots.map((f, i) => (
        <View key={i} style={[styles.dot, { left: PAD + f * usable - 2 }]} />
      ))}
      <Animated.View
        style={[styles.bubble, { backgroundColor: accent, opacity: grow, left: thumbX, transform: [{ translateY: bubbleY }] }]}
      >
        <Text style={styles.bubbleText}>{shown}</Text>
      </Animated.View>
      <Animated.View
        style={[styles.thumb, { left: thumbX, borderColor: accent, transform: [{ scale }] }]}
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, height: HEIGHT, justifyContent: 'flex-end' },
  track: { position: 'absolute', top: TRACK_Y - 3, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)' },
  fill: { position: 'absolute', top: TRACK_Y - 3, height: 6, borderRadius: 3 },
  dot: { position: 'absolute', top: TRACK_Y - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)' },
  thumb: {
    position: 'absolute',
    top: TRACK_Y - THUMB / 2,
    marginLeft: -THUMB / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#fff',
    borderWidth: 3,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  bubble: {
    position: 'absolute',
    top: 0,
    marginLeft: -19,
    minWidth: 38,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
