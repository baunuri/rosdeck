import React, { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ErrorCode, finishTransaction, getAvailablePurchases, initConnection, useIAP, type Purchase,
} from 'expo-iap';
import { GOLD, useSupporterStore } from '../stores/useSupporterStore';
import { theme } from '../constants/theme';

/**
 * One-time (non-consumable) Play products, so owned tips come back after a reinstall or on a
 * new phone. Each tier can be bought once. Prices come from Play (local currency).
 */
export const TIPS = [
  { sku: 'tip_hobbyist', label: 'Hobby roboticist', icon: 'construct-outline' },
  { sku: 'tip_lab', label: 'Robotics lab', icon: 'flask-outline' },
  { sku: 'tip_company', label: 'Robotics company', icon: 'business-outline' },
  { sku: 'tip_industrial', label: 'Industrial giant', icon: 'planet-outline' },
] as const;
const TIP_SKUS: string[] = TIPS.map((t) => t.sku);
const SPONSOR_MAIL = 'mailto:contact@baunuri.com?subject=ROSDeck%20sponsorship';

const ownedTips = (purchases: Purchase[]) =>
  purchases.filter((p) => TIP_SKUS.includes(p.productId) && p.purchaseState === 'purchased');

/**
 * At launch: owned tips → supporter, none → not (a refund takes the gold back). Also acknowledges
 * tips left unfinished by a crash; Play refunds unacknowledged purchases after 3 days.
 * Offline or no Play: keep the cached flag.
 */
export async function syncSupporterFromPlay() {
  try {
    await initConnection();
    const owned = ownedTips(await getAvailablePurchases());
    for (const p of owned) {
      if (!('isAcknowledgedAndroid' in p && p.isAcknowledgedAndroid)) await finishTransaction({ purchase: p, isConsumable: false });
    }
    useSupporterStore.getState().setSupporter(owned.length > 0);
  } catch {}
}

/** Tip jar + sponsor contact for Settings (Android only). Any tip unlocks the gold joystick + badge. */
export function SupportSection() {
  const supporter = useSupporterStore((s) => s.supporter);
  const [busy, setBusy] = useState<string | null>(null);

  const { connected, products, fetchProducts, requestPurchase, getAvailablePurchases: refreshOwned, availablePurchases } = useIAP({
    onPurchaseSuccess: async (p) => {
      setBusy(null);
      if (!TIP_SKUS.includes(p.productId) || p.purchaseState !== 'purchased') return; // pending: finished on a later launch
      try { await finishTransaction({ purchase: p, isConsumable: false }); } catch {}
      const first = !useSupporterStore.getState().supporter;
      useSupporterStore.getState().setSupporter(true);
      refreshOwned().catch(() => {});
      Alert.alert('Thank you!', first ? 'Your joystick just turned gold.' : 'Thanks for supporting ROSDeck again.');
    },
    onPurchaseError: (e) => {
      setBusy(null);
      if (e.code !== ErrorCode.UserCancelled) Alert.alert('Purchase failed', e.message);
    },
  });

  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: TIP_SKUS, type: 'in-app' }).catch(() => {});
    refreshOwned().catch(() => {});
  }, [connected]);

  const owned = new Set(ownedTips(availablePurchases).map((p) => p.productId));
  const tiers = TIPS.map((t) => ({ ...t, product: products.find((p) => p.id === t.sku) })).filter((t) => t.product);

  return (
    <>
      <Text style={styles.sectionTitle}>SUPPORT ROSDECK</Text>
      <View style={styles.card}>
        {supporter && (
          <View style={styles.badge}>
            <Ionicons name="star" size={12} color={GOLD} />
            <Text style={styles.badgeText}>SUPPORTER</Text>
          </View>
        )}
        <Text style={styles.blurb}>
          ROSDeck is free and has no ads. If it helps your robots, a tip keeps it going.
        </Text>
        {tiers.length === 0 ? (
          <Text style={styles.muted}>{connected ? 'Tips aren’t available right now.' : 'Connecting to Google Play…'}</Text>
        ) : (
          tiers.map((t) => {
            const has = owned.has(t.sku);
            return (
              <TouchableOpacity
                key={t.sku}
                style={[styles.tier, has && styles.tierOwned, busy !== null && !has && styles.disabled]}
                disabled={has || busy !== null}
                accessibilityLabel={`${t.label} tip, ${t.product!.displayPrice}${has ? ', owned' : ''}`}
                onPress={() => {
                  setBusy(t.sku);
                  requestPurchase({ request: { google: { skus: [t.sku] } }, type: 'in-app' }).catch(() => setBusy(null));
                }}
              >
                <Ionicons name={t.icon} size={18} color={GOLD} />
                <Text style={styles.tierLabel}>{t.label}</Text>
                {has
                  ? <Ionicons name="checkmark-circle" size={18} color={GOLD} />
                  : <Text style={styles.price}>{t.product!.displayPrice}</Text>}
              </TouchableOpacity>
            );
          })
        )}
        <View style={styles.divider} />
        <TouchableOpacity style={styles.sponsor} onPress={() => Linking.openURL(SPONSOR_MAIL).catch(() => {})}>
          <Ionicons name="ribbon-outline" size={16} color={theme.colors.accentPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.sponsorTitle}>Become a sponsor</Text>
            <Text style={styles.muted}>Your logo here, for companies and labs. contact@baunuri.com</Text>
          </View>
          <Ionicons name="mail-outline" size={16} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...theme.typography.label, color: theme.colors.textMuted, marginTop: 16, marginBottom: 8 },
  card: {
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 8,
    gap: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: GOLD + '66',
    backgroundColor: GOLD + '1A',
    borderRadius: theme.radius.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontFamily: 'SpaceMono', fontSize: 11, fontWeight: '700', color: GOLD, letterSpacing: 1 },
  blurb: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
  muted: { fontSize: 12, color: theme.colors.textMuted },
  tier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: GOLD + '55',
  },
  tierOwned: { backgroundColor: GOLD + '14' },
  tierLabel: { flex: 1, fontSize: 14, color: theme.colors.textPrimary },
  disabled: { opacity: 0.4 },
  price: { fontFamily: 'SpaceMono', fontSize: 13, color: theme.colors.textPrimary },
  divider: { height: 1, backgroundColor: theme.colors.borderSubtle, marginVertical: 2 },
  sponsor: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  sponsorTitle: { fontFamily: 'SpaceMono', fontSize: 13, color: theme.colors.accentPrimary },
});
