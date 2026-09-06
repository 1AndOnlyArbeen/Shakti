// Web-only stand-in for react-native-maps, wired up in metro.config.js and used
// ONLY when bundling for `platform === 'web'`. The real package imports React
// Native internals (codegenNativeCommands) that don't exist on web, so a web
// bundle can't be built at all without this.
//
// It renders a labelled placeholder in the map's place and no-ops the imperative
// API, which keeps every screen AROUND the map — sheets, buttons, ride flow,
// drop-off picker chrome — fully clickable in a browser. The map itself is not
// interactive here; use a device or emulator to test actual map behaviour.
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = undefined;

// Overlays are children of the map; on web they simply draw nothing.
const nothing = () => null;
export const Marker = nothing;
export const Polyline = nothing;
export const Polygon = nothing;
export const Circle = nothing;
export const Callout = nothing;
export const Overlay = nothing;

const MapView = forwardRef(function MapView(
  { style, children, initialRegion, region, onRegionChangeComplete },
  ref
) {
  // Every method a caller might reach for through the ref, as a no-op.
  useImperativeHandle(ref, () => ({
    animateToRegion: () => {},
    animateCamera: () => {},
    fitToCoordinates: () => {},
    fitToElements: () => {},
    fitToSuppliedMarkers: () => {},
    getCamera: async () => ({ center: region || initialRegion, zoom: 15 }),
    getMapBoundaries: async () => null,
    setCamera: () => {},
    coordinateForPoint: async () => null,
    pointForCoordinate: async () => null,
    takeSnapshot: async () => null,
  }));

  // Report the starting region once so callers that only learn the selected
  // coordinate through this callback (the drop-off picker) still get a value
  // instead of sitting empty. It's the initial centre, never a user pan.
  useEffect(() => {
    const start = region || initialRegion;
    if (start && onRegionChangeComplete) onRegionChangeComplete(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.placeholder, style]}>
      <Text style={styles.label}>Map preview is not available in the web build</Text>
      <Text style={styles.sub}>Run on a device or emulator to test the map</Text>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#e6e3dc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#6b6459', textAlign: 'center' },
  sub: { marginTop: 4, fontSize: 11, color: '#928b7e', textAlign: 'center' },
});

export default MapView;
