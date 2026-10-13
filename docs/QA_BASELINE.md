# BiteBoss v70.0 Quality Baseline

## Release gate
1. `npm run sync:web`
2. `npm run preflight`
3. `npm test`
4. `npm run mutation`
5. After dependencies are installed: `npm run vendor && npm run preflight:native`
6. For iOS: `npm run sync:ios`, open Xcode, test on a real device.

## Manual QA matrix
- Guest: cold start, store browse/search, ranking browse, support/privacy.
- Member: register/login/logout/delete, avatar edit, nearby refresh, presence challenge, QR challenge, history.
- Crew: create, rename cooldown, avatar, invitation QR create/revoke/join, leave, leader-only controls.
- Store: detail, boss identity, protected/cooldown states, partner benefits, owner/manager flow.
- Push: denied/granted states, production APNs token, preference update, unread/read flow.
- Network: offline startup after prior load, slow network, Supabase error, Kakao import error.
- GPS: denied, low accuracy, movement refresh, background/foreground recovery.
- Responsive: 320/375/390/430/768/1024px widths, portrait + landscape; no horizontal overflow.
- Accessibility: keyboard focus on web, button names, modal close, search accessible name, text zoom 200%, contrast inspection.
- Security: service-role absent client-side; admin/store-admin auth; account deletion authorization; no stack/secrets in API response.

## Quality metrics
- Source syntax failures: 0
- Canonical root/www drift: 0
- Preflight critical failures: 0
- Unit/static tests: 100% pass
- Targeted mutation score: 100%
- Duplicate HTML IDs: 0
- Critical client secrets: 0 service-role keys
- Performance budget: public initial HTML < 30 KB, app.js < 260 KB, styles.css < 250 KB before transfer compression.

## Browser/device acceptance
Automated source tests do not replace real-device checks for GPS, camera QR, APNs, WebView safe-area, keyboard, or App Store lifecycle behavior. Those are release-blocking manual checks.
