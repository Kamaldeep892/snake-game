# Snake

A responsive Snake game built with plain HTML, CSS and JavaScript. No frameworks, no build step, no server needed.

**Live demo:** https://snake-game-u05y.onrender.com

## Features

- Three difficulty levels: Easy, Medium and Hard
- A separate high score for each level, saved in `localStorage`
- Controls: arrow keys or W A S D on desktop, swipe gestures and an on-screen D-pad on mobile
- Start, Pause, Resume and Restart buttons
- Score and best score display, plus a Game Over screen with your final score
- Smooth snake movement, particle effects, and sound effects generated with the Web Audio API
- Mute button
- Responsive layout for desktop, tablet and phone
- Auto-pause when the tab or app goes to the background

## How to play

| Action | Keyboard | Touch |
|---|---|---|
| Move | Arrow keys or W A S D | Swipe on the board or use the D-pad |
| Start | Enter or the Start game button | Tap the board or Start game |
| Pause / Resume | Space or P | Pause / Resume button |
| Restart | Restart game button | Restart game button |

Eat the berries to grow and score points. The game ends if you hit a wall or your own body.
The difficulty can be changed on the start screen or after a Game Over, but not mid-game.

| Level | Starting speed | Speed-up per food |
|---|---|---|
| Easy | Slow | Gentle |
| Medium | Normal | Moderate |
| Hard | Fast | Quick |

## Run locally

1. Download or clone this repository.
2. Open `index.html` in any modern browser (Chrome, Edge, Firefox or Safari).

That's it. No installation or server is required.

## Project structure

```
snake-game/
├── index.html   # Game structure and UI elements
├── style.css    # Styling, animations and responsive layout
└── script.js    # Game logic, rendering, input, sound and score storage
```

## Customize

- **Difficulty:** edit the `LEVELS` block at the top of `script.js` (`base`, `min` and `speedup` are in milliseconds, so lower numbers mean a faster snake).
- **Board size:** change `COLS` and `ROWS` in `script.js`.
- **Colors:** edit the CSS variables at the top of `style.css` and the `COLORS` object in `script.js`.

## Deploy

The game is a static site, so it works on any static host (Render, GitHub Pages, Netlify, and so on).
On Render: create a **Static Site**, leave the build command empty, and set the publish directory to `.`.

## Notes

High scores are stored in each player's browser, so they are not shared between devices or players.

## License

MIT. Free to use, modify and share.
