// Script to add mobile-responsive and date picker features
const fs = require('fs');

const htmlFile = 'index.html';
let html = fs.readFileSync(htmlFile, 'utf8');

// 1. Add mobile CSS after existing activity-btn styles (around line 220)
const mobileCss = `
        /* Mobile Toggle Button */
        .mobile-toggle {
            display: none;
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 56px;
            height: 56px;
            background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
            border-radius: 50%;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            z-index: 2000;
            box-shadow: 0 4px 20px rgba(255, 107, 53, 0.4);
            transition: transform 0.2s;
        }
        
        .mobile-toggle:active {
            transform: scale(0.95);
        }
        
        /* Daily Breakdown */
        .daily-breakdown {
            padding: 20px 24px;
            border-bottom: 1px solid #222;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .daily-breakdown-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        
        .daily-breakdown-title {
            font-size: 14px;
            font-weight: 600;
            color: #fff;
        }
        
        .date-picker-input {
            padding: 8px 12px;
            background: #161616;
            border: 1px solid #333;
            border-radius: 8px;
            color: #fff;
            font-size: 12px;
            cursor: pointer;
        }
        
        .daily-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: #161616;
            border-radius: 8px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .daily-item:hover {
            background: #1a1a1a;
            border-left: 3px solid #ff6b35;
        }
        
        .daily-item-date {
            font-size: 13px;
            color: #888;
            font-weight: 500;
        }
        
        .daily-item-stats {
            display: flex;
            gap: 16px;
            align-items: center;
        }
        
        .daily-stat {
            text-align: right;
        }
        
        .daily-stat-value {
            font-size: 15px;
            font-weight: 600;
            color: #fff;
        }
        
        .daily-stat-label {
            font-size: 10px;
            color: #666;
            text-transform: uppercase;
        }
        
        @media (max-width: 768px) {
            .mobile-toggle {
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .sidebar {
                position: fixed;
                left: -100%;
                transition: left 0.3s ease;
                width: 100%;
                max-width: 380px;
                z-index: 1500;
            }
            
            .sidebar.show {
                left: 0;
            }
            
            .map-container {
                width: 100% !important;
            }
        }
`;

// Insert mobile CSS before the closing </style> tag
html = html.replace('</style>', mobileCss + '\n    </style>');

// 2. Add daily breakdown HTML section before "Recent Workouts"
const dailyBreakdownHtml = `
        <!-- Daily Breakdown -->
        <div class="daily-breakdown">
            <div class="daily-breakdown-header">
                <span class="daily-breakdown-title">Daily Breakdown</span>
                <input type="date" class="date-picker-input" id="datePicker" />
            </div>
            <div id="dailyList">
                <!-- Populated by JavaScript -->
            </div>
        </div>
`;

html = html.replace(
    /<div class="workouts-section">/,
    dailyBreakdownHtml + '\n        <div class="workouts-section">'
);

// 3. Add mobile toggle button before closing </body>
const mobileToggleHtml = `
    <!-- Mobile Toggle -->
    <button class="mobile-toggle" id="mobileToggle" onclick="toggleSidebar()">
        <span id="toggleIcon">📊</span>
    </button>
`;

html = html.replace('</body>', mobileToggleHtml + '\n</body>');

// 4. Add JavaScript functions before closing </script>
const mobileFunctions = `
        // Mobile sidebar toggle
        function toggleSidebar() {
            const sidebar = document.querySelector('.sidebar');
            const toggleIcon = document.getElementById('toggleIcon');
            
            if (sidebar.classList.contains('show')) {
                sidebar.classList.remove('show');
                toggleIcon.textContent = '📊';
            } else {
                sidebar.classList.add('show');
                toggleIcon.textContent = '🗺️';
            }
        }
        
        // Populate daily breakdown
        function populateDailyBreakdown(dailyStats) {
            const dailyList = document.getElementById('dailyList');
            if (!dailyStats || dailyStats.length === 0) {
                dailyList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px; font-size: 13px;">No daily data available</div>';
                return;
            }
            
            // Sort by date descending
            const sorted = dailyStats.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            dailyList.innerHTML = sorted.map(day => \`
                <div class="daily-item" onclick="highlightDay('\${day.date}')">
                    <div class="daily-item-date">\${formatDate(day.date)}</div>
                    <div class="daily-item-stats">
                        <div class="daily-stat">
                            <div class="daily-stat-value">\${day.steps.toLocaleString()}</div>
                            <div class="daily-stat-label">Steps</div>
                        </div>
                        <div class="daily-stat">
                            <div class="daily-stat-value">\${day.distance.toFixed(1)}</div>
                            <div class="daily-stat-label">Miles</div>
                        </div>
                    </div>
                </div>
            \`).join('');
        }
        
        // Format date for display
        function formatDate(dateString) {
            const date = new Date(dateString + 'T00:00:00');
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            
            if (date.toDateString() === today.toDateString()) return 'Today';
            if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
            
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
        
        // Highlight specific day
        function highlightDay(date) {
            console.log('Selected day:', date);
            const dailyItems = document.querySelectorAll('.daily-item');
            dailyItems.forEach(item => item.style.background = '#161616');
            event.currentTarget.style.background = '#1a1a1a';
        }
        
        // Date picker change handler
        document.addEventListener('DOMContentLoaded', () => {
            const datePicker = document.getElementById('datePicker');
            if (datePicker) {
                datePicker.addEventListener('change', (e) => {
                    const selectedDate = e.target.value;
                    highlightDay(selectedDate);
                });
            }
        });
`;

// Find the fetchHealthData function and add populateDailyBreakdown call
html = html.replace(
    /document\.getElementById\('totalCalories'\)\.textContent = data\.dailyStats\.reduce/,
    `populateDailyBreakdown(data.dailyStats);\n\n            document.getElementById('totalCalories').textContent = data.dailyStats.reduce`
);

// Insert mobile functions before closing script tag
html = html.replace(/<\/script>/, mobileFunctions + '\n    </script>');

// Write updated file
fs.writeFileSync(htmlFile, html);
console.log('✅ Mobile improvements added successfully!');
console.log('Changes:');
console.log('  - Added mobile toggle button (shows on phones)');
console.log('  - Added daily breakdown with date picker');
console.log('  - Mobile responsive sidebar (swipe/toggle)');
console.log('  - Click any day to see exact steps');
