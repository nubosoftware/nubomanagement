# Audit Log — Frontend Implementation Guide

This guide covers the **admin-portal (Vue) changes** that pair with the backend audit-log
improvements already applied to `nubomanagement`. It is written for the frontend developer who
owns `static-src/nubo-admin`.

There are **two** frontend tasks:

1. **Show the acting admin ("Performed by")** in the audit-log table — `Logs.vue`.
2. **Popup notification on admin-portal session timeout** + report it to the backend — `App.vue`.

Both are self-contained; no new libraries are required (uses Vuetify components and the existing
`appUtils` API wrapper already present in the app).

---

## 0. Backend context (already done — no action needed)

For reference, the backend now:

- Added an **`actor`** column to the `events_logs` table (migration `1.5.0.5.103`) that stores the
  **acting admin's email** separately from `email` (the subject/target of the action).
- `GET /api/events` now returns an **`actor`** field on every event, and accepts an optional
  `actor` query param for filtering (same shape as the existing `email` filter).
- Wired audit events into org / user / device / group / platform / plugin / security-settings
  admin operations, each recording the acting admin as `actor`.
- Added a new event type `EV_SESSION_TIMEOUT` and a **report endpoint**:
  `GET /api/auth/sessionTimeout?email=<email>&domain=<domain>`.
  This lives under `/api/auth`, which is **excluded from admin-token validation**, so it is
  reachable by a client whose session has *already* expired.

The response of `GET /api/events` per-event object now looks like:

```json
{
  "eventtype": 5,
  "eventTypeStr": "Edit profile",
  "category": "USER_MANAGEMENT",
  "categoryStr": "User Management",
  "email": "target.user@acme.com",   // subject / target of the action
  "actor": "admin@acme.com",          // NEW - who performed it
  "extrainfo": "Updated user target.user@acme.com details",
  "time": "2026-07-05T10:11:12.000Z",
  "level": "info"
}
```

---

## 1. `Logs.vue` — show the "Performed by" (actor) column

File: `static-src/nubo-admin/src/views/Logs.vue`

The Events table headers are built in the `refreshEvents()` method (near line 466). Add an
**Actor / Performed by** column. The row objects already carry `actor` from the API, so no
data-mapping change is needed.

**Change the `eventsHeaders` assignment** from:

```js
this.eventsHeaders = [
  { text: this.$t("Time"), value: "time" },
  { text: this.$t("Event Type"), value: "eventTypeStr" },
  { text: this.$t("User"), value: "email" },
  { text: this.$t("Information"), value: "extrainfo" },
];
```

to:

```js
this.eventsHeaders = [
  { text: this.$t("Time"), value: "time" },
  { text: this.$t("Event Type"), value: "eventTypeStr" },
  { text: this.$t("Performed by"), value: "actor" },   // NEW - acting admin
  { text: this.$t("Subject"), value: "email" },        // renamed from "User": now the target
  { text: this.$t("Information"), value: "extrainfo" },
];
```

Notes:
- The existing table already uses `:search="eventsSearch"` on all columns, so the new `actor`
  column becomes searchable automatically.
- The `updateContext(...)` block just below builds `recentEvents`. Optionally add the actor there
  too for the assistant/context payload:
  ```js
  recentEvents: this.eventsRows.slice(0, 5).map(event => ({
    time: event.time,
    type: event.eventTypeStr,
    actor: event.actor,   // NEW
    user: event.email,
    info: event.extrainfo
  }))
  ```
- **Optional filter:** if the Events tab later gains a filter bar, `GET /api/events` accepts
  `?actor=<email>` (and `?email=`, `?eventtype=`, `?category=`, `?level=`, `?s=`, `?e=`,
  `?text=`) — see `src/eventLog.js` `getEventsImp`.

---

## 2. `App.vue` — session-timeout popup + backend report

File: `static-src/nubo-admin/src/App.vue`

Today, when the polling loop `checkLoginLoop()` sees an invalid/expired session
(`response.data.status != 1`), it **silently** clears the token and routes to `/Login`
(around lines 262–268). We want to instead show a **popup** telling the admin their session
expired, and **report** the timeout to the backend for the audit log.

### 2a. Add a data flag

In the component `data()` object (near line 165, next to `networkErrorDialog: false`):

```js
networkErrorDialog: false,
sessionTimeoutDialog: false,   // NEW
```

### 2b. Add the dialog markup

In the `<template>`, right after the existing `networkErrorDialog` `<v-dialog>` block
(ends around line 139, just before `</v-app>`), add:

```html
<v-dialog v-model="sessionTimeoutDialog" persistent max-width="400">
  <v-card>
    <v-card-title class="text-h5">
      {{ $t('Session Expired') }}
    </v-card-title>
    <v-card-text>
      {{ $t('Your session has timed out due to inactivity. Please log in again.') }}
    </v-card-text>
    <v-card-actions>
      <v-spacer></v-spacer>
      <v-btn color="primary" @click="onSessionTimeoutConfirm">
        {{ $t('Log In') }}
      </v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>
```

### 2c. Report the timeout, then show the dialog

Replace the **expiry branch** of `checkLoginLoop()` (the `else` at ~lines 262–268):

```js
} else {
  console.log("Login Error");
  console.log(response.data);
  appData.adminLoginToken = "";
  appData.isAuthenticated = false;
  thisPage.$router.push("/Login");
}
```

with:

```js
} else {
  console.log("Login Error - session expired");
  console.log(response.data);
  // Report the timeout for the audit log BEFORE clearing identity (email/domain still known).
  thisPage.reportSessionTimeout();
  appData.adminLoginToken = "";
  appData.isAuthenticated = false;
  // Show the popup instead of a silent redirect; navigation happens on confirm.
  thisPage.sessionTimeoutDialog = true;
}
```

### 2d. Add the two helper methods

In the `methods: { ... }` object add:

```js
reportSessionTimeout: function () {
  // Identity is read from in-memory appData; the server session is already gone.
  // This endpoint lives under /api/auth and does NOT require a valid token.
  try {
    const email = appData.email;
    const domain = appData.mainDomain;
    if (email && domain) {
      appUtils.get({
        url: "api/auth/sessionTimeout?email=" +
          encodeURIComponent(email) + "&domain=" + encodeURIComponent(domain),
      }).catch((e) => { console.log("reportSessionTimeout failed", e); });
    }
  } catch (e) {
    console.log("reportSessionTimeout error", e);
  }
},
onSessionTimeoutConfirm: function () {
  this.sessionTimeoutDialog = false;
  this.$router.push("/Login");
},
```

**Important ordering:** call `reportSessionTimeout()` **before** clearing `appData`.
`appData.logout()` clears `mainDomain` (and could clear `email`), so read `appData.email` /
`appData.mainDomain` while they are still populated. The polling `else` branch above does not call
`logout()`, so this ordering is already safe — just keep the `reportSessionTimeout()` call first.

> Trust note: the report endpoint trusts the client-supplied `email`/`domain` because the server
> session no longer exists at timeout. This is acceptable for an informational audit event; it is
> not an authentication decision. Do not extend this endpoint to perform privileged actions.

### 2e. (Optional) proactive idle timer

The frontend does **not** currently know the session length (`expireSeconds`, default 600s, is set
server-side in `loginWebAdmin`). The implementation above reacts within the existing 10s polling
window, which is sufficient. If you want the popup to appear at the *exact* expiry moment, expose
`expireSeconds` in the admin-login response (`src/ControlPanel/restGet.js` `loginWebAdminAsync`),
persist it in `appData`, and start a client-side `setTimeout` — but this is optional and out of
scope for the complaint.

---

## 3. i18n strings

Add the new keys to **every** locale file under `static-src/nubo-admin/src/locales/`
(at minimum `en.json` and `iw.json`).

`en.json`:

```json
"Performed by": "Performed by",
"Subject": "Subject",
"Session Expired": "Session Expired",
"Your session has timed out due to inactivity. Please log in again.": "Your session has timed out due to inactivity. Please log in again.",
"Log In": "Log In"
```

`iw.json` (Hebrew — adjust wording to match the app's existing tone):

```json
"Performed by": "בוצע על ידי",
"Subject": "נושא",
"Session Expired": "פג תוקף החיבור",
"Your session has timed out due to inactivity. Please log in again.": "החיבור הסתיים עקב חוסר פעילות. יש להתחבר מחדש.",
"Log In": "התחברות"
```

(If the app falls back to the key string when a translation is missing, English will still render
correctly; add the other locales for completeness.)

---

## 4. Build & deploy

The admin portal is built from `static-src/nubo-admin` into `static/html/admin`. After the edits:

```bash
cd static-src/nubo-admin
npm install      # if node_modules is not present
npm run build    # vue-cli build -> outputs to static/html/admin
```

Then verify the bundle is served (mind the trailing-slash behavior on `/html/admin` noted in the
project docs — request the built path, not a stale local copy).

---

## 5. Quick verification checklist

- [ ] Perform an admin action (e.g. edit a user, change a Security setting). Open **Logs → Events**
      and confirm the new **Performed by** column shows the acting admin, distinct from **Subject**.
- [ ] Log in, then let the admin session expire (default 10 min, or shorten `expireSeconds` in the
      org's admin security config for testing). Confirm the **Session Expired** popup appears and
      "Log In" routes to `/Login`.
- [ ] After the timeout, confirm a new **"Admin session timeout"** event appears in **Logs → Events**
      with the correct actor.
- [ ] Confirm the network-error dialog still behaves as before (unchanged).
