import type { TopicInfo } from './transport';

export interface DetectedTopic {
  name: string;
  type: string;
  widgetType: string;
}

export interface TopicSuggestion {
  presetId: string;
  detectedTopics: DetectedTopic[];
  widgetConfigs: Record<string, Record<string, any>>;
}

const TYPE_TO_WIDGET: Array<{ pattern: RegExp; widgetType: string; configKey: string }> = [
  { pattern: /OccupancyGrid/, widgetType: 'map', configKey: 'topic' },
  { pattern: /DiagnosticArray/, widgetType: 'diagnostics', configKey: 'topic' },
  { pattern: /BatteryState/, widgetType: 'battery', configKey: 'topic' },
];

function hasTwist(topics: TopicInfo[]): TopicInfo | undefined {
  return topics.find((t) => /Twist/.test(t.type));
}

export function suggestLayout(topics: TopicInfo[]): TopicSuggestion | null {
  if (topics.length === 0) return null;

  const detected: DetectedTopic[] = [];
  const widgetConfigs: Record<string, Record<string, any>> = {};

  for (const topic of topics) {
    for (const mapping of TYPE_TO_WIDGET) {
      if (mapping.pattern.test(topic.type)) {
        detected.push({ name: topic.name, type: topic.type, widgetType: mapping.widgetType });
        widgetConfigs[mapping.widgetType] = { [mapping.configKey]: topic.name };
        break;
      }
    }
  }

  // Camera: only use CompressedImage topics. Raw Image is never processed
  // (multi-MB frames would flood the websocket and freeze the app).
  const cameraTopic = topics.find((t) => /CompressedImage/.test(t.type));
  if (cameraTopic) {
    detected.push({ name: cameraTopic.name, type: cameraTopic.type, widgetType: 'camera' });
    widgetConfigs.camera = { topic: cameraTopic.name, source: 'transport' };
  }

  const twistTopic = hasTwist(topics);
  if (twistTopic) {
    detected.push({ name: twistTopic.name, type: twistTopic.type, widgetType: 'joystick' });
    widgetConfigs.joystick = { topic: twistTopic.name };
  }

  if (detected.length === 0) return null;

  const hasImage = detected.some((d) => d.widgetType === 'camera');
  const hasMap = detected.some((d) => d.widgetType === 'map');
  const hasTwistTopic = !!twistTopic;

  let presetId: string;
  if (hasImage && hasMap && hasTwistTopic) {
    presetId = 'dashboard';
  } else if (hasMap && hasTwistTopic) {
    presetId = 'nav';
  } else if (hasImage && hasTwistTopic) {
    presetId = 'drive-camera';
  } else if (hasImage) {
    presetId = 'camera-only';
  } else {
    presetId = 'drive';
  }

  return { presetId, detectedTopics: detected, widgetConfigs };
}
