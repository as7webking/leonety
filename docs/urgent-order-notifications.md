# Urgent Order Notifications

This is an order-event alert path, not a scheduled reminder or alarm clock.

## Current event path

WooCommerce `order.created` is accepted only after the active connection is found
and the raw-body HMAC signature validates. Leonety inserts a deduplicated
`incoming_order_alert_events` row before attempting push. That row survives push
provider failure. The present implementation records safe order identity/display
metadata; it does not import the complete WooCommerce order or line items into a
canonical order-management table. Do not describe this event receipt as full order
ingestion.

The stored event, in-app alert state, push request state, human acknowledgement,
and provider order status are distinct concepts. Push-service acceptance is not
human receipt. An acknowledgement from one authorized workspace owner/device
updates the shared event and clears scheduled retries for every device.

## Web/PWA behavior

Leonety uses Web Push and the service worker's visible notification. The worker may
provide vibration patterns/actions/badge assets where the browser and OS support
them, and route a click to an authenticated Leonety page. Notification actions are
not consistently available on every platform. These are best-effort hints, not
guarantees. Browser/OS notification settings,
permission, power management, network availability, Focus/DND, silent mode, and
device state remain authoritative. A foreground banner and repeated sound are only
attempted while Leonety is open; autoplay restrictions may prevent sound. No web
implementation promises a continuous ringtone, full-screen alarm, or bypass of
system controls.

The worker favors best-effort vibration and does not request persistent
`requireInteraction` behavior alongside it because the Web Notifications API
options are not freely combinable across browsers. A badge image is supplied where
supported; Leonety does not claim to set a guaranteed numeric OS app badge.

For iOS/iPadOS, Web Push is available only in supported installed web-app contexts
on supported OS versions; ordinary Safari tabs are not represented as equivalent.
The system notification remains subject to user and OS notification settings.
Android and desktop browser delivery similarly depends on the browser, permission,
OS settings and push service. A service worker cannot guarantee delivery to a
locked/offline/power-restricted device.

## Bounded escalation

If workspace order alerts are enabled, the initial push targets every enabled
subscription. The server schedules at most two further attempts: approximately five
minutes after the first attempt and ten minutes after the second (three total).
Acknowledgement, workspace alert disablement, or lack of enabled subscriptions
stops future attempts. A short database claim lease and compare-and-set update
prevent concurrent cron invocations from claiming the same attempt. An already
in-flight push request cannot be recalled after a simultaneous acknowledgement.

The Vercel cron endpoint requires the server-only `CRON_SECRET`, in addition to
configured Web Push VAPID server variables. It must not expose or log those values.
The reviewed migration must be manually applied before deploying code that uses
the new state columns.

Vercel Hobby cron schedules are limited to daily execution, so they cannot meet
these retry intervals. The every-minute schedule requires a Vercel plan that
allows sub-daily cron execution; verify the project's plan before deployment.

## DND

Leonety currently has no separate application-level DND preference for order
alerts. OS-level Focus/Do Not Disturb is not overridden. Suppressing push never
deletes the event or changes the human acknowledgement state.

## Future native delivery

The internal normalized event is the provider-independent extension point for
future device adapters. No APNs or FCM client currently exists.

- iOS normal notifications use user authorization and remain subject to system
  controls. Time Sensitive interruption can be disabled by the user and is not a
  silent-mode bypass. Critical Alerts can ignore mute/DND only for an app with
  Apple's separately granted Critical Alerts entitlement and the correct native
  implementation. Leonety does not have that entitlement.
- Android full-screen intents are tightly restricted on Android 14+ and Google
  Play generally auto-grants them only to alarm/calling core-function apps. Exact
  alarms are also restricted to appropriate core use cases. Leonety must not claim
  restaurant orders qualify or request alarm/call permissions to bypass user
choices. Native design should use normal high-priority user-visible
notifications unless eligibility is independently established.

Official references: [Apple Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [Apple Critical Alerts entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts), [Apple Time Sensitive notifications](https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel/timesensitive), [Android alarm scheduling](https://developer.android.com/develop/background-work/services/alarms), [Google Play full-screen intent restrictions](https://support.google.com/googleplay/android-developer/answer/16558241), [Vercel cron limits and authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Configuration and deployment

- Vercel: configure `CRON_SECRET` and the existing server-only Web Push VAPID
  variables. Vercel cron invokes `/api/cron/order-notification-escalation` each
  minute with bearer authorization.
- Database: manually review/apply
  `supabase/migrations/20261012170000_urgent_order_notification_acknowledgement.sql`
  only after verifying the existing notification tables. It is not executed by
  this task and its production status remains unknown.
