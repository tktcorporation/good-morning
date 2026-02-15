# Good Morning

iOS alarm app that helps you wake up by completing tasks before dismissing the alarm.

## Tech Stack

- **Expo SDK 54** + **TypeScript** (strict mode)
- **Expo Router** for file-based navigation
- **Zustand** for state management
- **Biome** (Rust-based) for linting and formatting
- **Jest** for testing

## Quick Start

```bash
npm install
npm start
```

Scan the QR code with Expo Go on your iPhone to test instantly.

## Development

```bash
npm run lint        # Run Biome linter
npm run lint:fix    # Auto-fix lint issues
npm run typecheck   # Run TypeScript type checker
npm test            # Run tests
```

## Project Structure

```
app/                  # Expo Router screens
  (tabs)/             # Tab navigation (alarms list, settings)
  alarm/              # Create/edit alarm screens
  wakeup/             # Wake-up screen with todo checklist
src/
  components/         # Reusable UI components
  constants/          # Theme, colors
  services/           # Notifications, sound playback
  stores/             # Zustand state management
  types/              # TypeScript type definitions
  __tests__/          # Unit tests
```

## How It Works

1. Create an alarm with a time and a list of tasks
2. When the alarm fires, a notification plays the alarm sound
3. Opening the app shows the wake-up screen with your task checklist
4. Complete all tasks to dismiss the alarm - sound and vibration continue until done
