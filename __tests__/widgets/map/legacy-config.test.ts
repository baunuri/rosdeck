jest.mock('../../../widgets/view3d/View3DWidget', () => ({ View3DWidget: () => null }));
import { fromLegacyMapConfig } from '../../../widgets/map';

describe('fromLegacyMapConfig', () => {
  it('translates the old 2D map widget keys and starts top-down', () => {
    expect(fromLegacyMapConfig({ topic: '/my_map', mapFrame: 'world', enableNav2Goal: false, nav2GoalTopic: '/goal', scanTopic: '/s' }))
      .toMatchObject({ mapTopic: '/my_map', fixedFrame: 'world', enableGoal: false, goalTopic: '/goal', scanTopic: '/s', topDown: true });
  });

  it('prefers keys already in the new format', () => {
    expect(fromLegacyMapConfig({ topic: '/old', mapTopic: '/new', topDown: false }))
      .toMatchObject({ mapTopic: '/new', topDown: false });
  });
});
