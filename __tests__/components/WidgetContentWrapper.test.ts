// __tests__/components/WidgetContentWrapper.test.ts
jest.mock('react-native', () => ({
  View: 'View',
}));

jest.mock('../../hooks/useOrientation', () => ({
  useOrientation: () => ({ isLandscape: false }),
}));

import { getContentDimensions } from '../../components/WidgetContentWrapper';

describe('getContentDimensions', () => {
  it('returns original dimensions in portrait', () => {
    const result = getContentDimensions(200, 300, false);
    expect(result).toEqual({ contentWidth: 200, contentHeight: 300 });
  });

  it('swaps dimensions in landscape', () => {
    const result = getContentDimensions(200, 300, true);
    expect(result).toEqual({ contentWidth: 300, contentHeight: 200 });
  });
});
