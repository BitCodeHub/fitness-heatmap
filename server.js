const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

// Data file path
const DATA_FILE = process.env.DATA_FILE || './health-data.json';

// Initialize data file if doesn't exist
function initDataFile() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            workouts: [],
            dailyStats: [],
            lastSync: null
        }, null, 2));
    }
}

// Read data
function readData() {
    initDataFile();
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// Write data
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ============== API ENDPOINTS ==============

// GET /api/health - Get all health data
app.get('/api/health', (req, res) => {
    try {
        const data = readData();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/workouts - Get workouts with optional filters
app.get('/api/workouts', (req, res) => {
    try {
        const data = readData();
        let workouts = data.workouts || [];
        
        // Filter by type
        if (req.query.type && req.query.type !== 'all') {
            workouts = workouts.filter(w => w.type === req.query.type);
        }
        
        // Filter by date range
        if (req.query.from) {
            const fromDate = new Date(req.query.from);
            workouts = workouts.filter(w => new Date(w.date) >= fromDate);
        }
        
        if (req.query.to) {
            const toDate = new Date(req.query.to);
            workouts = workouts.filter(w => new Date(w.date) <= toDate);
        }
        
        // Sort by date descending
        workouts.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Limit
        if (req.query.limit) {
            workouts = workouts.slice(0, parseInt(req.query.limit));
        }
        
        res.json(workouts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/stats - Get aggregated stats
app.get('/api/stats', (req, res) => {
    try {
        const data = readData();
        const workouts = data.workouts || [];
        
        const stats = {
            totalWorkouts: workouts.length,
            totalDistance: workouts.reduce((sum, w) => sum + (w.distance || 0), 0),
            totalSteps: workouts.reduce((sum, w) => sum + (w.steps || 0), 0),
            totalCalories: workouts.reduce((sum, w) => sum + (w.calories || 0), 0),
            totalDuration: workouts.reduce((sum, w) => sum + (w.duration || 0), 0),
            lastSync: data.lastSync,
            byType: {}
        };
        
        // Stats by type
        workouts.forEach(w => {
            if (!stats.byType[w.type]) {
                stats.byType[w.type] = { count: 0, distance: 0, steps: 0, calories: 0 };
            }
            stats.byType[w.type].count++;
            stats.byType[w.type].distance += w.distance || 0;
            stats.byType[w.type].steps += w.steps || 0;
            stats.byType[w.type].calories += w.calories || 0;
        });
        
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/daily - Get daily stats
app.get('/api/daily', (req, res) => {
    try {
        const data = readData();
        let dailyStats = data.dailyStats || [];
        
        // Filter by date range
        if (req.query.from) {
            const fromDate = new Date(req.query.from);
            dailyStats = dailyStats.filter(d => new Date(d.date) >= fromDate);
        }
        
        // Sort by date
        dailyStats.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.json(dailyStats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== WEBHOOK ENDPOINTS (for Health Auto Export) ==============

// GET /api/debug - See raw incoming data
app.get('/api/debug', (req, res) => {
    try {
        const debugFile = './debug-payloads.json';
        if (fs.existsSync(debugFile)) {
            const payloads = JSON.parse(fs.readFileSync(debugFile, 'utf8'));
            res.json(payloads);
        } else {
            res.json([]);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/webhook/health - Receive health data from iOS app
app.post('/api/webhook/health', (req, res) => {
    try {
        console.log('Received health webhook:', new Date().toISOString());
        const payload = req.body;
        
        // Save raw payload for debugging
        const debugFile = './debug-payloads.json';
        let debugData = [];
        if (fs.existsSync(debugFile)) {
            try { debugData = JSON.parse(fs.readFileSync(debugFile, 'utf8')); } catch(e) {}
        }
        debugData.unshift({ 
            receivedAt: new Date().toISOString(), 
            payload: payload,
            headers: req.headers
        });
        // Keep only last 10 payloads
        debugData = debugData.slice(0, 10);
        fs.writeFileSync(debugFile, JSON.stringify(debugData, null, 2));
        
        const data = readData();
        
        // Health Auto Export sends data in various formats - handle all of them
        
        // Format 1: data.metrics array (Health Auto Export standard)
        if (payload.data && payload.data.metrics) {
            payload.data.metrics.forEach(metric => {
                processMetric(data, metric);
            });
        }
        
        // Format 2: data.workouts array
        if (payload.data && payload.data.workouts) {
            payload.data.workouts.forEach(workout => {
                addWorkout(data, workout);
            });
        }
        
        // Format 3: metrics at root level (array)
        if (payload.metrics && Array.isArray(payload.metrics)) {
            payload.metrics.forEach(metric => {
                processMetric(data, metric);
            });
        }
        
        // Format 4: workouts at root level (array)
        if (payload.workouts && Array.isArray(payload.workouts)) {
            payload.workouts.forEach(workout => {
                addWorkout(data, workout);
            });
        }
        
        // Format 5: Single workout object
        if (payload.workoutActivityType || payload.activityType) {
            addWorkout(data, payload);
        }
        
        // Format 6: Health Auto Export specific format
        if (payload.HKQuantityTypeIdentifierStepCount || payload.stepCount) {
            addDailyStats(data, {
                date: payload.date || payload.startDate?.split('T')[0] || new Date().toISOString().split('T')[0],
                steps: payload.HKQuantityTypeIdentifierStepCount || payload.stepCount || payload.steps
            });
        }
        
        if (payload.HKQuantityTypeIdentifierDistanceWalkingRunning || payload.distanceWalkingRunning) {
            addDailyStats(data, {
                date: payload.date || payload.startDate?.split('T')[0] || new Date().toISOString().split('T')[0],
                distance: payload.HKQuantityTypeIdentifierDistanceWalkingRunning || payload.distanceWalkingRunning || payload.distance
            });
        }
        
        if (payload.HKQuantityTypeIdentifierActiveEnergyBurned || payload.activeEnergyBurned) {
            addDailyStats(data, {
                date: payload.date || payload.startDate?.split('T')[0] || new Date().toISOString().split('T')[0],
                calories: payload.HKQuantityTypeIdentifierActiveEnergyBurned || payload.activeEnergyBurned || payload.calories
            });
        }
        
        // Format 7: Direct steps/distance/calories at root
        if (payload.steps || payload.distance || payload.calories) {
            addDailyStats(data, {
                date: payload.date || new Date().toISOString().split('T')[0],
                steps: payload.steps,
                distance: payload.distance,
                calories: payload.calories
            });
        }
        
        // Format 8: Array at root level (list of metrics or workouts)
        if (Array.isArray(payload)) {
            payload.forEach(item => {
                if (item.workoutActivityType || item.activityType || item.type === 'workout') {
                    addWorkout(data, item);
                } else if (item.name || item.qty || item.value) {
                    processMetric(data, item);
                }
            });
        }
        
        data.lastSync = new Date().toISOString();
        writeData(data);
        
        res.json({ success: true, message: 'Data received' });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/webhook/workout - Receive single workout
app.post('/api/webhook/workout', (req, res) => {
    try {
        console.log('Received workout webhook:', new Date().toISOString());
        const workout = req.body;
        const data = readData();
        
        addWorkout(data, workout);
        data.lastSync = new Date().toISOString();
        writeData(data);
        
        res.json({ success: true, message: 'Workout added', id: workout.id });
    } catch (err) {
        console.error('Workout webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sync - Manual sync endpoint (bulk upload)
app.post('/api/sync', (req, res) => {
    try {
        console.log('Received sync request:', new Date().toISOString());
        const { workouts, dailyStats } = req.body;
        const data = readData();
        
        if (workouts && Array.isArray(workouts)) {
            workouts.forEach(w => addWorkout(data, w));
        }
        
        if (dailyStats && Array.isArray(dailyStats)) {
            dailyStats.forEach(d => addDailyStats(data, d));
        }
        
        data.lastSync = new Date().toISOString();
        writeData(data);
        
        res.json({ 
            success: true, 
            workoutsAdded: workouts?.length || 0,
            dailyStatsAdded: dailyStats?.length || 0
        });
    } catch (err) {
        console.error('Sync error:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/workouts/:id - Delete a workout
app.delete('/api/workouts/:id', (req, res) => {
    try {
        const data = readData();
        const id = req.params.id;
        data.workouts = data.workouts.filter(w => w.id !== id && w.id !== parseInt(id));
        writeData(data);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== HELPER FUNCTIONS ==============

function processMetric(data, metric) {
    const date = metric.date?.split('T')[0] || metric.startDate?.split('T')[0] || new Date().toISOString().split('T')[0];
    const value = metric.qty || metric.value || metric.sum || metric.avg || 0;
    const name = (metric.name || metric.type || metric.identifier || '').toLowerCase();
    
    // Steps
    if (name.includes('step') || name.includes('HKQuantityTypeIdentifierStepCount'.toLowerCase())) {
        addDailyStats(data, { date, steps: value });
    }
    // Distance
    else if (name.includes('distance') || name.includes('HKQuantityTypeIdentifierDistanceWalkingRunning'.toLowerCase())) {
        // Convert meters to miles if needed
        let distanceMiles = parseFloat(value);
        if (distanceMiles > 100) { // Likely meters
            distanceMiles = distanceMiles * 0.000621371;
        }
        addDailyStats(data, { date, distance: distanceMiles });
    }
    // Calories
    else if (name.includes('energy') || name.includes('calorie') || name.includes('HKQuantityTypeIdentifierActiveEnergyBurned'.toLowerCase())) {
        addDailyStats(data, { date, calories: value });
    }
    // Flights climbed
    else if (name.includes('flight') || name.includes('floor')) {
        // Store as additional stat if needed
    }
}

function addWorkout(data, workout) {
    // Normalize workout data
    const normalizedWorkout = {
        id: workout.id || `workout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: normalizeWorkoutType(workout.type || workout.workoutActivityType),
        name: workout.name || workout.workoutActivityType || 'Workout',
        location: workout.location || 'Unknown',
        date: workout.date || workout.startDate?.split('T')[0] || new Date().toISOString().split('T')[0],
        startTime: workout.startDate || workout.startTime,
        endTime: workout.endDate || workout.endTime,
        distance: parseFloat(workout.distance || workout.totalDistance || 0),
        steps: parseInt(workout.steps || workout.stepCount || 0),
        duration: parseInt(workout.duration || workout.totalTime || 0),
        calories: parseInt(workout.calories || workout.activeEnergy || workout.totalEnergyBurned || 0),
        heartRateAvg: workout.heartRateAvg || workout.avgHeartRate,
        heartRateMax: workout.heartRateMax || workout.maxHeartRate,
        route: workout.route || parseRoute(workout),
        rawData: workout
    };
    
    // Check for duplicates
    const existingIndex = data.workouts.findIndex(w => 
        w.id === normalizedWorkout.id || 
        (w.date === normalizedWorkout.date && 
         w.type === normalizedWorkout.type && 
         Math.abs(w.distance - normalizedWorkout.distance) < 0.1)
    );
    
    if (existingIndex >= 0) {
        data.workouts[existingIndex] = normalizedWorkout;
    } else {
        data.workouts.push(normalizedWorkout);
    }
}

function normalizeWorkoutType(type) {
    if (!type) return 'walk';
    const typeStr = type.toLowerCase();
    
    if (typeStr.includes('walk')) return 'walk';
    if (typeStr.includes('run') || typeStr.includes('jog')) return 'run';
    if (typeStr.includes('cycl') || typeStr.includes('bike')) return 'cycle';
    if (typeStr.includes('hik')) return 'hike';
    if (typeStr.includes('swim')) return 'swim';
    
    return 'walk';
}

function parseRoute(workout) {
    if (workout.route && Array.isArray(workout.route)) {
        return workout.route;
    }
    
    // Try to parse from various formats
    if (workout.routeData) {
        try {
            const route = typeof workout.routeData === 'string' 
                ? JSON.parse(workout.routeData) 
                : workout.routeData;
            return route.map(p => [p.lat || p.latitude, p.lon || p.lng || p.longitude]);
        } catch (e) {}
    }
    
    if (workout.locations && Array.isArray(workout.locations)) {
        return workout.locations.map(p => [p.lat || p.latitude, p.lon || p.lng || p.longitude]);
    }
    
    return [];
}

function addDailyStats(data, stats) {
    const date = stats.date || new Date().toISOString().split('T')[0];
    
    let existing = data.dailyStats.find(d => d.date === date);
    if (!existing) {
        existing = { date, steps: 0, distance: 0, calories: 0 };
        data.dailyStats.push(existing);
    }
    
    if (stats.steps) existing.steps = Math.max(existing.steps, parseInt(stats.steps));
    if (stats.distance) existing.distance = Math.max(existing.distance, parseFloat(stats.distance));
    if (stats.calories) existing.calories = Math.max(existing.calories, parseInt(stats.calories));
}

// ============== START SERVER ==============

initDataFile();

app.listen(PORT, () => {
    console.log(`🏃 Fitness API running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔗 Webhook URL: http://localhost:${PORT}/api/webhook/health`);
});
