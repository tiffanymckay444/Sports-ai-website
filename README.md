# SPORTS AI Website V2.2

Polished live dashboard connected to the V24 backend.

## V2.2 fix
- Uses the V24 `matchup` field (`AWAY @ HOME`) as the canonical team-name source.
- Also cross-checks `/api/v24/games` by game ID/external ID.
- Falls back to nested team-name fields when needed.
- Keeps the existing V2.1 design, filters, tracking, and PRO section.

## Upload
Replace these four files in the `Sports-ai-website` GitHub repository:
- `index.html`
- `app.js`
- `styles.css`
- `README.md`

GitHub Pages should continue publishing from `main` / root.
