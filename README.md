# stem-academy
This is a project to build a stem website to help Cameroonians learn about the US.

## Automated content refresh

- Approved internet sources are configured with `APPROVED_CONTENT_SOURCES` (see `app.env.example`) and validated in `backend/src/content/approvedSources.js`.
- Only HTTPS sources from explicit official allowlist hosts or `.gov` hosts are accepted.
- Refresh is scheduled weekly on **Sunday night (UTC)** using:
  - `CONTENT_REFRESH_SUNDAY_HOUR_UTC`
  - `CONTENT_REFRESH_SUNDAY_MINUTE_UTC`
  - `CONTENT_REFRESH_POLL_MINUTES`
- Runtime refresh orchestration lives in `backend/src/content/refreshService.js` and is started from `backend/src/index.js`.
- New tests from refresh are published directly after validation (`type === test` path in refresh service).
- Instructor notifications are created in-app (`instructor_notifications` table + `/api/users/instructor-notifications`) and can also be delivered by email via `INSTRUCTOR_EMAIL_WEBHOOK_URL`.
