# STEM Academy
This is a project to build a STEM website to help Cameroonians learn about the US.

## Content refresh policy and instructor summaries

Backend support for internet-backed content refresh is implemented with explicit policy and summary hooks:

- **Approved source allowlist** (`backend/src/content/sourcePolicy.js`)
  - Cameroon Ministry of Secondary Education (`minesec.gov.cm`)
  - Official U.S. school curriculum sources (`*.ed.gov`, `*.k12.*.us`, `*.state.*.us`)
  - Official/approved curriculum book sources (`openstax.org`, `corestandards.org`)
- **Weekly refresh schedule**
  - Runs automatically every **Sunday at 11:00 PM EST (UTC-05:00)** via `startWeeklyRefreshScheduler()`.
  - This is implemented as a fixed EST offset (`UTC-05:00`) year-round to match the explicit requirement.
- **Instructor update summaries**
  - `runContentRefresh()` builds and sends summaries including:
    - test questions added per subject
    - test questions added per topic
    - all material added (by type)
    - other relevant import details and source-allowlist status
  - In-app summary is delivered through the existing messaging channel to instructor roles (admin/tutor).
  - Email summary payload is sent to configured instructors through `INSTRUCTOR_EMAIL_WEBHOOK_URL`.

### Required environment configuration

See `app.env.example`:

- `WEEKLY_REFRESH_ENABLED`
- `WEEKLY_REFRESH_TIMEZONE_LABEL` (defaults to `EST (UTC-05:00)`)
- `INSTRUCTOR_NOTIFICATION_EMAILS` (comma-separated list)
- `INSTRUCTOR_EMAIL_WEBHOOK_URL` (email gateway/webhook endpoint)
