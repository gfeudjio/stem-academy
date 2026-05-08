# stem-academy
This is a project to build a stem website to help Cameroonians learn about the US.

## Internet-backed educational content updates

The app now supports internet-backed enrichment of quiz/test content:

- Tutors and admins can request content refresh for a quiz key from a topic and optional HTTPS source URL.
- The backend fetches educational source material (default: Wikipedia summary when URL is not provided), then structures supplemental questions with AI.
- Generated content is filtered/validated (schema checks, dedupe, sanitized text, minimum quality constraints) before storage.
- Student-facing quizzes only consume **approved** supplemental content.
- Tutor requests are queued as `pending`; admins can approve/reject in the Admin panel moderation section.
- External fetches are privacy-conscious: personal student data is not sent to internet sources for content updates.

Related environment variables are documented in `app.env.example`:
`CONTENT_UPDATE_ENABLED`, `CONTENT_FETCH_TIMEOUT_MS`, `CONTENT_MAX_SOURCE_CHARS`, `CONTENT_SOURCE_ALLOWLIST`.
