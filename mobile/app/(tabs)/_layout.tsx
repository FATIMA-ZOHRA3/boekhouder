import { Tabs } from "expo-router";
import { colors } from "@/constants/theme";
import { TabIcon } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// PART 2 fix — role-aware bottom navigation.
//
// Previously this rendered the exact same 5 tabs (Home, Invoices,
// Purchases, Alerts, Profile) for every role, which is the root cause of
// "CLIENT and BOOKKEEPER have almost the same functionality/navigation":
// a bookkeeper's Purchases tab showed only their own (usually empty)
// uploads (GET /api/purchases is always scoped to session.userId), and
// their Home dashboard summed up ALL clients' invoices as if it were
// their own outstanding balance — neither screen reflected what a
// bookkeeper actually does.
//
// Fix: each tab now declares which role(s) it's for via `staffOnly` /
// `clientOnly`. `href: null` is expo-router's supported way to keep a
// route mounted and reachable via router.push() while hiding it from the
// tab bar — so staff-only screens like `clients/` and `accounting/` stay
// completely absent from a client's tab bar (and vice versa for
// `invoices/`/`purchases/` on a bookkeeper's), without needing two
// separate duplicated app shells. `index.tsx` (Home), `notifications.tsx`
// (Alerts) and `profile.tsx` are genuinely shared — same screen, role-
// aware content inside — matching the "use shared components/screens
// when functionality is genuinely shared" instruction.
//
// IMPORTANT: this only controls what's *shown*. Every route this hides
// is still backed by a permission-checked API route server-side (see
// src/lib/permissions.ts) — hiding a tab is UX, not the security
// boundary. See each new screen's own header comment for its guard.
// ---------------------------------------------------------------------------

export default function TabsLayout() {
  const { isStaff } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="home" color={color} size={size} focused={focused} />,
        }}
      />

      {/* Client-only tabs */}
      <Tabs.Screen
        name="invoices"
        options={{
          title: "Invoices",
          href: isStaff ? null : undefined,
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="document-text" color={color} size={size} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="purchases"
        options={{
          title: "Purchases",
          href: isStaff ? null : undefined,
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="cart" color={color} size={size} focused={focused} />,
        }}
      />

      {/* Staff-only tabs */}
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          href: isStaff ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="people" color={color} size={size} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="accounting"
        options={{
          title: "Accounting",
          href: isStaff ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="calculator" color={color} size={size} focused={focused} />,
        }}
      />

      {/* Shared tabs */}
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="notifications" color={color} size={size} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="person-circle" color={color} size={size} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
