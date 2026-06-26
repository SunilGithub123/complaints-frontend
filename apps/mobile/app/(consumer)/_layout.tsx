/**
 * Consumer route group. Hosts the unauthenticated complaint-submission
 * flow: landing (`/landing`) → OTP (`/otp`) → submit (`/submit`).
 * Group name `(consumer)` is an expo-router convention — it does NOT
 * appear in URLs.
 *
 * Header-hidden Stack: each consumer screen owns its own back-button
 * affordance ("Use a different Consumer ID", "Start over").
 */
import { Stack } from 'expo-router';

export default function ConsumerLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}

