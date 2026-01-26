# 🏃 Jimmy's Fitness Heat Map

Interactive dashboard to visualize Apple Watch workouts on a world map with heat map overlays.

## Features

- 🗺️ **Interactive World Map** - See all your runs, walks, hikes, and bike rides
- 🔥 **Heat Map Overlay** - Visualize activity intensity across locations
- 📊 **Stats Dashboard** - Total distance, steps, calories, workout count
- 🎚️ **Time Slider** - Filter workouts by date range
- 🏷️ **Activity Filters** - Filter by Walk, Run, Cycle, Hike
- 🌍 **World View** - Zoom out to see all workouts globally
- 🛰️ **Satellite Toggle** - Switch between dark and satellite map views
- 📱 **Workout Cards** - Click to zoom to specific workouts

## How to Export Apple Watch Data

### Option 1: Export from Apple Health (iPhone)

1. Open **Health** app on iPhone
2. Tap your profile picture (top right)
3. Scroll down and tap **Export All Health Data**
4. Wait for export to complete (can take a few minutes)
5. Save/share the `export.zip` file
6. Extract and look for workout route data in the XML

### Option 2: Use HealthFit App (Recommended)

1. Download **HealthFit** from App Store ($2.99)
2. Open the app and grant Health access
3. Tap any workout → Export → GPX
4. Export multiple workouts as GPX files

### Option 3: Use Shortcuts Automation

Create a Shortcut that:
1. Gets workouts from Health
2. Exports route data as JSON
3. Saves to iCloud/Files

## Data Format

The app accepts JSON in this format:

```json
[
  {
    "id": 1,
    "type": "walk",
    "name": "Morning Walk",
    "location": "Garden Grove, CA",
    "date": "2026-01-25",
    "distance": 2.3,
    "steps": 4800,
    "duration": 35,
    "calories": 180,
    "route": [
      [33.7743, -117.9379],
      [33.7750, -117.9360],
      ...
    ]
  }
]
```

### Workout Types
- `walk` - Walking workouts
- `run` - Running workouts  
- `cycle` - Cycling workouts
- `hike` - Hiking workouts

## Local Development

Just open `index.html` in a browser - no build step required!

## Deployment

Deployed on Render as a static site.

---

Built with ❤️ for Jimmy's fitness tracking
