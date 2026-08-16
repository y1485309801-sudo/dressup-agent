# Dressup Agent

AI outfit recommendation agent with wardrobe, weather, calendar, and virtual try-on.

## Current baseline

- Mobile wardrobe interface
- Outfit calendar and inspiration collection
- Jimeng AI virtual try-on proxy
- Approved outfit recommendation Agent design under `docs/superpowers/specs/`

## Local development

```bash
npm install
npm start
```

Open `index.html` in a browser for the current frontend prototype. Configure secrets only through environment variables; never commit `.env` or API credentials.

## Security

Legacy Python test files containing hard-coded credentials are intentionally not migrated. Rotate any previously exposed Volcengine credentials before deploying this repository.
