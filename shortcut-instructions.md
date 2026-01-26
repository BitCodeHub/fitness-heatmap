# 📱 Health Sync Shortcut for Fit Map

## Quick Install (Recommended)

1. On your iPhone, open Safari
2. Go to: `https://fitness-heatmap-n0vq.onrender.com/shortcut`
3. Tap "Get Shortcut" → "Add Shortcut"

---

## Manual Setup (If Quick Install Doesn't Work)

### Step 1: Create New Shortcut
1. Open **Shortcuts** app on iPhone
2. Tap **+** (top right) to create new shortcut
3. Tap the name at top → rename to **"Sync Health to Fit Map"**

### Step 2: Add Health Data Actions

**Get Steps:**
- Tap **+ Add Action**
- Search "Find Health Samples"
- Set Type: **Step Count**
- Set Start Date: **Beginning of Today** (or adjust range)
- Set End Date: **Now**

**Get Distance:**
- Tap **+** below
- Add another "Find Health Samples"
- Set Type: **Walking + Running Distance**
- Same date range

**Get Calories:**
- Tap **+** below
- Add another "Find Health Samples"  
- Set Type: **Active Energy**
- Same date range

### Step 3: Get Workouts with Routes

- Tap **+** below
- Search "Find Health Samples"
- Set Type: **Workouts**
- Enable "Include Route" if available

### Step 4: Build the Data

- Tap **+** below
- Search "Dictionary"
- Add these keys:
  - `steps` → Steps from Step 1
  - `distance` → Distance from Step 2  
  - `calories` → Calories from Step 3
  - `workouts` → Workouts from Step 4

### Step 5: Send to Fit Map

- Tap **+** below
- Search "Get Contents of URL"
- URL: `https://fitness-heatmap-n0vq.onrender.com/api/webhook/health`
- Method: **POST**
- Request Body: **JSON**
- Set body to the Dictionary from Step 4

### Step 6: Save & Test

1. Tap **Done** (top right)
2. Run the shortcut
3. Grant Health permissions when prompted
4. Check Fit Map for your data!

---

## Automation (Auto-Sync Every Hour)

1. Open Shortcuts → **Automation** tab
2. Tap **+** → **Create Personal Automation**
3. Select **Time of Day**
4. Set to repeat **Hourly** (or your preference)
5. Add action: **Run Shortcut** → select "Sync Health to Fit Map"
6. Turn OFF "Ask Before Running"
7. Tap **Done**

Now it syncs automatically!
