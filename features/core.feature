Feature: BiteBoss release-critical flows
  The release baseline must preserve the core user and admin journeys.

  Scenario: Guest browses nearby stores
    Given the app starts without a member login
    When the user opens the challenge tab
    Then nearby stores can be listed
    And store browsing does not require account creation

  Scenario: Member challenges a store
    Given a valid logged-in member is physically near an eligible store
    When presence verification succeeds or the member scans an eligible partner QR
    Then the challenge result is recorded once
    And the current boss, defense state, and player power are refreshed

  Scenario: Crew invitation by QR
    Given a crew leader has an active invitation QR
    When a logged-in member scans the invitation
    Then the invitation preview identifies the crew
    And joining requires an explicit user action

  Scenario: Native build uses the canonical web bundle
    Given the canonical public assets have been changed
    When the release preparation command runs
    Then those assets are synchronized to www
    And native preflight rejects any source drift or missing vendored dependency

  Scenario: Admin pages are excluded from search indexing
    Given a crawler requests an admin page
    Then the page declares noindex nofollow noarchive

  Scenario: Live takeover countdown holds outside the store
    Given a logged-in member starts an eligible store takeover
    When the member remains inside the GPS radius
    Then the full-screen server-synced countdown decreases in real time
    When GPS accuracy degrades or the member leaves the radius
    Then the countdown enters HOLD instead of awarding a claim
    And an extended exit cancels the takeover session

  Scenario: Retake and hot stores surface the next action
    Given the member has lost a previous territory or a nearby store is heavily contested
    When the challenge page loads
    Then a RETAKE or HOT action is shown before the general store list
    And selecting it opens the relevant store detail

  Scenario: Store conquest history is visible
    Given a store has previous boss reigns
    When the store detail opens
    Then the recent boss timeline is displayed in reverse chronological order

  Scenario: Seasonal territory ranking preserves lifetime records
    Given crews have conquered stores during the current season
    When the user opens the season ranking
    Then recent regional conquests are ranked separately
    And permanent store reign history is not reset


  Scenario: Successful takeover starts a 60 minute global cooldown
    Given a member has just become boss of one store
    When the member approaches another store within 60 minutes
    Then a new takeover countdown does not start
    And the challenge page shows the remaining wait time
    And the member can still visit their own occupied store

  Scenario: Admin reviews privacy-minimized total traffic and member access
    Given BiteBoss guest and member clients report privacy-minimized access presence
    When a full admin opens the service status dashboard
    Then current, new, returning, member, and guest visitors are shown separately
    And store owner, PARTNER, PLUS, and PRO access can be compared
    And country, broad region, device, operating system, and browser distributions are visible
    And recent access does not expose GPS coordinates, PINs, or IP addresses
