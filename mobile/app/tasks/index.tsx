import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, EmptyState, ErrorState, StatusBadge, SkeletonList } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getTasks, setTaskCompleted } from "@/services/tasks";
import { formatDate } from "@/lib/format";
import type { Task } from "@/types/api";
import { ApiError } from "@/services/api";

// Client-only screen (reachable from Profile) showing tasks/questions the
// bookkeeper has raised, plus anything the client added themselves. Not a
// full agenda/calendar like the bookkeeper's web Tasks page — just an
// upcoming + overdue list with a checkbox, which is what a client account
// actually needs (they don't manage other people's tasks).
function isOverdue(task: Task): boolean {
  if (task.completed) return false;
  const today = new Date().toISOString().split("T")[0];
  return task.date < today;
}

function TaskRow({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const overdue = isOverdue(task);
  const checkScale = useRef(new Animated.Value(1)).current;

  const toggle = async () => {
    // Small "pop" on the checkmark so completing a task reads as a
    // deliberate state change, not an instant swap (section 9).
    Animated.sequence([
      Animated.timing(checkScale, { toValue: 0.7, duration: 80, useNativeDriver: true }),
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 10 }),
    ]).start();
    try {
      await setTaskCompleted(task.id, !task.completed);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch {
      // Silently ignored — the checkbox simply won't flip, and the user
      // can try again; matches the low-ceremony pattern used for the
      // recurring-invoice toggle.
    }
  };

  return (
    <Card style={{ marginBottom: spacing.md, flexDirection: "row", alignItems: "flex-start" }}>
      <Pressable onPress={toggle} hitSlop={8} style={{ marginRight: spacing.md, marginTop: 2 }}>
        <Animated.View style={{ transform: [{ scale: checkScale }] }}>
          <Ionicons
            name={task.completed ? "checkmark-circle" : "ellipse-outline"}
            size={22}
            color={task.completed ? colors.success : colors.textMuted}
          />
        </Animated.View>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text
          style={[typography.body, task.completed && { color: colors.textMuted, textDecorationLine: "line-through" }]}
        >
          {task.title}
        </Text>
        {task.description ? (
          <Text style={[typography.bodyMuted, { marginTop: 2 }]}>{task.description}</Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs }}>
          <Text style={typography.caption}>
            {formatDate(task.date)}
            {task.time ? ` · ${task.time}` : ""}
          </Text>
          {overdue ? <StatusBadge label="Overdue" tone="danger" /> : null}
        </View>
      </View>
    </Card>
  );
}

export default function TasksScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["tasks"],
    queryFn: getTasks,
  });

  const sorted = useMemo(() => {
    if (!data) return [];
    // Open tasks first (overdue, then upcoming by date), completed ones
    // pushed to the bottom — so the list reads as a to-do list, not a log.
    return [...data].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "");
    });
  }, [data]);

  return (
    <Screen>
      <Stack.Screen options={{ title: "Tasks", headerStyle: { backgroundColor: colors.surface } }} />
      {isLoading ? (
        <SkeletonList withTrailing={false} />
      ) : isError ? (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Could not load tasks."}
          onRetry={() => refetch()}
        />
      ) : sorted.length === 0 ? (
        <EmptyState title="No tasks" subtitle="Questions and reminders from your bookkeeper will show up here." />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          showsVerticalScrollIndicator={false}
        >
          {sorted.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
