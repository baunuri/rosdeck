import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRosStore } from '../../stores/useRosStore';
import { theme } from '../../constants/theme';
import type { WidgetProps } from '../../types/layout';
import { WidgetEmptyState } from '../../components/WidgetEmptyState';
import { TextScaleControls } from '../../components/TextScaleControls';

interface TreeNode {
  name: string;
  children: TreeNode[];
}

function stripLeadingSlash(frameId: string): string {
  return frameId.startsWith('/') ? frameId.slice(1) : frameId;
}

function buildTree(parentToChildren: Map<string, Set<string>>): TreeNode[] {
  const allChildren = new Set<string>();
  for (const children of parentToChildren.values()) {
    for (const child of children) {
      allChildren.add(child);
    }
  }

  const roots: string[] = [];
  for (const parent of parentToChildren.keys()) {
    if (!allChildren.has(parent)) {
      roots.push(parent);
    }
  }

  // Sort roots for stable ordering
  roots.sort();

  function buildNode(name: string): TreeNode {
    const childNames = parentToChildren.get(name);
    const children = childNames
      ? Array.from(childNames).sort().map(buildNode)
      : [];
    return { name, children };
  }

  return roots.map(buildNode);
}

function countFrames(parentToChildren: Map<string, Set<string>>): number {
  const frames = new Set<string>();
  for (const [parent, children] of parentToChildren.entries()) {
    frames.add(parent);
    for (const child of children) {
      frames.add(child);
    }
  }
  return frames.size;
}

function TreeNodeView({ node, depth, textScale }: { node: TreeNode; depth: number; textScale: number }) {
  const sz = 12 * textScale;
  const lh = sz * 1.5;
  return (
    <>
      <View style={[styles.nodeRow, { paddingLeft: 8 + depth * 16 }]}>
        {depth > 0 && <Text style={[styles.branch, { fontSize: sz, lineHeight: lh }]}>{'\u2514\u2500 '}</Text>}
        <Text style={[styles.frameName, { fontSize: sz, lineHeight: lh }]}>{node.name}</Text>
      </View>
      {node.children.map((child) => (
        <TreeNodeView key={child.name} node={child} depth={depth + 1} textScale={textScale} />
      ))}
    </>
  );
}

export function TfTreeWidget(props: Partial<WidgetProps>) {
  const transport = useRosStore((s) => s.transport);
  const status = useRosStore((s) => s.connection.status);
  const parentToChildrenRef = useRef<Map<string, Set<string>>>(new Map());
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [frameCount, setFrameCount] = useState(0);
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [textScale, setTextScale] = useState(1);

  const handleTfMessage = useCallback((msg: any) => {
    const map = parentToChildrenRef.current;
    let changed = false;

    const transforms: any[] = msg.transforms || [];
    for (const tf of transforms) {
      const parent = stripLeadingSlash(tf.header?.frame_id || '');
      const child = stripLeadingSlash(tf.child_frame_id || '');
      if (!parent || !child) continue;

      if (!map.has(parent)) {
        map.set(parent, new Set());
      }
      const children = map.get(parent)!;
      if (!children.has(child)) {
        children.add(child);
        changed = true;
      }
    }

    if (changed) {
      setTree(buildTree(map));
      setFrameCount(countFrames(map));
    }
  }, []);

  useEffect(() => {
    if (!transport || status !== 'connected') return;

    const sub1 = transport.subscribe('/tf', 'tf2_msgs/msg/TFMessage', handleTfMessage);
    const sub2 = transport.subscribe('/tf_static', 'tf2_msgs/msg/TFMessage', handleTfMessage);

    return () => {
      sub1.unsubscribe();
      sub2.unsubscribe();
      parentToChildrenRef.current = new Map();
      setTree([]);
      setFrameCount(0);
    };
  }, [transport, status, handleTfMessage]);

  useEffect(() => {
    if (status === 'connected' && tree.length === 0) {
      const timer = setTimeout(() => setShowEmptyState(true), 3000);
      return () => clearTimeout(timer);
    }
    setShowEmptyState(false);
  }, [status, tree.length]);

  const width = props?.width || 250;
  const height = props?.height || 300;

  return (
    <View style={[styles.container, { width, height }]}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>TF TREE</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.frameCountBadge}>{frameCount}</Text>
          <TextScaleControls scale={textScale} onScaleChange={setTextScale} />
        </View>
      </View>
      {showEmptyState && tree.length === 0 ? (
        <WidgetEmptyState widgetType="tf-tree" topicName="/tf" />
      ) : (
        <ScrollView style={styles.scrollArea}>
          {tree.length === 0 ? (
            <Text style={styles.emptyText}>Waiting for TF data...</Text>
          ) : (
            tree.map((root) => (
              <TreeNodeView key={root.name} node={root} depth={0} textScale={textScale} />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.bgBase,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 28,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  headerLabel: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
  },
  frameCountBadge: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.bgSurface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
  },
  scrollArea: {
    flex: 1,
    paddingVertical: 4,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  branch: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  frameName: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.accentPrimary,
  },
  emptyText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingTop: 20,
  },
});
