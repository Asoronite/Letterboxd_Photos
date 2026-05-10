# Letterboxd Photos

A Chrome extension that adds a photo gallery to every Letterboxd film page — movie stills and posters pulled from [TMDB](https://www.themoviedb.org/), so you can see how a film looks before (or after) you watch it.

![Letterboxd Photos extension](icons/icon128.png)

## What it does

- Adds a **photo panel** to the sidebar of every Letterboxd film page
- Shows up to **24 clean movie stills** (no title-card duplicates, no multi-language poster copies)
- Switch between **Stills** and **Posters** tabs
- Navigate with **arrow keys** or on-screen arrows
- Click any photo to open a **full-screen lightbox** with a grid gallery view
- Images are sorted by community rating — best shots first

## Setup

This extension requires a free TMDB API key. TMDB is free for personal and non-commercial use.

1. Create a free account at [themoviedb.org](https://www.themoviedb.org/signup)
2. Go to **Settings → API** and request a Developer key
3. Copy your **API Read Access Token** (the long `eyJ...` token)
4. Click the extension icon in Chrome → paste the token → **Save & Validate**

## Install from source

1. Clone this repo
2. Go to `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the repo folder
5. Follow the setup steps above

## Privacy

Your TMDB API key is stored locally in Chrome storage and never leaves your browser. No data is collected or sent anywhere except directly to the TMDB API.

## Credits

- Film data and images provided by [TMDB](https://www.themoviedb.org/)
- Built for [Letterboxd](https://letterboxd.com/) — this extension is not affiliated with or endorsed by Letterboxd or TMDB

## License

MIT
