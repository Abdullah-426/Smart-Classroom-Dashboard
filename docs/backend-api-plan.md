# Planned Node-RED API endpoints

## GET /api/telemetry
Returns latest raw telemetry from Wokwi via Node-RED.

## GET /api/dashboard-summary
Returns processed dashboard fields such as:
- roomStatus
- light
- fan
- mode
- collegeHours
- alerts
- temperature
- occupied
- afterHoursAlert
- tempThreshold
- occupancyTimer
- occupancySessions
- estimatedEnergySaved
- highTempWarning

## GET /api/ml
Returns:
- predictedTemp
- slopePerMin
- confidence
- mae
- anomaly
- assist
- statusText

## POST /api/command
Accepts commands like:
- { "mode": "auto" }
- { "light": 1, "mode": "manual" }
- { "fan": 1, "mode": "manual" }
- { "fan": 0, "mode": "manual" }
- { "light": 0, "mode": "manual" }
- { "mode": "auto", "tempThreshold": 26.5 }

## POST /api/ai-report
Temporary placeholder for Phase C.
