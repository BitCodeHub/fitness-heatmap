const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://agent_factory_user:yRSBYmtCkuZZPygdY0uqVQkANB3r6PFV@dpg-d5q9v4hr0fns73ddu1jg-a.oregon-postgres.render.com:5432/agent_factory',
    ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

// Initialize database tables
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fitness_daily_stats (
                id SERIAL PRIMARY KEY,
                date DATE UNIQUE NOT NULL,
                steps INTEGER DEFAULT 0,
                distance DECIMAL(10,4) DEFAULT 0,
                calories INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fitness_workouts (
                id VARCHAR(255) PRIMARY KEY,
                type VARCHAR(50),
                name VARCHAR(255),
                location VARCHAR(255),
                workout_date DATE,
                start_time TIMESTAMP,
                end_time TIMESTAMP,
                distance DECIMAL(10,4) DEFAULT 0,
                steps INTEGER DEFAULT 0,
                duration INTEGER DEFAULT 0,
                calories INTEGER DEFAULT 0,
                heart_rate_avg INTEGER,
                heart_rate_max INTEGER,
                route JSONB,
                raw_data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fitness_sync_log (
                id SERIAL PRIMARY KEY,
                synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                payload JSONB
            )
        `);
        
        console.log('Database tables initialized');
    } catch (err) {
        console.error('Database init error:', err);
    }
}

// ============== API ENDPOINTS ==============

// GET /api/health - Get all health data
app.get('/api/health', async (req, res) => {
    try {
        const workouts = await pool.query('SELECT * FROM fitness_workouts ORDER BY workout_date DESC');
        const dailyStats = await pool.query('SELECT * FROM fitness_daily_stats ORDER BY date DESC');
        const lastSync = await pool.query('SELECT synced_at FROM fitness_sync_log ORDER BY synced_at DESC LIMIT 1');
        
        res.json({
            workouts: workouts.rows,
            dailyStats: dailyStats.rows.map(r => ({
                date: r.date.toISOString().split('T')[0],
                steps: parseInt(r.steps),
                distance: parseFloat(r.distance),
                calories: parseInt(r.calories)
            })),
            lastSync: lastSync.rows[0]?.synced_at || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/workouts - Get workouts with optional filters
app.get('/api/workouts', async (req, res) => {
    try {
        let query = 'SELECT * FROM fitness_workouts WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (req.query.type && req.query.type !== 'all') {
            query += ` AND type = $${paramIndex++}`;
            params.push(req.query.type);
        }
        
        if (req.query.from) {
            query += ` AND workout_date >= $${paramIndex++}`;
            params.push(req.query.from);
        }
        
        if (req.query.to) {
            query += ` AND workout_date <= $${paramIndex++}`;
            params.push(req.query.to);
        }
        
        query += ' ORDER BY workout_date DESC';
        
        if (req.query.limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(parseInt(req.query.limit));
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/stats - Get aggregated stats
app.get('/api/stats', async (req, res) => {
    try {
        const dailyStats = await pool.query('SELECT * FROM fitness_daily_stats');
        const workouts = await pool.query('SELECT * FROM fitness_workouts');
        const lastSync = await pool.query('SELECT synced_at FROM fitness_sync_log ORDER BY synced_at DESC LIMIT 1');
        
        const dailyTotals = {
            steps: dailyStats.rows.reduce((sum, d) => sum + parseInt(d.steps || 0), 0),
            distance: dailyStats.rows.reduce((sum, d) => sum + parseFloat(d.distance || 0), 0),
            calories: dailyStats.rows.reduce((sum, d) => sum + parseInt(d.calories || 0), 0)
        };
        
        const workoutTotals = {
            steps: workouts.rows.reduce((sum, w) => sum + parseInt(w.steps || 0), 0),
            distance: workouts.rows.reduce((sum, w) => sum + parseFloat(w.distance || 0), 0),
            calories: workouts.rows.reduce((sum, w) => sum + parseInt(w.calories || 0), 0),
            duration: workouts.rows.reduce((sum, w) => sum + parseInt(w.duration || 0), 0)
        };
        
        const stats = {
            totalWorkouts: workouts.rows.length,
            totalDistance: Math.max(dailyTotals.distance, workoutTotals.distance),
            totalSteps: Math.max(dailyTotals.steps, workoutTotals.steps),
            totalCalories: Math.max(dailyTotals.calories, workoutTotals.calories),
            totalDuration: workoutTotals.duration,
            totalDays: dailyStats.rows.length,
            lastSync: lastSync.rows[0]?.synced_at || null,
            byType: {},
            daily: dailyStats.rows.slice(0, 7).map(r => ({
                date: r.date.toISOString().split('T')[0],
                steps: parseInt(r.steps),
                distance: parseFloat(r.distance),
                calories: parseInt(r.calories)
            }))
        };
        
        workouts.rows.forEach(w => {
            if (!stats.byType[w.type]) {
                stats.byType[w.type] = { count: 0, distance: 0, steps: 0, calories: 0 };
            }
            stats.byType[w.type].count++;
            stats.byType[w.type].distance += parseFloat(w.distance || 0);
            stats.byType[w.type].steps += parseInt(w.steps || 0);
            stats.byType[w.type].calories += parseInt(w.calories || 0);
        });
        
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/daily - Get daily stats
app.get('/api/daily', async (req, res) => {
    try {
        let query = 'SELECT * FROM fitness_daily_stats WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (req.query.from) {
            query += ` AND date >= $${paramIndex++}`;
            params.push(req.query.from);
        }
        
        query += ' ORDER BY date DESC';
        
        const result = await pool.query(query, params);
        res.json(result.rows.map(r => ({
            date: r.date.toISOString().split('T')[0],
            steps: parseInt(r.steps),
            distance: parseFloat(r.distance),
            calories: parseInt(r.calories)
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== WEBHOOK ENDPOINTS ==============

// POST /api/webhook/health - Receive health data from iOS app
app.post('/api/webhook/health', async (req, res) => {
    try {
        console.log('Received health webhook:', new Date().toISOString());
        console.log('Payload keys:', Object.keys(req.body));
        const payload = req.body;
        
        // Log the sync
        await pool.query('INSERT INTO fitness_sync_log (payload) VALUES ($1)', [JSON.stringify(payload)]);
        
        // Handle iOS Shortcuts format (direct values)
        if (payload.steps !== undefined || payload.distance !== undefined || payload.calories !== undefined) {
            const today = new Date().toISOString().split('T')[0];
            const stats = {};
            if (payload.steps) stats.steps = parseInt(payload.steps);
            if (payload.distance) stats.distance = parseFloat(payload.distance);
            if (payload.calories) stats.calories = parseInt(payload.calories);
            if (Object.keys(stats).length > 0) {
                await upsertDailyStat(today, stats);
            }
        }
        
        // Handle iOS Shortcuts workout array
        if (payload.workouts && Array.isArray(payload.workouts)) {
            for (const workout of payload.workouts) {
                await addWorkout(workout);
            }
        }
        
        // Handle daily array format from Shortcuts
        if (payload.daily && Array.isArray(payload.daily)) {
            for (const day of payload.daily) {
                const stats = {};
                if (day.steps) stats.steps = parseInt(day.steps);
                if (day.distance) stats.distance = parseFloat(day.distance);
                if (day.calories) stats.calories = parseInt(day.calories);
                if (Object.keys(stats).length > 0) {
                    await upsertDailyStat(day.date || new Date().toISOString().split('T')[0], stats);
                }
            }
        }
        
        // Process metrics from Health Auto Export format
        if (payload.data && payload.data.metrics) {
            for (const metric of payload.data.metrics) {
                await processMetric(metric);
            }
        }
        
        // Handle other formats
        if (payload.metrics && Array.isArray(payload.metrics)) {
            for (const metric of payload.metrics) {
                await processMetric(metric);
            }
        }
        
        if (payload.workouts && Array.isArray(payload.workouts)) {
            for (const workout of payload.workouts) {
                await addWorkout(workout);
            }
        }
        
        if (payload.data && payload.data.workouts) {
            for (const workout of payload.data.workouts) {
                await addWorkout(workout);
            }
        }
        
        res.json({ success: true, message: 'Data received and stored' });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/webhook/workout - Receive single workout
app.post('/api/webhook/workout', async (req, res) => {
    try {
        console.log('Received workout webhook:', new Date().toISOString());
        await addWorkout(req.body);
        res.json({ success: true, message: 'Workout added' });
    } catch (err) {
        console.error('Workout webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/webhook/meal - Receive food/calorie log from Lumen Vision glasses
app.post('/api/webhook/meal', async (req, res) => {
    try {
        console.log('Received meal webhook:', new Date().toISOString());
        const { timestamp, calories, foods, meal_type } = req.body;
        
        // Log the meal
        await pool.query('INSERT INTO fitness_sync_log (payload) VALUES ($1)', [JSON.stringify(req.body)]);
        
        // Add to daily stats
        const date = new Date(timestamp || Date.now()).toISOString().split('T')[0];
        const existing = await pool.query('SELECT calories FROM fitness_daily_stats WHERE date = $1', [date]);
        
        if (existing.rows.length > 0) {
            const newCalories = parseInt(existing.rows[0].calories) + parseInt(calories);
            await pool.query('UPDATE fitness_daily_stats SET calories = $1 WHERE date = $2', [newCalories, date]);
        } else {
            await pool.query('INSERT INTO fitness_daily_stats (date, calories) VALUES ($1, $2)', [date, calories]);
        }
        
        console.log(`Logged meal: ${foods?.join(', ')} - ${calories} cal (${meal_type})`);
        res.json({ success: true, message: 'Meal logged', totalToday: existing.rows[0]?.calories || calories });
    } catch (err) {
        console.error('Meal webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/workouts/:id - Delete a workout
app.delete('/api/workouts/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM fitness_workouts WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/daily/:date - Delete daily stats
app.delete('/api/daily/:date', async (req, res) => {
    try {
        await pool.query('DELETE FROM fitness_daily_stats WHERE date = $1', [req.params.date]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/debug/sync-logs - See raw sync payloads
app.get('/api/debug/sync-logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        const result = await pool.query(
            'SELECT id, synced_at, payload FROM fitness_sync_log ORDER BY synced_at DESC LIMIT $1',
            [limit]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /shortcut - Setup instructions for iOS Shortcut
app.get('/shortcut', (req, res) => {
    const webhookUrl = `${req.protocol}://${req.get('host')}/api/webhook/health`;
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Fit Map - Shortcut Setup</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0a0a0a; color: #fff; padding: 20px; margin: 0; line-height: 1.6; }
        h1 { color: #ff6b35; font-size: 24px; }
        h2 { color: #888; font-size: 18px; margin-top: 30px; }
        .step { background: #161616; border-radius: 12px; padding: 16px; margin: 12px 0; border-left: 3px solid #ff6b35; }
        .step-num { background: #ff6b35; color: #000; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; margin-right: 8px; }
        code { background: #222; padding: 8px 12px; border-radius: 6px; display: block; margin: 10px 0; word-break: break-all; color: #00d26a; font-size: 13px; }
        .copy-btn { background: #333; border: none; color: #fff; padding: 8px 16px; border-radius: 6px; margin-top: 8px; }
        ul { padding-left: 20px; }
        li { margin: 8px 0; }
        .important { background: #2a1a00; border: 1px solid #ff6b35; border-radius: 8px; padding: 12px; margin: 16px 0; }
    </style>
</head>
<body>
    <h1>📱 Fit Map Shortcut Setup</h1>
    
    <div class="important">
        <strong>Webhook URL (copy this):</strong>
        <code id="webhook">${webhookUrl}</code>
        <button class="copy-btn" onclick="navigator.clipboard.writeText('${webhookUrl}')">📋 Copy URL</button>
    </div>

    <h2>Create the Shortcut</h2>
    
    <div class="step">
        <span class="step-num">1</span> Open <strong>Shortcuts</strong> app → tap <strong>+</strong> → name it "Sync to Fit Map"
    </div>
    
    <div class="step">
        <span class="step-num">2</span> Add action: <strong>Find Health Samples</strong>
        <ul>
            <li>Type: <strong>Step Count</strong></li>
            <li>Start Date: <strong>Start of Today</strong></li>
            <li>End Date: <strong>Now</strong></li>
        </ul>
    </div>
    
    <div class="step">
        <span class="step-num">3</span> Add action: <strong>Get Contents of URL</strong>
        <ul>
            <li>URL: <code style="display:inline; padding:4px 8px;">${webhookUrl}</code></li>
            <li>Method: <strong>POST</strong></li>
            <li>Request Body: <strong>JSON</strong></li>
            <li>Add field: <strong>steps</strong> = Health Samples (from step 2)</li>
        </ul>
    </div>
    
    <div class="step">
        <span class="step-num">4</span> Run the shortcut → grant Health permissions → done!
    </div>

    <h2>Add More Data (Optional)</h2>
    <p>Repeat step 2 for each data type, then add to the JSON body:</p>
    <ul>
        <li><strong>Walking + Running Distance</strong> → field: <code style="display:inline">distance</code></li>
        <li><strong>Active Energy</strong> → field: <code style="display:inline">calories</code></li>
        <li><strong>Workouts</strong> → field: <code style="display:inline">workouts</code></li>
    </ul>

    <h2>Auto-Run (Optional)</h2>
    <p>Automation tab → Time of Day → Hourly → Run "Sync to Fit Map" → disable "Ask Before Running"</p>
    
    <br><br>
    <a href="/" style="color: #ff6b35;">← Back to Fit Map</a>
</body>
</html>
    `);
});

// ============== HELPER FUNCTIONS ==============

async function processMetric(metric) {
    const name = (metric.name || metric.type || '').toLowerCase();
    
    if (metric.data && Array.isArray(metric.data)) {
        // Aggregate by day
        const dailyTotals = {};
        
        metric.data.forEach(reading => {
            let dateStr = reading.date || reading.startDate;
            if (dateStr) {
                const match = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
                if (match) {
                    dateStr = match[1];
                } else {
                    dateStr = new Date().toISOString().split('T')[0];
                }
            } else {
                dateStr = new Date().toISOString().split('T')[0];
            }
            
            if (!dailyTotals[dateStr]) {
                dailyTotals[dateStr] = 0;
            }
            dailyTotals[dateStr] += parseFloat(reading.qty || reading.value || 0);
        });
        
        for (const [date, total] of Object.entries(dailyTotals)) {
            await processMetricValue(name, date, total, metric.units);
        }
    }
}

async function processMetricValue(name, date, value, units) {
    try {
        if (name.includes('step_count') || (name.includes('step') && !name.includes('length'))) {
            await upsertDailyStat(date, { steps: Math.round(value) });
        }
        else if (name.includes('walking_running_distance') || name.includes('distance')) {
            let distanceMiles = parseFloat(value);
            if (units && (units.includes('m') && !units.includes('mi'))) {
                distanceMiles = distanceMiles * 0.000621371;
            }
            await upsertDailyStat(date, { distance: distanceMiles });
        }
        else if (name.includes('energy') || name.includes('calorie')) {
            await upsertDailyStat(date, { calories: Math.round(value) });
        }
    } catch (err) {
        console.error('Error processing metric:', err);
    }
}

async function upsertDailyStat(date, data) {
    const existing = await pool.query('SELECT * FROM fitness_daily_stats WHERE date = $1', [date]);
    
    if (existing.rows.length > 0) {
        const current = existing.rows[0];
        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        if (data.steps !== undefined) {
            const newSteps = Math.max(parseInt(current.steps) || 0, data.steps);
            updates.push(`steps = $${paramIndex++}`);
            values.push(newSteps);
        }
        if (data.distance !== undefined) {
            const newDistance = Math.max(parseFloat(current.distance) || 0, data.distance);
            updates.push(`distance = $${paramIndex++}`);
            values.push(newDistance);
        }
        if (data.calories !== undefined) {
            const newCalories = Math.max(parseInt(current.calories) || 0, data.calories);
            updates.push(`calories = $${paramIndex++}`);
            values.push(newCalories);
        }
        
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(date);
        
        await pool.query(
            `UPDATE fitness_daily_stats SET ${updates.join(', ')} WHERE date = $${paramIndex}`,
            values
        );
    } else {
        await pool.query(
            'INSERT INTO fitness_daily_stats (date, steps, distance, calories) VALUES ($1, $2, $3, $4)',
            [date, data.steps || 0, data.distance || 0, data.calories || 0]
        );
    }
    
    console.log(`Daily stats updated for ${date}`);
}

async function addWorkout(workout) {
    const id = workout.id || `workout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const type = normalizeWorkoutType(workout.type || workout.workoutActivityType);
    
    await pool.query(`
        INSERT INTO fitness_workouts (id, type, name, location, workout_date, distance, steps, duration, calories, route, raw_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            name = EXCLUDED.name,
            distance = EXCLUDED.distance,
            steps = EXCLUDED.steps,
            duration = EXCLUDED.duration,
            calories = EXCLUDED.calories,
            route = EXCLUDED.route
    `, [
        id,
        type,
        workout.name || workout.workoutActivityType || 'Workout',
        workout.location || 'Unknown',
        workout.date || workout.startDate?.split('T')[0] || new Date().toISOString().split('T')[0],
        parseFloat(workout.distance || 0),
        parseInt(workout.steps || 0),
        parseInt(workout.duration || 0),
        parseInt(workout.calories || 0),
        JSON.stringify(workout.route || []),
        JSON.stringify(workout)
    ]);
}

function normalizeWorkoutType(type) {
    if (!type) return 'walk';
    const typeStr = type.toLowerCase();
    if (typeStr.includes('walk')) return 'walk';
    if (typeStr.includes('run') || typeStr.includes('jog')) return 'run';
    if (typeStr.includes('cycl') || typeStr.includes('bike')) return 'cycle';
    if (typeStr.includes('hik')) return 'hike';
    return 'walk';
}

// ============== START SERVER ==============

initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`🏃 Fitness API running on port ${PORT}`);
        console.log(`📊 Dashboard: http://localhost:${PORT}`);
        console.log(`🗄️ Database: PostgreSQL`);
    });
});
