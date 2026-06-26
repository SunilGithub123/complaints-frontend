/**
 * Auth route group layout.
 *
 * Sub-routes (`staff-login`, `staff-change-password`, future
 * consumer-landing / consumer-otp) all share: no header chrome, no
 * back button to a parent app shell (these screens ARE the shell when
 * the user is unauthenticated), and a transparent status bar.
 *
 * The group folder name `(auth)` is an expo-router convention — it
 * does NOT appear in the URL. `/staff-login` is the actual route.
 */
import { Stack } from 'expo-router';

export default function AuthLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}

