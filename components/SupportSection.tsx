import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ErrorCode, useIAP, type Purchase } from 'expo-iap';
import { GOLD, useSupporterStore } from '../stores/useSupporterStore';
import { theme } from '../constants/theme';

/** Consumable Play products (Monetize → Products → One-time products), so people can tip again. */
export const TIP_SKUS = ['tip_small', 'tip_medium', 'tip_large'];

/** Tip jar for Settings (Android only). Any tip unlocks the gold joystick + supporter badge. */
export function SupportSection() {
  const supporter = useSupporterStore((s) => s.supporter);
  const markSupporter = useSupporterStore((s) => s.markSupporter);
  const [busy, setBusy] = useState<string | null>(null);
  const handled = useRef(new Set<string>()); // the success callback and the pending check can both deliver one purchase

  // Consume the tip (so it can be bought again) and say thanks. Play refunds purchases
  // that aren't acknowledged within 3 days, so this also runs for ones left from a crash.
  const complete = async (purchase: Purchase) => {
    if (!TIP_SKUS.includes(purchase.productId) || purchase.purchaseState !== 'purchased') return;
    const key = purchase.purchaseToken ?? purchase.id;
    if (handled.current.has(key)) return;
    handled.current.add(key);
    await finishTransaction({ purchase, isConsumable: true });
    const first = !useSupporterStore.getState().supporter;
    markSupporter();
    Alert.alert('Thank you!', first ? 'Your joystick just turned gold.' : 'Thanks for supporting ROSDeck again.');
  };

  const { connected, products, fetchProducts, requestPurchase, finishTransaction, getAvailablePurchases, availablePurchases } = useIAP({
    onPurchaseSuccess: (p) => { setBusy(null); complete(p).catch(() => {}); },
    onPurchaseError: (e) => {
      setBusy(null);
      if (e.code !== ErrorCode.UserCancelled) Alert.alert('Purchase failed', e.message);
    },
  });

  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: TIP_SKUS, type: 'in-app' }).catch(() => {});
    getAvailablePurchases().catch(() => {});
  }, [connected]);

  useEffect(() => { availablePurchases.forEach((p) => complete(p).catch(() => {})); }, [availablePurchases]);

  const tips = TIP_SKUS.map((id) => products.find((p) => p.id === id)).filter((p) => p != null);

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
        {tips.length === 0 ? (
          <Text style={styles.muted}>{connected ? 'Tips aren’t available right now.' : 'Connecting to Google Play…'}</Text>
        ) : (
          <View style={styles.row}>
            {tips.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.tip, busy !== null && styles.disabled]}
                disabled={busy !== null}
                accessibilityLabel={`Tip ${p.displayPrice}`}
                onPress={() => {
                  setBusy(p.id);
                  requestPurchase({ request: { google: { skus: [p.id] } }, type: 'in-app' }).catch(() => setBusy(null));
                }}
              >
                <Ionicons name={p.id === 'tip_small' ? 'cafe-outline' : p.id === 'tip_medium' ? 'pizza-outline' : 'rocket-outline'} size={18} color={GOLD} />
                <Text style={styles.price}>{p.displayPrice}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
    gap: 12,
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
  row: { flexDirection: 'row', gap: 8 },
  tip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: GOLD + '55',
  },
  disabled: { opacity: 0.4 },
  price: { fontFamily: 'SpaceMono', fontSize: 13, color: theme.colors.textPrimary },
});
