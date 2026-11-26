jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../../stores/useRosStore', () => ({
  useRosStore: jest.fn(),
}));

jest.mock('../../constants/theme', () => ({
  theme: {
    colors: {
      bgSurface: '#000',
      bgElevated: '#000',
      borderDefault: '#000',
      borderSubtle: '#000',
      accentPrimary: '#000',
      accentPrimaryMuted: '#000',
      textValue: '#000',
      textMuted: '#000',
      statusError: '#000',
    },
    radius: { md: 8 },
  },
}));

import { extractNumericPaths } from '../../components/FieldPicker';

describe('extractNumericPaths', () => {
  it('extracts simple numeric fields', () => {
    const msg = { x: 1, y: 2, name: 'hello' };
    expect(extractNumericPaths(msg)).toEqual(['x', 'y']);
  });

  it('extracts nested numeric fields', () => {
    const msg = { pose: { position: { x: 1, y: 2, z: 3 } } };
    expect(extractNumericPaths(msg)).toEqual([
      'pose.position.x',
      'pose.position.y',
      'pose.position.z',
    ]);
  });

  it('extracts array elements up to index 15', () => {
    const values = Array.from({ length: 16 }, (_, i) => i * 0.1);
    const msg = { interface_values: [{ values }] };
    const paths = extractNumericPaths(msg);
    expect(paths).toContain('interface_values.0.values.7');
    expect(paths).toContain('interface_values.0.values.15');
  });

  it('caps array sampling at 32 elements', () => {
    const values = Array.from({ length: 40 }, (_, i) => i);
    const msg = { data: values };
    const paths = extractNumericPaths(msg);
    expect(paths).toContain('data.31');
    expect(paths).not.toContain('data.32');
  });

  it('respects depth limit of 8', () => {
    const msg = { a: { b: { c: { d: { e: { f: { g: { h: 1, i: { j: 1 } } } } } } } } };
    const paths = extractNumericPaths(msg);
    expect(paths).toContain('a.b.c.d.e.f.g.h');
    expect(paths).not.toContain('a.b.c.d.e.f.g.i.j');
  });

  it('returns empty array for null/undefined', () => {
    expect(extractNumericPaths(null)).toEqual([]);
    expect(extractNumericPaths(undefined)).toEqual([]);
  });
});
