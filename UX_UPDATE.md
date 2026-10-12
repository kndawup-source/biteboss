# BiteBoss UX simplification

## User
Home → Scan QR → camera opens immediately → QR recognized → GPS checked automatically → Boss result.

- No separate "start camera" step.
- No token input in the normal flow.
- Bottom navigation reduced to Home / Stores / Rank / Me.
- Home focuses on search, QR scan, nearby stores, and active Boss status.

## Store manager
Primary navigation: Home / Store / QR / Offers.

- Home: current Boss, claims/visits, recent activity, quick actions.
- Store: basic info + photos + menu in one screen.
- Photo: Take Photo opens rear camera; Choose Photo opens library. Selected photo uploads immediately.
- QR: view/copy/regenerate.
- Offers: create and manage Boss offers.
- Staff and separate Boss/Photo/Menu tabs removed from the primary flow.

## Validation
- JavaScript syntax checked for app.js and store-admin.js.
- Duplicate HTML IDs checked for index.html, admin.html, store-admin.html.
- Service worker cache bumped to biteboss-ux-v5.
