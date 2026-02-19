# Travel Advisor v2 Frontend

Static frontend for the Travel Advisor v2 demo.

## Run

Serve this folder with a static server, for example:

```bash
cd frontend
python3 -m http.server 5050
```

Then open:

- `http://localhost:5050/index-dev.html` for DEV backend (`:3002`)
- `http://localhost:5050/index-prod.html` for PROD backend (`:3001`)

Both pages load `travel-advisor-demo-app.jsx` with React + Babel in-browser.
