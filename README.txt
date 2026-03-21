Smart Classroom Dashboard Starter Pack

This folder is meant for your new separate frontend project.

Folder structure:
- backend-reference/
- frontend/
- docs/

What you should add manually:
1. backend-reference/node-red-flows-full.json
2. backend-reference/node-red-main-flow.json
3. docs/sample-telemetry.json
4. docs/sample-commands.json
5. docs/sample-ml-output.json
6. docs/screenshots/
7. backend-reference/wokwi-code.ino

Recommended architecture:
- Wokwi -> MQTT -> Node-RED
- React/Next.js frontend -> Node-RED HTTP API

Suggested next step:
Open this folder in Cursor and use the prompt files in docs/.
