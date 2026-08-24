# Frontend worker-skill normalization evidence — 2026-08-24

These three screenshots supplement Figure C14 with frontend evidence from the
current React Worker Profile at `/worker/profile`. Each capture uses an isolated
synthetic Worker account and shows the result after the Skills section was
saved.

- Viewport: 1440×900 at 105% browser zoom.
- Backend: disposable SQLite data using `config.local_sqlite_settings`.
- The temporary capture accounts and their unmatched-review row were deleted
  after capture.
- No passwords, tokens, or real personal data are visible.

| File | Input phrase | Visible result |
|---|---|---|
| `c14a-ghar-ko-wiring-house-wiring.png` | `ghar ko wiring` | Fuzzy normalization to **House Wiring** at 88%, with review controls and the standardized skill saved. |
| `c14b-electric-safety-electrical-safety.png` | `electric safety` | English alias normalization to **Electrical Safety**, with review controls and the standardized skill saved. |
| `c14c-mystery-quantum-repair-unmatched.png` | `mystery quantum repair` | No confident match; the original phrase is visibly retained for administrator review. |

Suggested captions:

1. **Figure C14a —** Romanized Nepali free text is normalized to the House
   Wiring canonical skill, while the Worker can inspect or correct the match.
2. **Figure C14b —** An English alias is normalized to the Electrical Safety
   canonical skill and saved to the Worker profile.
3. **Figure C14c —** An unknown phrase is not silently discarded; it is shown
   to the Worker and queued for taxonomy moderation.
